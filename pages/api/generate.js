export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

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

  try {
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
    console.log("REPLICATE RESPONSE:", JSON.stringify(prediction));

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
    console.log("FINAL OUTPUT URL:", outputUrl);

    return res.status(200).json({ outputUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unexpected server error." });
  }
}
