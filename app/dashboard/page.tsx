import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/lib/SiteHeader";
import { BTN } from "@/lib/ui";
import { SECTION_ORDER, SECTION_SHORT, type Section, type TestForm } from "@/lib/sat-forms";
import { AttemptsTable, type AttemptRow } from "./AttemptsTable";
import { FormRowActions } from "./FormRowActions";

// Dashboard split into tabs, mirroring the ACT app: Scorecards (every
// role) and, for admins, the Test repository. A student sees only their
// own scored tests, with no tab bar. The active tab comes from ?tab=.

type Tab = "attempts" | "tests";
const TABS: { key: Tab; label: string }[] = [
  { key: "attempts", label: "Scorecards" },
  { key: "tests", label: "Test repository" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  const role = (ownProfile as { role: string } | null)?.role;
  const isTutor = role !== "student";
  const isAdmin = role === "admin";
  const tab: Tab = isAdmin && TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "attempts";

  return (
    <>
      <SiteHeader email={user?.email ?? null} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {isAdmin ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Admin dashboard</h1>
              <div className="flex flex-wrap gap-3">
                <Link href="/upload" className={BTN.primary}>
                  + Upload a test
                </Link>
                <Link href="/forms/new" className={BTN.secondary}>
                  + New test form
                </Link>
              </div>
            </div>
            <nav className="mt-4 flex flex-wrap gap-1 border-b border-gray-200">
              {TABS.map((t) => (
                <Link
                  key={t.key}
                  href={t.key === "attempts" ? "/dashboard" : `/dashboard?tab=${t.key}`}
                  className={`-mb-px px-4 py-2 text-sm font-medium ${
                    tab === t.key ? "border-b-2 border-brand text-brand" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              {isTutor ? "All practice tests" : "Your practice tests"}
            </h1>
            <Link href="/upload" className={BTN.primary}>
              Upload a new test
            </Link>
          </div>
        )}

        {tab === "tests" ? <TestsTab sort={params.sort} dir={params.dir} /> : <ScorecardsTab isTutor={isTutor} isAdmin={isAdmin} />}
      </main>
    </>
  );
}

async function ScorecardsTab({ isTutor, isAdmin }: { isTutor: boolean; isAdmin: boolean }) {
  const supabase = await createClient();
  // No student_id filter here on purpose -- RLS already scopes this to just
  // the signed-in student's own rows, or every student's rows for a tutor/
  // admin (see is_tutor() in the schema). Tutors get the profiles(full_name)
  // join below so multiple students' tests are distinguishable.
  const { data } = await supabase
    .from("attempts")
    .select(
      "id, test_name, test_date, status, rw_scaled, math_scaled, total_scaled, error_message, processed_at, student_id, profiles(full_name)"
    )
    .order("test_date", { ascending: false });
  const attempts = data as unknown as AttemptRow[] | null;

  if (!attempts || attempts.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
        <p className="text-gray-600">No practice tests yet. Upload your MyPractice results to get started.</p>
      </div>
    );
  }
  return <AttemptsTable attempts={attempts} isTutor={isTutor} canDelete={isAdmin} />;
}

type FormSort = "form" | "attempts" | "added";
const FORM_SORTS: FormSort[] = ["form", "attempts", "added"];

async function TestsTab({ sort, dir }: { sort?: string; dir?: string }) {
  const sortKey: FormSort = FORM_SORTS.includes(sort as FormSort) ? (sort as FormSort) : "form";
  const desc = dir === "desc";
  const supabase = await createClient();
  const [{ data: forms }, { data: bankRows }, { data: attemptRows }] = await Promise.all([
    supabase.from("test_forms").select("form_code, label, notes, created_at, updated_at").order("form_code"),
    // Counts only: one light row per question is well under PostgREST's
    // 1,000-row cap for the forms we have; revisit if the bank passes ~6 forms
    // more than today's eight.
    supabase.from("item_bank").select("form_code, section").limit(5000),
    supabase.from("attempts").select("form_code"),
  ]);

  const questionCounts = new Map<string, Record<Section, number>>();
  for (const r of (bankRows ?? []) as { form_code: string; section: Section }[]) {
    const c = questionCounts.get(r.form_code) ?? { RW: 0, MA: 0 };
    c[r.section] = (c[r.section] ?? 0) + 1;
    questionCounts.set(r.form_code, c);
  }
  const attemptCounts = new Map<string, number>();
  for (const r of (attemptRows ?? []) as { form_code: string | null }[]) {
    if (r.form_code) attemptCounts.set(r.form_code, (attemptCounts.get(r.form_code) ?? 0) + 1);
  }

  const sorted = [...((forms ?? []) as TestForm[])].sort((a, b) => {
    let c = 0;
    if (sortKey === "form") c = a.form_code.localeCompare(b.form_code);
    else if (sortKey === "attempts") c = (attemptCounts.get(a.form_code) ?? 0) - (attemptCounts.get(b.form_code) ?? 0) || a.form_code.localeCompare(b.form_code);
    else c = a.created_at.localeCompare(b.created_at) || a.form_code.localeCompare(b.form_code);
    return desc ? -c : c;
  });

  // Clicking the active column flips direction; any other column starts
  // ascending (newest-first for Added, since that's the useful order).
  const sortLink = (key: FormSort) => {
    const nextDesc = sortKey === key ? !desc : key === "added";
    return `/dashboard?tab=tests&sort=${key}&dir=${nextDesc ? "desc" : "asc"}`;
  };
  const arrow = (key: FormSort) => (sortKey === key ? (desc ? " ▼" : " ▲") : "");
  const th = (key: FormSort, label: string, align: "left" | "right") => (
    <th className={`px-4 py-2 text-${align} font-bold${sortKey === key ? " text-brand" : ""}`}>
      <Link href={sortLink(key)} className="hover:text-gray-900">
        {label}
        {arrow(key)}
      </Link>
    </th>
  );

  return (
    <section className="mt-6">
      <p className="text-sm text-gray-500">
        Every practice-test form the scorer knows: its answer key plus each question&apos;s difficulty, domain and
        skill. Edit a form when College Board changes it, then re-score the tests that use it.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {th("form", "Form", "left")}
              {SECTION_ORDER.map((s) => (
                <th key={s} className="px-4 py-2 text-right font-bold">
                  {SECTION_SHORT[s]}
                </th>
              ))}
              {th("attempts", "Tests", "right")}
              {th("added", "Added", "left")}
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No forms yet. Use &quot;New test form&quot; to add one.
                </td>
              </tr>
            )}
            {sorted.map((f) => {
              const q = questionCounts.get(f.form_code) ?? { RW: 0, MA: 0 };
              const n = attemptCounts.get(f.form_code) ?? 0;
              return (
                <tr key={f.form_code} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/forms/${f.form_code}`} className="font-medium text-brand hover:underline">
                      {f.label}
                    </Link>
                    <span className="ml-2 text-xs text-gray-500">{f.form_code}</span>
                  </td>
                  {SECTION_ORDER.map((s) => (
                    <td key={s} className="px-4 py-2 text-right tabular-nums text-gray-700">
                      {q[s]}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums text-gray-700">{n}</td>
                  <td className="px-4 py-2 text-gray-600">{new Date(f.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <FormRowActions formCode={f.form_code} label={f.label} attemptCount={n} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        R&amp;W and Math count every stored question: Module 1 plus both adaptive Module 2 variants (27 × 3 and 22 × 3
        for a complete form). A form can only be deleted once no scored test uses it.
      </p>
    </section>
  );
}
