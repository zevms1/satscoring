import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemBankRow, TestForm } from "@/lib/sat-forms";

// Server-side loaders shared by the test repository screens. Admin-only:
// anyone else is sent back to the dashboard (RLS would return nothing
// anyway, but a redirect is friendlier than an empty page).

export interface DomainOption {
  code: string;
  section: "RW" | "Math";
  name: string;
  sort_order: number;
}
export interface SkillOption {
  code: string;
  domain_code: string;
  name: string;
  sort_order: number;
}

export async function requireAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") redirect("/dashboard");
  return { supabase, user };
}

export async function loadReference(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: domains }, { data: skills }] = await Promise.all([
    supabase.from("domains").select("code, section, name, sort_order").order("sort_order"),
    supabase.from("skills").select("code, domain_code, name, sort_order").order("sort_order"),
  ]);
  return { domains: (domains ?? []) as DomainOption[], skills: (skills ?? []) as SkillOption[] };
}

export async function loadForm(supabase: Awaited<ReturnType<typeof createClient>>, formCode: string) {
  const [{ data: form }, { data: rows }, { count }] = await Promise.all([
    supabase.from("test_forms").select("form_code, label, notes, created_at, updated_at").eq("form_code", formCode).single(),
    supabase
      .from("item_bank")
      .select("question_key, eqb_id, form_code, section, module, question_number, correct, difficulty, domain_code, skill_code")
      .eq("form_code", formCode)
      .order("section", { ascending: false }) // RW before MA
      .order("module")
      .order("question_number")
      .limit(1000),
    supabase.from("attempts").select("id", { count: "exact", head: true }).eq("form_code", formCode),
  ]);
  return { form: form as TestForm | null, rows: (rows ?? []) as ItemBankRow[], attemptCount: count ?? 0 };
}
