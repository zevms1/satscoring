"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isFormCode, questionKey, type ItemBankRow, type Section } from "@/lib/sat-forms";

// Admin-only mutations for the test repository (test_forms + item_bank).
// RLS enforces the admin check too; these re-check so the error is a
// readable message rather than a policy violation.

type Result = { error?: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, error: "Not signed in." } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return { supabase, error: "Only admins can change the test repository." } as const;
  }
  return { supabase, error: undefined } as const;
}

export interface QuestionEdit {
  question_key: string;
  correct: string;
  difficulty: 1 | 2 | 3;
  domain_code: string;
  skill_code: string;
}

function cleanQuestion(q: QuestionEdit, i: number): string | null {
  if (!q.question_key) return `Row ${i + 1}: missing question key.`;
  if (!q.correct || !q.correct.trim()) return `${q.question_key}: correct answer is required.`;
  if (![1, 2, 3].includes(q.difficulty)) return `${q.question_key}: difficulty must be 1, 2 or 3.`;
  if (!q.domain_code) return `${q.question_key}: domain is required.`;
  if (!q.skill_code) return `${q.question_key}: skill is required.`;
  return null;
}

/** Save label/notes and any edited questions for an existing form. */
export async function updateForm(
  formCode: string,
  input: { label: string; notes: string; questions: QuestionEdit[] }
): Promise<Result> {
  const { supabase, error } = await requireAdmin();
  if (error) return { error };

  const label = input.label.trim();
  if (!label) return { error: "The form needs a label." };
  for (const [i, q] of input.questions.entries()) {
    const problem = cleanQuestion(q, i);
    if (problem) return { error: problem };
  }

  const { error: formError } = await supabase
    .from("test_forms")
    .update({ label, notes: input.notes.trim() || null, updated_at: new Date().toISOString() })
    .eq("form_code", formCode);
  if (formError) return { error: `Couldn't save the form: ${formError.message}` };

  for (const q of input.questions) {
    const { error: rowError } = await supabase
      .from("item_bank")
      .update({
        correct: q.correct.trim(),
        difficulty: q.difficulty,
        domain_code: q.domain_code,
        skill_code: q.skill_code,
        updated_at: new Date().toISOString(),
      })
      .eq("question_key", q.question_key)
      .eq("form_code", formCode);
    if (rowError) return { error: `Couldn't save ${q.question_key}: ${rowError.message}` };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/forms/${formCode}`);
  return {};
}

export interface NewQuestion {
  section: Section;
  module: 1 | 2 | 3;
  question_number: number;
  correct: string;
  difficulty: 1 | 2 | 3;
  domain_code: string;
  skill_code: string;
  eqb_id?: string | null;
}

/** Create a brand-new form with all of its questions. */
export async function createForm(input: {
  formCode: string;
  label: string;
  notes: string;
  questions: NewQuestion[];
}): Promise<Result> {
  const { supabase, error } = await requireAdmin();
  if (error) return { error };

  const formCode = input.formCode.trim().toUpperCase();
  if (!isFormCode(formCode)) return { error: "Form code should look like SDB312." };
  const label = input.label.trim();
  if (!label) return { error: "The form needs a label." };
  if (input.questions.length === 0) return { error: "Paste the form's questions first." };

  const seen = new Set<string>();
  const rows: (Omit<ItemBankRow, "difficulty"> & { difficulty: 1 | 2 | 3 })[] = [];
  for (const [i, q] of input.questions.entries()) {
    if (!["RW", "MA"].includes(q.section)) return { error: `Row ${i + 1}: section must be RW or MA.` };
    if (![1, 2, 3].includes(q.module)) return { error: `Row ${i + 1}: module must be 1, 2 or 3.` };
    if (!Number.isInteger(q.question_number) || q.question_number < 1) return { error: `Row ${i + 1}: bad question number.` };
    const key = questionKey(formCode, q.section, q.module, q.question_number);
    if (seen.has(key)) return { error: `Row ${i + 1}: ${q.section} module ${q.module} question ${q.question_number} appears twice.` };
    seen.add(key);
    const problem = cleanQuestion({ question_key: key, ...q }, i);
    if (problem) return { error: problem };
    rows.push({
      question_key: key,
      eqb_id: q.eqb_id?.trim() || null,
      form_code: formCode,
      section: q.section,
      module: q.module,
      question_number: q.question_number,
      correct: q.correct.trim(),
      difficulty: q.difficulty,
      domain_code: q.domain_code,
      skill_code: q.skill_code,
    });
  }

  const { error: formError } = await supabase
    .from("test_forms")
    .insert({ form_code: formCode, label, notes: input.notes.trim() || null });
  if (formError) {
    if (formError.code === "23505") return { error: `A form with code ${formCode} already exists.` };
    return { error: `Couldn't create the form: ${formError.message}` };
  }

  const { error: rowsError } = await supabase.from("item_bank").insert(rows);
  if (rowsError) {
    // Keep the repository consistent: no form without its questions.
    await supabase.from("test_forms").delete().eq("form_code", formCode);
    return { error: `Couldn't save the questions: ${rowsError.message}` };
  }

  revalidatePath("/dashboard");
  return {};
}

/** Delete a form and its questions. Refused while any scored test uses it. */
export async function deleteForm(formCode: string): Promise<Result> {
  const { supabase, error } = await requireAdmin();
  if (error) return { error };

  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("form_code", formCode);
  if ((count ?? 0) > 0) {
    return { error: `${count} scored test${count === 1 ? "" : "s"} use this form. Delete those first.` };
  }

  const { error: deleteError } = await supabase.from("test_forms").delete().eq("form_code", formCode);
  if (deleteError) return { error: `Couldn't delete the form: ${deleteError.message}` };

  revalidatePath("/dashboard");
  return {};
}
