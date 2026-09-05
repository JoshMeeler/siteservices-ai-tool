import { kv } from "@vercel/kv";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const VISITOR_DAILY_LIMIT = 5;
const GLOBAL_DAILY_LIMIT = 200;
const ONE_DAY_SECONDS = 60 * 60 * 25;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

async function incrementWithExpiry(key) {
  const newValue = await kv.incr(key);
  if (newValue === 1) {
    await kv.expire(key, ONE_DAY_SECONDS);
  }
  return newValue;
}

function shopLink(retailer, query) {
  const q = encodeURIComponent(query);
  if (retailer === "Home Depot") return `https://www.homedepot.com/s/${q}`;
  if (retailer === "Lowe's") return `https://www.lowes.com/search?searchTerm=${q}`;
  return `https://www.amazon.com/s?k=${q}`;
}

const MATERIAL_RULES = [
  {
    keywords: ["farmhouse", "siding", "board and batten", "board-and-batten"],
    materials: [
      { name: "Board-and-Batten Vinyl Siding", priceRange: "$3–$8 per sq. ft. installed", retailer: "Home Depot", query: "board and batten siding" },
      { name: "Matte Black Window Trim", priceRange: "$15–$40 per linear ft.", retailer: "Lowe's", query: "black window trim" },
    ],
  },
  {
    keywords: ["roof", "shingle", "shingles"],
    materials: [
      { name: "Architectural Asphalt Shingles", priceRange: "$4–$7 per sq. ft. installed", retailer: "Home Depot", query: "architectural roof shingles" },
      { name: "Roof Ridge Vent", priceRange: "$25–$50 per 4 ft. section", retailer: "Lowe's", query: "roof ridge vent" },
    ],
  },
  {
    keywords: ["landscap", "lawn", "garden", "yard"],
    materials: [
      { name: "Sod / Lawn Turf", priceRange: "$0.30–$0.80 per sq. ft.", retailer: "Lowe's", query: "sod lawn turf" },
      { name: "Paver Walkway Stones", priceRange: "$3–$10 per sq. ft.", retailer: "Home Depot", query: "paver stones walkway" },
    ],
  },
  {
    keywords: ["paint", "color", "red", "blue", "gray", "grey"],
    materials: [
      { name: "Exterior Acrylic Paint (5 gal.)", priceRange: "$120–$220 per 5 gallons", retailer: "Home Depot", query: "exterior acrylic paint" },
    ],
  },
  {
    keywords: ["porch", "deck"],
    materials: [
      { name: "Composite Decking Boards", priceRange: "$4–$12 per sq. ft.", retailer: "Lowe's", query: "composite decking boards" },
    ],
  },
];

const DEFAULT_MATERIALS = [
  { name: "Exterior Caulk & Sealant", priceRange: "$6–$12 per tube", retailer: "Home Depot", query: "exterior caulk sealant" },
];

function getMaterialsForPrompt(prompt) {
  const lower = prompt.toLowerCase();
  const matched = [];

  for (const rule of MATERIAL_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      matched.push(...rule.materials);
    }
  }

  const list = matched.length > 0 ? matched : DEFAULT_MATERIALS;

  return list.map((m) => ({
    ...m,
    link: shopLink(m.retailer, m.query),
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { image, prompt } = req.body;

  if (!image || !prompt) {
    return res.status(400).json({ error: "Missing image or prompt" });
  }

  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: "Server is not configured with an API key yet." });
  }

  const today = getToday();
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const globalKey = `global:${today}`;
  const visitorKey = `visitor:${ip}:${today}`;

  try {
    const globalCount = (await kv.get(globalKey)) || 0;
    if (globalCount >= GLOBAL_DAILY_LIMIT) {
      return res.status(429).json({
        error: "We've hit today's site-wide generation limit. Please try again tomorrow.",
      });
    }

    const visitorCount = (await kv.get(visitorKey)) || 0;
    if (visitorCount >= VISITOR_DAILY_LIMIT) {
      return res.status(429).json({
        error: "You've used all 5 free transformations for today. Come back tomorrow for more!",
      });
    }

    const replicateRes = await fetch(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            input_image: image,
            prompt: prompt,
            aspect_ratio: "match_input_image",
            output_format: "jpg",
            safety_tolerance: 2,
          },
        }),
      }
    );

    const prediction = await replicateRes.json();

    if (!replicateRes.ok) {
      return res.status(500).json({ error: prediction.detail || "Generation failed." });
    }

    let output = prediction.output;
    let status = prediction.status;
    let getUrl = prediction.urls && prediction.urls.get;
    let attempts = 0;

    while (status !== "succeeded" && status !== "failed" && attempts < 20 && getUrl) {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
      });
      const pollData = await pollRes.json();
      status = pollData.status;
      output = pollData.output;
      attempts++;
    }

    if (status === "failed" || !output) {
      return res.status(500).json({ error: "Image generation failed. Try a different photo or prompt." });
    }

    const outputUrl = Array.isArray(output) ? output[0] : output;
    const materials = getMaterialsForPrompt(prompt);

    await incrementWithExpiry(globalKey);
    await incrementWithExpiry(visitorKey);

    return res.status(200).json({ outputUrl, materials });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
