import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/lib/SiteHeader";
import type { Attempt } from "@/lib/types";

type DomainRow = {
  domain_code: string;
  correct: number;
  incorrect: number;
  omitted: number;
  total: number;
  accuracy_pct: number | null;
  domains: { name: string; section: "RW" | "Math"; sort_order: number } | null;
};

type SkillRow = {
  skill_code: string;
  correct: number;
  incorrect: number;
  omitted: number;
  total: number;
  accuracy_pct: number | null;
  skills: {
    name: string;
    sort_order: number;
    domains: { section: "RW" | "Math" } | null;
  } | null;
};

export default async function TestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: attemptData } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", id)
    .single();
  const attempt = attemptData as Attempt | null;

  if (!attempt) notFound();

  if (attempt.status !== "completed") {
    return (
      <>
        <SiteHeader email={user?.email ?? null} />
        <main className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="text-2xl font-semibold text-gray-900">{attempt.test_name}</h1>
          {attempt.status === "failed" ? (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Scoring failed: {attempt.error_message ?? "unknown error"}
            </p>
          ) : (
            <p className="mt-4 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
              Still scoring this test — refresh in a moment.
            </p>
          )}
        </main>
      </>
    );
  }

  const { data: domainResultsData } = await supabase
    .from("domain_results")
    .select("domain_code, correct, incorrect, omitted, total, accuracy_pct, domains(name, section, sort_order)")
    .eq("attempt_id", id);
  const domainResults = domainResultsData as unknown as DomainRow[] | null;

  const { data: skillResultsData } = await supabase
    .from("skill_results")
    .select(
      "skill_code, correct, incorrect, omitted, total, accuracy_pct, skills(name, sort_order, domains(section))"
    )
    .eq("attempt_id", id);
  const skillResults = skillResultsData as unknown as SkillRow[] | null;

  const bySection = (section: "RW" | "Math") => ({
    domains: (domainResults ?? [])
      .filter((d) => d.domains?.section === section)
      .sort((a, b) => (a.domains?.sort_order ?? 0) - (b.domains?.sort_order ?? 0)),
    skills: (skillResults ?? [])
      .filter((s) => s.skills?.domains?.section === section)
      .sort((a, b) => (a.skills?.sort_order ?? 0) - (b.skills?.sort_order ?? 0)),
  });

  return (
    <>
      <SiteHeader email={user?.email ?? null} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900">{attempt.test_name}</h1>
        <p className="text-sm text-gray-500">
          {new Date(attempt.test_date).toLocaleDateString()}
        </p>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <ScoreCard label="Total" value={attempt.total_scaled} />
          <ScoreCard label="Reading & Writing" value={attempt.rw_scaled} />
          <ScoreCard label="Math" value={attempt.math_scaled} />
        </div>

        <SectionBreakdown title="Reading & Writing" {...bySection("RW")} />
        <SectionBreakdown title="Math" {...bySection("Math")} />
      </main>
    </>
  );
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-center">
      <div className="text-3xl font-semibold text-brand">{value ?? "—"}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  );
}

function SectionBreakdown({
  title,
  domains,
  skills,
}: {
  title: string;
  domains: DomainRow[];
  skills: SkillRow[];
}) {
  if (domains.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>

      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <Th>Domain</Th>
              <Th>Correct</Th>
              <Th>Incorrect</Th>
              <Th>Omitted</Th>
              <Th>Accuracy</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {domains.map((d) => (
              <tr key={d.domain_code}>
                <td className="px-4 py-2 font-medium text-gray-900">{d.domains?.name}</td>
                <td className="px-4 py-2 text-gray-600">{d.correct}</td>
                <td className="px-4 py-2 text-gray-600">{d.incorrect}</td>
                <td className="px-4 py-2 text-gray-600">{d.omitted}</td>
                <td className="px-4 py-2 text-gray-600">
                  {d.accuracy_pct != null ? `${d.accuracy_pct}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium text-brand">
          Skill-level detail
        </summary>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Skill</Th>
                <Th>Correct</Th>
                <Th>Incorrect</Th>
                <Th>Omitted</Th>
                <Th>Accuracy</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {skills.map((s) => (
                <tr key={s.skill_code}>
                  <td className="px-4 py-2 font-medium text-gray-900">{s.skills?.name}</td>
                  <td className="px-4 py-2 text-gray-600">{s.correct}</td>
                  <td className="px-4 py-2 text-gray-600">{s.incorrect}</td>
                  <td className="px-4 py-2 text-gray-600">{s.omitted}</td>
                  <td className="px-4 py-2 text-gray-600">
                    {s.accuracy_pct != null ? `${s.accuracy_pct}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </th>
  );
}
