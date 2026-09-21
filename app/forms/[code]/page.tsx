import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/lib/SiteHeader";
import { BTN } from "@/lib/ui";
import { loadForm, loadReference, requireAdminPage } from "@/lib/forms-data";
import { DIFFICULTY_LABELS, MODULES, MODULE_LABELS, SECTION_LABELS, SECTION_ORDER } from "@/lib/sat-forms";

// Read-only view of one practice-test form (Test repository -> View):
// every stored question by section and module with its correct answer,
// difficulty, domain and skill. Admin-only.

export default async function ViewFormPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, user } = await requireAdminPage();
  const [{ form, rows, attemptCount }, { domains, skills }] = await Promise.all([loadForm(supabase, code), loadReference(supabase)]);
  if (!form) notFound();

  const domainName = new Map(domains.map((d) => [d.code, d.name]));
  const skillName = new Map(skills.map((s) => [s.code, s.name]));

  return (
    <>
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/dashboard?tab=tests" className="text-sm font-medium text-brand hover:underline">
          &larr; Back to test repository
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {form.label} <span className="ml-1 text-base font-medium text-gray-500">{form.form_code}</span>
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {rows.length} questions &middot; {attemptCount} scored {attemptCount === 1 ? "test uses" : "tests use"} this form
              &middot; added {new Date(form.created_at).toLocaleDateString()}
            </p>
            {form.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{form.notes}</p>}
          </div>
          <Link href={`/forms/${form.form_code}/edit`} className={BTN.secondary}>
            Edit
          </Link>
        </div>

        {SECTION_ORDER.map((section) => (
          <section key={section} className="mt-8">
            <h2 className="text-lg font-bold text-gray-900">{SECTION_LABELS[section]}</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              {MODULES.map((module) => {
                const qs = rows.filter((r) => r.section === section && r.module === module);
                return (
                  <div key={module} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-600">
                      {MODULE_LABELS[module]} <span className="font-normal text-gray-400">({qs.length})</span>
                    </div>
                    <table className="min-w-full text-xs">
                      <thead className="text-gray-500">
                        <tr>
                          <th className="px-2 py-1 text-right">#</th>
                          <th className="px-2 py-1 text-left">Ans</th>
                          <th className="px-2 py-1 text-left">Diff</th>
                          <th className="px-2 py-1 text-left">Domain</th>
                          <th className="px-2 py-1 text-left">Skill</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {qs.map((q) => (
                          <tr key={q.question_key}>
                            <td className="px-2 py-1 text-right tabular-nums text-gray-500">{q.question_number}</td>
                            <td className="px-2 py-1 font-medium text-gray-900">{q.correct}</td>
                            <td className="px-2 py-1 text-gray-700">{q.difficulty ? DIFFICULTY_LABELS[q.difficulty] : "—"}</td>
                            <td className="px-2 py-1 text-gray-700" title={q.domain_code ? domainName.get(q.domain_code) : undefined}>
                              {q.domain_code ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-gray-700" title={q.skill_code ? skillName.get(q.skill_code) : undefined}>
                              {q.skill_code ?? "—"}
                            </td>
                          </tr>
                        ))}
                        {qs.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-2 py-3 text-center text-gray-400">
                              No questions
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <p className="mt-6 text-xs text-gray-500">Hover a domain or skill code for its full name.</p>
      </main>
    </>
  );
}
