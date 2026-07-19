import type { DeckQuality } from "../shortcuts";
import type { DeckDensity, DeckPrefs } from "./prefs";

const QUALITY_LABEL: Record<DeckQuality, string> = {
  cinematic: "Cinematic",
  balanced: "Balanced",
  eco: "Eco"
};

/** CR011-P6-01 (CR-011 §E Settings): the compact "Deck" comfort card —
 *  quality tier / density / crisp-text snap. Pure presenter over the
 *  gm-deck-prefs store owned by CommandDeck; instrument-matte material via
 *  additive `gm-deckprefs-*` classes only. */
export function DeckPrefsCard({
  prefs,
  onQuality,
  onDensity,
  onCrispToggle,
  onBigModeToggle
}: {
  prefs: DeckPrefs;
  onQuality: (q: DeckQuality) => void;
  onDensity: (d: DeckDensity) => void;
  onCrispToggle: () => void;
  onBigModeToggle: () => void;
}) {
  return (
    <section className="gm-deckprefs">
      <div className="gm-deckprefs-head">Deck</div>
      <div className="gm-deckprefs-row">
        <span className="gm-deckprefs-label">คุณภาพกราฟิก</span>
        <div className="gm-deckprefs-pills" role="group" aria-label="คุณภาพกราฟิก">
          {(Object.keys(QUALITY_LABEL) as DeckQuality[]).map((q) => (
            <button
              key={q}
              type="button"
              className={`gm-deckprefs-pill${prefs.quality === q ? " active" : ""}`}
              aria-pressed={prefs.quality === q}
              onClick={() => onQuality(q)}
            >
              {QUALITY_LABEL[q]}
            </button>
          ))}
        </div>
      </div>
      <div className="gm-deckprefs-row">
        <span className="gm-deckprefs-label">ความหนาแน่น</span>
        <div className="gm-deckprefs-pills" role="group" aria-label="ความหนาแน่น">
          <button
            type="button"
            className={`gm-deckprefs-pill${prefs.density === "comfortable" ? " active" : ""}`}
            aria-pressed={prefs.density === "comfortable"}
            onClick={() => onDensity("comfortable")}
          >
            สบายตา
          </button>
          <button
            type="button"
            className={`gm-deckprefs-pill${prefs.density === "compact" ? " active" : ""}`}
            aria-pressed={prefs.density === "compact"}
            onClick={() => onDensity("compact")}
          >
            กะทัดรัด
          </button>
        </div>
      </div>
      <div className="gm-deckprefs-row">
        <span className="gm-deckprefs-label">ตัวอักษรคมชัด</span>
        <div className="gm-deckprefs-pills">
          <button
            type="button"
            className={`gm-deckprefs-pill${prefs.crisp ? " active" : ""}`}
            aria-pressed={prefs.crisp}
            onClick={onCrispToggle}
          >
            {prefs.crisp ? "เปิด" : "ปิด"}
          </button>
        </div>
      </div>
      <p className="gm-deckprefs-note">ล็อกสเกลเป็นขั้นเพื่อให้เส้น 1px คม เมื่อย่อหน้าต่าง</p>
      <div className="gm-deckprefs-row">
        <span className="gm-deckprefs-label">โหมดขยายใหญ่</span>
        <div className="gm-deckprefs-pills">
          <button
            type="button"
            className={`gm-deckprefs-pill${prefs.bigMode ? " active" : ""}`}
            aria-pressed={prefs.bigMode}
            onClick={onBigModeToggle}
          >
            {prefs.bigMode ? "เปิด" : "ปิด"}
          </button>
        </div>
      </div>
      <p className="gm-deckprefs-note">ขยายสเกลเกิน 100% เป็นขั้นที่เลือกไว้ (1.15×/1.25×/1.35×/1.5×...) ไม่เกินขอบจอ</p>
    </section>
  );
}
