// Shared vocabulary for the item bank / test repository screens.

export type Section = "RW" | "MA";
export const SECTION_ORDER: Section[] = ["RW", "MA"];
export const SECTION_LABELS: Record<Section, string> = { RW: "Reading and Writing", MA: "Math" };
export const SECTION_SHORT: Record<Section, string> = { RW: "R&W", MA: "Math" };
// The domains reference table spells the math section "Math"; the item
// bank (and the parser) use "MA".
export const DOMAIN_SECTION: Record<Section, string> = { RW: "RW", MA: "Math" };

export const MODULES = [1, 2, 3] as const;
export type Module = (typeof MODULES)[number];
// Module 1 is fixed; the second module a student gets is the easier (2)
// or harder (3) adaptive variant, both stored.
export const MODULE_LABELS: Record<Module, string> = {
  1: "Module 1",
  2: "Module 2 (easier)",
  3: "Module 2 (harder)",
};

export const QUESTIONS_PER_MODULE: Record<Section, number> = { RW: 27, MA: 22 };

export const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };

export interface TestForm {
  form_code: string;
  label: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemBankRow {
  question_key: string;
  eqb_id: string | null;
  form_code: string;
  section: Section;
  module: Module;
  question_number: number;
  correct: string;
  difficulty: 1 | 2 | 3 | null;
  domain_code: string | null;
  skill_code: string | null;
}

// "SDB304" -> "SABB.04.01.01.01"-style keys, matching the existing bank:
// SABB.{form 2 digits}.{01 R&W | 02 Math}.{module 2 digits}.{question 2 digits}.
export function questionKey(formCode: string, section: Section, module: number, questionNumber: number): string {
  const formNum = formCode.slice(-2).padStart(2, "0");
  const sec = section === "RW" ? "01" : "02";
  return `SABB.${formNum}.${sec}.${String(module).padStart(2, "0")}.${String(questionNumber).padStart(2, "0")}`;
}

export function isFormCode(s: string): boolean {
  return /^[A-Z]{2,5}\d{2,4}$/.test(s);
}
