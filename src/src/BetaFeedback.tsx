import { useState } from "react";
import { buildDiagnosticBundle, buildFeedback, type BetaReadiness } from "./betaReadiness";

export default function BetaFeedback({ version, channel, readiness, updateStatus }: {
  version: string;
  channel: string;
  readiness: BetaReadiness;
  updateStatus: string;
}) {
  const [category, setCategory] = useState("runtime");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");

  const exportFeedback = () => {
    try {
      const diagnostics = buildDiagnosticBundle({ version, channel, readiness, updateStatus });
      const feedback = buildFeedback({ category, description, diagnostics, consent });
      const url = URL.createObjectURL(new Blob([JSON.stringify(feedback, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `g-maiden-feedback-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("ส่งออก feedback พร้อม diagnostic แล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถส่งออก feedback ได้");
    }
  };

  return <div className="gmad-setup-status">
    <strong>Feedback Wave 0</strong>
    <select aria-label="Feedback category" value={category} onChange={(event) => setCategory(event.target.value)}>
      <option value="runtime">Runtime / crash</option>
      <option value="gsi">GSI / Dota connection</option>
      <option value="vision">Capture / minimap</option>
      <option value="audio">Audio</option>
      <option value="update">Update</option>
      <option value="other">Other</option>
    </select>
    <textarea aria-label="Feedback description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="อธิบายปัญหาหรือผลการทดสอบ" rows={3} />
    <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> ยินยอมแนบ diagnostic ที่ไม่รวม credentials, tokens หรือ raw frames</label>
    <button className="secondary" disabled={!description.trim()} onClick={exportFeedback}>ส่งออก feedback พร้อม evidence</button>
    {message && <span>{message}</span>}
  </div>;
}
