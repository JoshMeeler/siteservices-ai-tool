import { useState } from "react";

const OPTIONS = [
  { label: "Modern Farmhouse Exterior", prompt: "Transform this property's exterior into a modern farmhouse style, with board-and-batten siding, black window frames, and a neutral color palette. Keep the same camera angle, composition, and surroundings." },
  { label: "New Roof + Siding Refresh", prompt: "Give this property a new roof and refreshed exterior siding in a clean, modern style. Keep the same camera angle, composition, and surroundings." },
  { label: "Landscaping Upgrade", prompt: "Add professionally landscaped gardens, a stone walkway, and manicured lawn to this property. Keep the same camera angle, composition, and surroundings." },
  { label: "Custom (type your own)", prompt: "" },
];

export default function Home() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setResultUrl(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1600;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setPreview(resizedDataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!preview) {
      setError("Please upload a photo first.");
      return;
    }
    const prompt =
      optionIndex === OPTIONS.length - 1 ? customPrompt : OPTIONS[optionIndex].prompt;
    if (!prompt) {
      setError("Please describe the transformation you want.");
      return;
    }

    setLoading(true);
    setError(null);
    setResultUrl(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: preview, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setResultUrl(data.outputUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "-apple-system, sans-serif",
        maxWidth: 700,
        margin: "0 auto",
        padding: "32px 20px",
        color: "#1c1c1c",
      }}
    >
      <h1 style={{ color: "#0f4c5c", fontSize: 28, marginBottom: 8 }}>
        See Your Property's Potential
      </h1>
      <p style={{ color: "#555", marginBottom: 28 }}>
        Upload a photo, pick a transformation, and let AI show you the possibilities.
      </p>

      <form onSubmit={handleSubmit}>
        <input type="file" accept="image/*" onChange={handleFileChange} />

        {preview && (
          <img
            src={preview}
            alt="Your upload"
            style={{ width: "100%", borderRadius: 8, marginTop: 16 }}
          />
        )}

        <div style={{ marginTop: 20 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 8 }}>
            Choose a transformation:
          </label>
          <select
            value={optionIndex}
            onChange={(e) => setOptionIndex(Number(e.target.value))}
            style={{ padding: 10, width: "100%", borderRadius: 6, border: "1px solid #ccc" }}
          >
            {OPTIONS.map((opt, i) => (
              <option key={i} value={i}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {optionIndex === OPTIONS.length - 1 && (
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Describe the transformation, e.g. 'Add a wraparound porch and grey shutters'"
            style={{
              width: "100%",
              marginTop: 12,
              padding: 10,
              borderRadius: 6,
              border: "1px solid #ccc",
              minHeight: 80,
            }}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 20,
            background: "#e0a458",
            color: "#1c1c1c",
            border: "none",
            padding: "14px 28px",
            borderRadius: 6,
            fontWeight: 700,
            fontSize: 16,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Generating..." : "Generate Transformation"}
        </button>
      </form>

      {error && <p style={{ color: "#c0392b", marginTop: 16 }}>{error}</p>}

      {resultUrl && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ color: "#0f4c5c", fontSize: 22 }}>Your Result</h2>
          <img
            src={resultUrl}
            alt="AI generated transformation"
            style={{ width: "100%", borderRadius: 8, marginTop: 12 }}
          />
          <p style={{ color: "#777", fontSize: 14, marginTop: 12 }}>
            Materials and pricing links for this transformation are coming in the next
            build phase.
          </p>
        </div>
      )}
    </div>
  );
}
