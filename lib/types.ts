// Mirrors schema.sql. Kept hand-written and minimal rather than generated,
// since the schema is small and stable — regenerate with the Supabase CLI
// (`supabase gen types typescript`) later if it drifts.

export type AttemptStatus = "uploaded" | "processing" | "completed" | "failed";

export interface Attempt {
  id: string;
  student_id: string;
  test_name: string;
  test_date: string;
  form_code: string | null;
  rw_correct: number;
  rw_incorrect: number;
  rw_omitted: number;
  rw_scaled: number | null;
  math_correct: number;
  math_incorrect: number;
  math_omitted: number;
  math_scaled: number | null;
  total_scaled: number;
  source_html_path: string | null;
  source_pdf_path: string | null;
  report_html_path: string | null;
  report_json_path: string | null;
  status: AttemptStatus;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface DomainResult {
  id: string;
  attempt_id: string;
  domain_code: string;
  correct: number;
  incorrect: number;
  omitted: number;
  total: number;
  accuracy_pct: number | null;
}

export interface SkillResult {
  id: string;
  attempt_id: string;
  skill_code: string;
  correct: number;
  incorrect: number;
  omitted: number;
  total: number;
  accuracy_pct: number | null;
}

export interface Domain {
  code: string;
  section: "RW" | "Math";
  name: string;
  sort_order: number;
}

export interface Skill {
  code: string;
  domain_code: string;
  name: string;
  sort_order: number;
}
