import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/lib/SiteHeader";
import { BTN } from "@/lib/ui";
import { SECTION_ORDER, SECTION_SHORT, type Section, type TestForm } from "@/lib/sat-forms";
import { FormRowActions } from "./FormRowActions";
import { AttemptRowActions } from "./AttemptRowActions";
import { PageNav } from "./PageNav";
import { ScorecardFilters, type ScorecardFacet } from "./ScorecardFilters";
import {
  DEFAULT_SCORECARDS_VIEW,
  SCORECARD_SIZES,
  STATUS_LABELS,
  hasScorecardFilters,
  parseScorecardsView,
  periodStart,
  scorecardSortDefaultDesc,
  scorecardsUrl,
  scorecardsUrlTemplate,
  type ScorecardSort,
  type ScorecardsView,
} from "./scorecardsUrl";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const view = parseScorecardsView(params);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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

        {tab === "tests" ? (
          <TestsTab sort={one(params.sort)} dir={one(params.dir)} />
        ) : (
          <ScorecardsTab isTutor={isTutor} isAdmin={isAdmin} view={view} />
        )}
      </main>
    </>
  );
}

type ScorecardRow = {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  rw_scaled: number | null;
  math_scaled: number | null;
  total_scaled: number | null;
  error_message: string | null;
  processed_at: string | null;
  student_id: string;
  form_code: string | null;
  profiles: { sort_name: string | null; full_name: string | null } | null;
};

async function ScorecardsTab({ isTutor, isAdmin, view }: { isTutor: boolean; isAdmin: boolean; view: ScorecardsView }) {
  const supabase = await createClient();
  // A student's own list has no chips, so the URL's filters are ignored.
  const v: ScorecardsView = isTutor ? view : { ...DEFAULT_SCORECARDS_VIEW, sort: view.sort, dir: view.dir, page: view.page, size: view.size };
  const desc = v.dir === "desc";
  const filtered = hasScorecardFilters(v);

  // Every row, light, for the chips (RLS already scopes tutors to all
  // students and a student to themselves).
  const facets: ScorecardFacet[] = [];
  if (isTutor) {
    const chunk = 1000;
    for (let start = 0; ; start += chunk) {
      const { data } = await supabase
        .from("attempts")
        .select("id, student_id, form_code, test_name, status, test_date, profiles(sort_name, full_name)")
        .order("test_date", { ascending: false })
        .range(start, start + chunk - 1);
      for (const r of (data ?? []) as unknown as ScorecardRow[]) {
        facets.push({
          id: r.id,
          student_id: r.student_id,
          student_name: r.profiles?.sort_name ?? r.profiles?.full_name ?? "",
          form_code: r.form_code,
          test_name: r.test_name,
          status: r.status,
          test_date: r.test_date,
        });
      }
      if (!data || data.length < chunk) break;
    }
  }

  // The same filters narrow the count and the page. PostgREST refuses a
  // range past the end (a stale page number in the URL) rather than
  // returning an empty page, so the count comes first and the page is
  // clamped to it.
  // Typed loosely on purpose: threading Supabase's builder generics through
  // a helper blows TypeScript's instantiation depth.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withFilters = <Q,>(start: Q): Q => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = start;
    if (v.student.length) q = q.in("student_id", v.student);
    if (v.test.length) {
      // A test chip is a form code, or "name:<MyPractice name>" for a test
      // the scorer hasn't identified.
      const codes = v.test.filter((t) => !t.startsWith("name:"));
      const names = v.test.filter((t) => t.startsWith("name:")).map((t) => t.slice(5));
      const parts: string[] = [];
      if (codes.length) parts.push(`form_code.in.(${codes.map((c) => `"${c}"`).join(",")})`);
      if (names.length) parts.push(`test_name.in.(${names.map((n) => `"${n.replace(/"/g, "")}"`).join(",")})`);
      q = q.or(parts.join(","));
    }
    if (v.status.length) q = q.in("status", v.status);
    if (v.period) q = q.gte("test_date", periodStart(v.period));
    return q as Q;
  };

  const { count } = await withFilters(supabase.from("attempts").select("id", { count: "exact", head: true }));
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / v.size));
  const page = Math.min(v.page, pageCount);
  const from = (page - 1) * v.size;

  let q = withFilters(
    supabase
      .from("attempts")
      .select(
        "id, test_name, test_date, status, rw_scaled, math_scaled, total_scaled, error_message, processed_at, student_id, form_code, profiles(sort_name, full_name)"
      )
  );
  const asc = !desc;
  if (v.sort === "student") q = q.order("profiles(sort_name)", { ascending: asc }).order("test_date", { ascending: false });
  else if (v.sort === "test") q = q.order("test_name", { ascending: asc }).order("test_date", { ascending: false });
  else if (v.sort === "rw") q = q.order("rw_scaled", { ascending: asc, nullsFirst: false }).order("test_date", { ascending: false });
  else if (v.sort === "math") q = q.order("math_scaled", { ascending: asc, nullsFirst: false }).order("test_date", { ascending: false });
  else if (v.sort === "total") q = q.order("total_scaled", { ascending: asc, nullsFirst: false }).order("test_date", { ascending: false });
  else if (v.sort === "processed") q = q.order("processed_at", { ascending: asc, nullsFirst: false });
  else q = q.order("test_date", { ascending: asc }).order("created_at", { ascending: asc });
  const { data } = await q.range(from, from + v.size - 1);
  const rows = (data ?? []) as unknown as ScorecardRow[];

  // Clicking the active column flips direction; any other column starts
  // in its own default direction. Every sort goes back to page 1.
  const sortLink = (key: ScorecardSort) =>
    scorecardsUrl({
      ...v,
      sort: key,
      dir: v.sort === key ? (desc ? "asc" : "desc") : scorecardSortDefaultDesc(key) ? "desc" : "asc",
      page: 1,
    });
  const arrow = (key: ScorecardSort) => (v.sort === key ? (desc ? " ▼" : " ▲") : "");
  const th = (key: ScorecardSort, label: string, align: "left" | "right" = "left") => (
    <th className={`px-3 py-2 text-${align} font-bold whitespace-nowrap${v.sort === key ? " text-brand" : ""}`}>
      <Link href={sortLink(key)} className="hover:text-gray-900">
        {label}
        {arrow(key)}
      </Link>
    </th>
  );

  const countLine =
    total === 0
      ? filtered
        ? "0 tests match these filters."
        : "No practice tests yet. Upload your MyPractice results to get started."
      : rows.length === 0
        ? `Nothing on this page. ${total} test${total === 1 ? "" : "s"}${filtered ? " match the filters" : ""}.`
        : `Showing ${from + 1}–${from + rows.length} of ${total} test${total === 1 ? "" : "s"}${filtered ? " matching the filters" : ""}.`;

  const statusStyle: Record<string, string> = {
    uploaded: "bg-gray-100 text-gray-700",
    processing: "bg-mid-soft text-mid",
    completed: "bg-good-soft text-good",
    failed: "bg-weak-soft text-weak",
  };

  return (
    <div className="mt-6">
      {isTutor && <ScorecardFilters facets={facets} view={v} />}
      <p className="mt-2 text-xs text-gray-500">{countLine}</p>
      {rows.length > 0 && (
        <div className="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                {isTutor && th("student", "Student")}
                {th("test", "Test")}
                {th("date", "Date")}
                {th("rw", "R&W", "right")}
                {th("math", "Math", "right")}
                {th("total", "Total", "right")}
                <th className="px-3 py-2 text-left font-bold">Status</th>
                {th("processed", "Processed on")}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((a) => {
                const href = a.status === "completed" ? `/test/${a.id}` : null;
                const cell = (content: React.ReactNode) => (href ? <Link href={href} className="block">{content}</Link> : content);
                const student = a.profiles?.sort_name ?? a.profiles?.full_name ?? "—";
                const label = `${a.test_name} (${new Date(a.test_date).toLocaleDateString()})${isTutor ? ` for ${a.profiles?.full_name ?? "this student"}` : ""}`;
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    {isTutor && <td className="whitespace-nowrap px-3 py-2">{cell(student)}</td>}
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{href ? <Link href={href} className="block text-brand hover:underline">{a.test_name}</Link> : <span className="text-gray-900">{a.test_name}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{cell(new Date(a.test_date).toLocaleDateString())}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{cell(a.rw_scaled ?? <span className="text-gray-300">—</span>)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{cell(a.math_scaled ?? <span className="text-gray-300">—</span>)}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900">{cell(a.total_scaled || <span className="font-normal text-gray-300">—</span>)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        title={a.status === "failed" ? a.error_message ?? undefined : undefined}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle[a.status] ?? "bg-gray-100 text-gray-700"}`}
                      >
                        {STATUS_LABELS[a.status as keyof typeof STATUS_LABELS] ?? a.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{a.processed_at ? new Date(a.processed_at).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <AttemptRowActions attemptId={a.id} label={label} status={a.status} isAdmin={isAdmin} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 && <PageNav page={page} pageCount={pageCount} size={v.size} sizes={SCORECARD_SIZES} hrefTemplate={scorecardsUrlTemplate(v)} />}
    </div>
  );
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
