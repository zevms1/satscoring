"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChipFilters, type ChipCategory, type ChipState } from "./ChipFilters";
import { FILTER_KEYS, PERIODS, PERIOD_LABELS, STATUSES, STATUS_LABELS, isPeriod, periodStart, scorecardsUrl, type ScorecardsView } from "./scorecardsUrl";

// The chip filters over the Scorecards tab. The chips count over a light
// copy of every row (the facets) so the numbers are right whatever page
// is showing; choosing rewrites the URL, and the server does the actual
// filtering and paging. (Adapted from the ACT app.)

export type ScorecardFacet = {
  id: string;
  student_id: string;
  student_name: string;
  form_code: string | null;
  test_name: string;
  status: string;
  test_date: string;
};

export function ScorecardFilters({ facets, view }: { facets: ScorecardFacet[]; view: ScorecardsView }) {
  const router = useRouter();

  const cats = useMemo<ChipCategory<ScorecardFacet>[]>(() => {
    const studentName = new Map(facets.map((f) => [f.student_id, f.student_name]));
    // Tests are keyed by form code when the scorer identified one, else
    // by MyPractice's name, so an unscored upload still has a chip.
    const testKey = (f: ScorecardFacet) => f.form_code ?? `name:${f.test_name}`;
    const testName = new Map(facets.map((f) => [testKey(f), f.test_name]));
    const byName = (m: Map<string, string>) => (a: string, b: string) =>
      (m.get(a) ?? "").localeCompare(m.get(b) ?? "", undefined, { numeric: true });
    const ids = (items: ScorecardFacet[], pick: (f: ScorecardFacet) => string | null) =>
      [...new Set(items.map(pick).filter((x): x is string => !!x))];
    return [
      {
        key: "student",
        label: "Student",
        options: (items) => ids(items, (f) => f.student_id).sort(byName(studentName)),
        optLabel: (v) => studentName.get(v) ?? v,
        value: (f) => f.student_id,
      },
      {
        key: "test",
        label: "Test",
        options: (items) => ids(items, testKey).sort(byName(testName)),
        optLabel: (v) => testName.get(v) ?? v,
        value: testKey,
      },
      {
        key: "status",
        label: "Status",
        options: (items) => STATUSES.filter((s) => items.some((f) => f.status === s)),
        optLabel: (v) => STATUS_LABELS[v as (typeof STATUSES)[number]] ?? v,
        value: (f) => f.status,
      },
      {
        key: "period",
        label: "Period",
        single: true,
        options: () => [...PERIODS],
        optLabel: (v) => (isPeriod(v) ? PERIOD_LABELS[v] : v),
        test: (f, v) => isPeriod(v) && f.test_date >= periodStart(v),
      },
    ];
  }, [facets]);

  const state: ChipState = {};
  for (const k of FILTER_KEYS) state[k] = Object.fromEntries(view[k].map((x) => [x, true as const]));
  state.period = view.period ? { [view.period]: true } : {};

  return (
    <ChipFilters
      items={facets}
      cats={cats}
      state={state}
      onChange={(next) => {
        const nv: ScorecardsView = { ...view, page: 1, period: null };
        for (const k of FILTER_KEYS) nv[k] = Object.keys(next[k] ?? {});
        const p = Object.keys(next.period ?? {})[0];
        nv.period = isPeriod(p) ? p : null;
        router.push(scorecardsUrl(nv));
      }}
    />
  );
}
