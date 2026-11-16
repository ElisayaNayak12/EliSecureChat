/**
 * Medical mode: short, plain phrases for doctor-patient calls. Each phrase is sent as text, so the Deaf person
 * sees it as a caption and as fingerspelling in their own sign language, and the hearing person can hear it read.
 * Not a certified interpreter: diagnosis, consent and medicines must be confirmed in writing or with a
 * qualified sign language interpreter.
 */
export type MedicalPhrase = { icon: string; text: string };
export type MedicalGroup = { id: string; label: string; phrases: MedicalPhrase[] };

export const PAIN_SCALE: { n: number; face: string; label: string }[] = [
  { n: 0, face: "😀", label: "No pain" },
  { n: 2, face: "🙂", label: "A little" },
  { n: 4, face: "😐", label: "Some" },
  { n: 6, face: "😟", label: "A lot" },
  { n: 8, face: "😣", label: "Very bad" },
  { n: 10, face: "😭", label: "Worst possible" },
];

export const MEDICAL_GROUPS: MedicalGroup[] = [
  {
    id: "urgent",
    label: "Urgent",
    phrases: [
      { icon: "🚨", text: "This is an emergency" },
      { icon: "🫁", text: "I cannot breathe well" },
      { icon: "💔", text: "I have chest pain" },
      { icon: "🩸", text: "I am bleeding" },
      { icon: "😵", text: "I feel faint" },
      { icon: "⚠️", text: "I have a severe allergy" },
    ],
  },
  {
    id: "symptoms",
    label: "Symptoms",
    phrases: [
      { icon: "🌡️", text: "I have a fever" },
      { icon: "🤧", text: "I have a cough or cold" },
      { icon: "🤢", text: "I feel sick, I may vomit" },
      { icon: "💫", text: "I feel dizzy" },
      { icon: "🤕", text: "I have a headache" },
      { icon: "😴", text: "I am very tired" },
      { icon: "🦵", text: "I cannot move part of my body" },
      { icon: "🔥", text: "I have a rash or itching" },
    ],
  },
  {
    id: "body",
    label: "Where it hurts",
    phrases: [
      { icon: "🧠", text: "It hurts in my head" },
      { icon: "👁️", text: "It hurts in my eye" },
      { icon: "👂", text: "It hurts in my ear" },
      { icon: "🦷", text: "It hurts in my mouth or teeth" },
      { icon: "🫀", text: "It hurts in my chest" },
      { icon: "🫃", text: "It hurts in my stomach" },
      { icon: "🔙", text: "It hurts in my back" },
      { icon: "💪", text: "It hurts in my arm" },
      { icon: "🦵", text: "It hurts in my leg" },
    ],
  },
  {
    id: "questions",
    label: "Doctor asks",
    phrases: [
      { icon: "📍", text: "Where does it hurt?" },
      { icon: "⏱️", text: "When did it start?" },
      { icon: "🔢", text: "How bad is the pain, from 0 to 10?" },
      { icon: "💊", text: "Are you taking any medicine?" },
      { icon: "⚠️", text: "Are you allergic to anything?" },
      { icon: "🤰", text: "Could you be pregnant?" },
      { icon: "🍽️", text: "When did you last eat or drink?" },
      { icon: "✍️", text: "Please write it down for me" },
    ],
  },
  {
    id: "answers",
    label: "Answers",
    phrases: [
      { icon: "✅", text: "Yes" },
      { icon: "❌", text: "No" },
      { icon: "🤷", text: "I don't know" },
      { icon: "🔁", text: "Please repeat that" },
      { icon: "🐢", text: "Please go slower" },
      { icon: "✍️", text: "Please write it down" },
      { icon: "🧑‍🦯", text: "I need a sign language interpreter" },
      { icon: "🙏", text: "Thank you" },
    ],
  },
];

export const MEDICAL_SAFETY =
  "Not a certified medical interpreter. For diagnosis, consent and medicines, confirm in writing or with a qualified sign language interpreter.";
