import { useState } from "react";
import { MEDICAL_GROUPS, MEDICAL_SAFETY, PAIN_SCALE } from "./medical";

/** Tap a phrase to send it: the other person sees it as a caption (and as fingerspelling if they sign). */
export default function MedicalBoard({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [group, setGroup] = useState(MEDICAL_GROUPS[0].id);
  const current = MEDICAL_GROUPS.find((g) => g.id === group) ?? MEDICAL_GROUPS[0];
  return (
    <section className="med-board" aria-label="Medical phrases">
      <p className="med-safety" role="note">⚕️ {MEDICAL_SAFETY}</p>
      <div className="med-pain" role="group" aria-label="Pain scale 0 to 10">
        <span className="med-pain-label">Pain now</span>
        {PAIN_SCALE.map((p) => (
          <button key={p.n} type="button" disabled={disabled} onClick={() => onSend(`My pain is ${p.n} out of 10 (${p.label.toLowerCase()})`)} title={p.label}>
            <span aria-hidden="true">{p.face}</span>
            <b>{p.n}</b>
          </button>
        ))}
      </div>
      <div className="med-tabs" role="tablist">
        {MEDICAL_GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={group === g.id ? "on" : ""} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="med-phrases">
        {current.phrases.map((p) => (
          <button key={p.text} type="button" disabled={disabled} className={current.id === "urgent" ? "urgent" : ""} onClick={() => onSend(p.text)}>
            <span aria-hidden="true">{p.icon}</span>
            {p.text}
          </button>
        ))}
      </div>
    </section>
  );
}
