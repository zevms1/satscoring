"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BTN } from "@/lib/ui";
import type { DomainOption, SkillOption } from "@/lib/forms-data";
import { DIFFICULTY_LABELS, DOMAIN_SECTION, MODULES, MODULE_LABELS, QUESTIONS_PER_MODULE, SECTION_LABELS, SECTION_ORDER, type Section } from "@/lib/sat-forms";
import { createForm, type NewQuestion } from "@/app/forms/actions";

// Accepts either the short shape
//   Section, Module, Question #, Correct, Difficulty, Domain, Skill [, EQB_ID]
// or the item-bank sheet's shape
//   QuestionKey, EQB_ID, FormCode, Section, Module, QuestionNumber, Correct, Difficulty, Domain, Skill, ...
// separated by tabs (spreadsheet paste) or commas, with or without a header
// row. "Math" is accepted for the math section as well as "MA".

type Parsed = { ok: NewQuestion[]; errors: string[] };

function splitLine(line: string): string[] {
  const sep = line.includes("\t") ? "\t" : ",";
  return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
}

function parseRows(text: string, domains: DomainOption[], skills: SkillOption[]): Parsed {
  const ok: NewQuestion[] = [];
  const errors: string[] = [];
  const domainByCode = new Map(domains.map((d) => [d.code, d]));
  const skillByCode = new Map(skills.map((s) => [s.code, s]));
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = splitLine(line);
    const n = i + 1;
    const first = cells[0]?.toUpperCase();
    if (first === "SECTION" || first === "QUESTIONKEY") return; // header row
    let sec: string, mod: string, qn: string, correct: string, diff: string, dom: string, skill: string, eqb: string | undefined;
    if (cells.length >= 10 && /^[A-Z]{2,5}\.\d/.test(cells[0])) {
      [, eqb, , sec, mod, qn, correct, diff, dom, skill] = cells;
    } else if (cells.length >= 7) {
      [sec, mod, qn, correct, diff, dom, skill, eqb] = cells;
    } else {
      errors.push(`Line ${n}: expected at least 7 columns, got ${cells.length}.`);
      return;
    }
    const section = sec.toUpperCase() === "MATH" ? "MA" : (sec.toUpperCase() as Section);
    if (section !== "RW" && section !== "MA") {
      errors.push(`Line ${n}: section "${sec}" should be RW or MA.`);
      return;
    }
    const module = Number(mod);
    if (![1, 2, 3].includes(module)) {
      errors.push(`Line ${n}: module "${mod}" should be 1, 2 or 3.`);
      return;
    }
    const question_number = Number(qn);
    if (!Number.isInteger(question_number) || question_number < 1) {
      errors.push(`Line ${n}: question number "${qn}" isn't a positive whole number.`);
      return;
    }
    const difficulty = Number(diff);
    if (![1, 2, 3].includes(difficulty)) {
      errors.push(`Line ${n}: difficulty "${diff}" should be 1, 2 or 3.`);
      return;
    }
    const d = domainByCode.get(dom.toUpperCase());
    if (!d) {
      errors.push(`Line ${n}: unknown domain code "${dom}".`);
      return;
    }
    if (d.section !== DOMAIN_SECTION[section]) {
      errors.push(`Line ${n}: domain ${d.code} belongs to ${d.section}, not ${section}.`);
      return;
    }
    const s = skillByCode.get(skill.toUpperCase());
    if (!s) {
      errors.push(`Line ${n}: unknown skill code "${skill}".`);
      return;
    }
    if (s.domain_code !== d.code) {
      errors.push(`Line ${n}: skill ${s.code} belongs to domain ${s.domain_code}, not ${d.code}.`);
      return;
    }
    if (!correct) {
      errors.push(`Line ${n}: missing correct answer.`);
      return;
    }
    ok.push({ section, module: module as 1 | 2 | 3, question_number, correct, difficulty: difficulty as 1 | 2 | 3, domain_code: d.code, skill_code: s.code, eqb_id: eqb || null });
  });
  return { ok, errors };
}

export function NewFormClient({ domains, skills }: { domains: DomainOption[]; skills: SkillOption[] }) {
  const router = useRouter();
  const [formCode, setFormCode] = useState("");
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [text, setText] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRows(text, domains, skills), [text, domains, skills]);

  // Suggest "SAT Practice 12" from "SDB312" until the admin types a label.
  function onCodeChange(v: string) {
    const code = v.toUpperCase();
    setFormCode(code);
    if (!labelTouched) {
      const m = code.match(/(\d+)$/);
      setLabel(m ? `SAT Practice ${Number(m[1].slice(-2))}` : "");
    }
  }

  const counts = useMemo(() => {
    const c: Record<Section, Record<number, number>> = { RW: { 1: 0, 2: 0, 3: 0 }, MA: { 1: 0, 2: 0, 3: 0 } };
    for (const q of parsed.ok) c[q.section][q.module]++;
    return c;
  }, [parsed]);
  const warnings = useMemo(() => {
    const w: string[] = [];
    for (const section of SECTION_ORDER)
      for (const module of MODULES) {
        const n = counts[section][module];
        if (n !== QUESTIONS_PER_MODULE[section]) w.push(`${SECTION_LABELS[section]} ${MODULE_LABELS[module]}: ${n} questions (expected ${QUESTIONS_PER_MODULE[section]}).`);
      }
    const keys = new Set<string>();
    for (const q of parsed.ok) {
      const k = `${q.section}-${q.module}-${q.question_number}`;
      if (keys.has(k)) w.push(`Duplicate: ${q.section} module ${q.module} question ${q.question_number}.`);
      keys.add(k);
    }
    return w;
  }, [parsed, counts]);

  const canReview = formCode.trim() && label.trim() && parsed.ok.length > 0 && parsed.errors.length === 0;

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createForm({ formCode, label, notes, questions: parsed.ok });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/forms/${formCode.trim().toUpperCase()}`);
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Form code</span>
          <input value={formCode} onChange={(e) => onCodeChange(e.target.value)} placeholder="SDB312" disabled={reviewing} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm uppercase" />
          <span className="mt-1 block text-xs text-gray-500">MyPractice&apos;s code; SDB304 is Practice Test 4.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Label</span>
          <input
            value={label}
            onChange={(e) => {
              setLabelTouched(true);
              setLabel(e.target.value);
            }}
            placeholder="SAT Practice 12"
            disabled={reviewing}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-gray-700">Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={reviewing} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="optional" />
        </label>
      </div>

      {!reviewing ? (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Questions</span>
              <span className="mt-1 block text-xs text-gray-500">
                One question per line, columns separated by tabs (paste straight from a spreadsheet) or commas:{" "}
                <code className="rounded bg-gray-100 px-1">Section, Module, Question #, Correct answer, Difficulty (1–3), Domain code, Skill code</code>, with an optional
                EQB_ID last. Section is RW or MA; Module is 1, 2 (easier second module) or 3 (harder). A header row is fine. The item-bank sheet&apos;s original
                column layout is accepted too.
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                spellCheck={false}
                className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs"
                placeholder={"RW\t1\t1\tB\t1\tCAS\tWIC\nRW\t1\t2\tD\t2\tCAS\tWIC\n…"}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-gray-600">
                {parsed.ok.length} question{parsed.ok.length === 1 ? "" : "s"} parsed
                {parsed.errors.length > 0 && <span className="text-weak"> · {parsed.errors.length} line{parsed.errors.length === 1 ? "" : "s"} with problems</span>}
              </span>
              <button type="button" onClick={() => setReviewing(true)} disabled={!canReview} className={BTN.primary}>
                Review
              </button>
            </div>
            {parsed.errors.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-xs text-weak">
                {parsed.errors.slice(0, 20).map((e) => (
                  <li key={e}>{e}</li>
                ))}
                {parsed.errors.length > 20 && <li>…and {parsed.errors.length - 20} more.</li>}
              </ul>
            )}
          </div>
        </>
      ) : (
        <>
          {warnings.length > 0 && (
            <div className="rounded-md border border-mid bg-mid-soft px-4 py-3 text-sm text-mid">
              <p className="font-medium">Check these before creating:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {SECTION_ORDER.map((section) => (
            <section key={section}>
              <h2 className="text-lg font-bold text-gray-900">{SECTION_LABELS[section]}</h2>
              <div className="mt-3 grid gap-4 lg:grid-cols-3">
                {MODULES.map((module) => {
                  const qs = parsed.ok.filter((q) => q.section === section && q.module === module).sort((a, b) => a.question_number - b.question_number);
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
                            <tr key={`${q.section}-${q.module}-${q.question_number}`}>
                              <td className="px-2 py-1 text-right tabular-nums text-gray-500">{q.question_number}</td>
                              <td className="px-2 py-1 font-medium text-gray-900">{q.correct}</td>
                              <td className="px-2 py-1 text-gray-700">{DIFFICULTY_LABELS[q.difficulty]}</td>
                              <td className="px-2 py-1 text-gray-700">{q.domain_code}</td>
                              <td className="px-2 py-1 text-gray-700">{q.skill_code}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <div className="text-sm">
              {error ? <span className="text-weak">{error}</span> : <span className="text-gray-600">Creating {label || formCode} with {parsed.ok.length} questions.</span>}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setReviewing(false)} disabled={isPending} className={BTN.neutral}>
                Back to edit
              </button>
              <button type="button" onClick={create} disabled={isPending} className={BTN.primary}>
                {isPending ? "Creating…" : "Create form"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
