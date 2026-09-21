"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN } from "@/lib/ui";
import type { DomainOption, SkillOption } from "@/lib/forms-data";
import { DIFFICULTY_LABELS, DOMAIN_SECTION, MODULES, MODULE_LABELS, SECTION_LABELS, SECTION_ORDER, type ItemBankRow, type TestForm } from "@/lib/sat-forms";
import { updateForm, type QuestionEdit } from "@/app/forms/actions";
import { rescoreAttempt } from "@/app/dashboard/actions";

export interface AttemptSummary {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  profiles: { full_name: string | null } | null;
}

type Draft = { correct: string; difficulty: 1 | 2 | 3; domain_code: string; skill_code: string };

export function EditFormClient({
  form,
  rows,
  domains,
  skills,
  attempts,
}: {
  form: TestForm;
  rows: ItemBankRow[];
  domains: DomainOption[];
  skills: SkillOption[];
  attempts: AttemptSummary[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState(form.label);
  const [notes, setNotes] = useState(form.notes ?? "");
  const initial = useMemo(() => {
    const m = new Map<string, Draft>();
    for (const r of rows) {
      m.set(r.question_key, { correct: r.correct, difficulty: (r.difficulty ?? 2) as 1 | 2 | 3, domain_code: r.domain_code ?? "", skill_code: r.skill_code ?? "" });
    }
    return m;
  }, [rows]);
  const [drafts, setDrafts] = useState<Map<string, Draft>>(() => new Map(initial));
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [savedOnce, setSavedOnce] = useState(false);

  // Re-score progress: index of the attempt being scored, plus any failures.
  const [rescore, setRescore] = useState<{ running: boolean; done: number; failed: string[] } | null>(null);

  const changedKeys = useMemo(() => {
    const out: string[] = [];
    for (const [key, d] of drafts) {
      const o = initial.get(key)!;
      if (d.correct !== o.correct || d.difficulty !== o.difficulty || d.domain_code !== o.domain_code || d.skill_code !== o.skill_code) out.push(key);
    }
    return out;
  }, [drafts, initial]);
  const metaChanged = label !== form.label || notes !== (form.notes ?? "");
  const dirty = changedKeys.length > 0 || metaChanged;

  function setDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const next = new Map(prev);
      const cur = next.get(key)!;
      const merged = { ...cur, ...patch };
      // A domain change invalidates a skill from another domain.
      if (patch.domain_code !== undefined && merged.skill_code) {
        const sk = skills.find((s) => s.code === merged.skill_code);
        if (!sk || sk.domain_code !== merged.domain_code) merged.skill_code = "";
      }
      next.set(key, merged);
      return next;
    });
  }

  function save() {
    setMessage(null);
    const questions: QuestionEdit[] = changedKeys.map((key) => ({ question_key: key, ...drafts.get(key)! }));
    startTransition(async () => {
      const result = await updateForm(form.form_code, { label, notes, questions });
      if (result.error) {
        setMessage({ kind: "error", text: result.error });
        return;
      }
      setSavedOnce(true);
      setMessage({
        kind: "ok",
        text:
          attempts.length > 0
            ? `Saved ${changedKeys.length} question change${changedKeys.length === 1 ? "" : "s"}. ${attempts.length} scored test${attempts.length === 1 ? "" : "s"} use this form; re-score them below so their reports reflect the change.`
            : `Saved ${changedKeys.length} question change${changedKeys.length === 1 ? "" : "s"}.`,
      });
      router.refresh();
    });
  }

  async function rescoreAll() {
    setRescore({ running: true, done: 0, failed: [] });
    const failed: string[] = [];
    // One at a time: each run takes a few seconds and the scorer is a
    // single serverless function, so a burst would just queue up anyway.
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      const result = await rescoreAttempt(a.id);
      if (result.error) failed.push(`${a.profiles?.full_name ?? "Student"} · ${a.test_name} (${new Date(a.test_date).toLocaleDateString()}): ${result.error}`);
      setRescore({ running: true, done: i + 1, failed: [...failed] });
    }
    setRescore({ running: false, done: attempts.length, failed });
    router.refresh();
  }

  const domainsFor = (section: "RW" | "MA") => domains.filter((d) => d.section === DOMAIN_SECTION[section]);
  const skillsFor = (domainCode: string) => skills.filter((s) => s.domain_code === domainCode);

  return (
    <div className="mt-6 space-y-8">
      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <span className="mt-1 block text-xs text-gray-500">Shown in the repository. Reports use the test name from MyPractice.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Difficulty updated by College Board, Sept 2026" />
        </label>
      </div>

      {SECTION_ORDER.map((section) => (
        <section key={section}>
          <h2 className="text-lg font-bold text-gray-900">{SECTION_LABELS[section]}</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            {MODULES.map((module) => {
              const qs = rows.filter((r) => r.section === section && r.module === module);
              return (
                <div key={module} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-600">
                    {MODULE_LABELS[module]}
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
                      {qs.map((q) => {
                        const d = drafts.get(q.question_key)!;
                        const changed = changedKeys.includes(q.question_key);
                        return (
                          <tr key={q.question_key} className={changed ? "bg-mid-soft/60" : undefined}>
                            <td className="px-2 py-1 text-right tabular-nums text-gray-500">{q.question_number}</td>
                            <td className="px-1 py-1">
                              <input
                                value={d.correct}
                                onChange={(e) => setDraft(q.question_key, { correct: e.target.value })}
                                className="w-16 rounded border border-gray-300 px-1 py-0.5 text-xs"
                                aria-label={`Correct answer, question ${q.question_number}`}
                              />
                            </td>
                            <td className="px-1 py-1">
                              <select
                                value={d.difficulty}
                                onChange={(e) => setDraft(q.question_key, { difficulty: Number(e.target.value) as 1 | 2 | 3 })}
                                className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                                aria-label={`Difficulty, question ${q.question_number}`}
                              >
                                {([1, 2, 3] as const).map((n) => (
                                  <option key={n} value={n}>
                                    {DIFFICULTY_LABELS[n]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select
                                value={d.domain_code}
                                onChange={(e) => setDraft(q.question_key, { domain_code: e.target.value })}
                                className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                                aria-label={`Domain, question ${q.question_number}`}
                              >
                                <option value="">—</option>
                                {domainsFor(section).map((o) => (
                                  <option key={o.code} value={o.code} title={o.name}>
                                    {o.code}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-1 py-1">
                              <select
                                value={d.skill_code}
                                onChange={(e) => setDraft(q.question_key, { skill_code: e.target.value })}
                                className="rounded border border-gray-300 px-1 py-0.5 text-xs"
                                aria-label={`Skill, question ${q.question_number}`}
                              >
                                <option value="">—</option>
                                {skillsFor(d.domain_code).map((o) => (
                                  <option key={o.code} value={o.code} title={o.name}>
                                    {o.code}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-600">
            {message ? (
              <span className={message.kind === "error" ? "text-weak" : "text-good"}>{message.text}</span>
            ) : dirty ? (
              <span>
                {changedKeys.length} question{changedKeys.length === 1 ? "" : "s"} changed{metaChanged ? ", plus label/notes" : ""}. Changed rows are highlighted.
              </span>
            ) : (
              <span>No unsaved changes.</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {attempts.length > 0 && (
              <button
                type="button"
                onClick={rescoreAll}
                disabled={isPending || dirty || rescore?.running}
                title={dirty ? "Save first" : undefined}
                className={savedOnce ? BTN.primary : BTN.secondary}
              >
                {rescore?.running
                  ? `Re-scoring ${rescore.done} of ${attempts.length}…`
                  : `Re-score ${attempts.length} test${attempts.length === 1 ? "" : "s"}`}
              </button>
            )}
            <button type="button" onClick={save} disabled={!dirty || isPending || rescore?.running} className={BTN.primary}>
              {isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
        {rescore && !rescore.running && (
          <div className="mx-auto mt-2 max-w-5xl text-sm">
            {rescore.failed.length === 0 ? (
              <span className="text-good">All {rescore.done} tests re-scored.</span>
            ) : (
              <div className="text-weak">
                {rescore.done - rescore.failed.length} re-scored, {rescore.failed.length} failed:
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {rescore.failed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
