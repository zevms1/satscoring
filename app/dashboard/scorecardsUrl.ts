// The Scorecards tab's view: sort, page and the chip filters. It rides
// in the URL so links, refreshes and the back button keep it, and both
// the server-rendered headers and the client-side chips write it the
// same way. A bare /dashboard is the default view: newest first,
// everyone, everything, page 1 of 20. (Adapted from the ACT app.)
export type ScorecardSort = "student" | "test" | "date" | "rw" | "math" | "total" | "processed";
export const SCORECARD_SORTS: ScorecardSort[] = ["student", "test", "date", "rw", "math", "total", "processed"];
// Dates and scores read highest/newest first by default; names read A-Z.
export const scorecardSortDefaultDesc = (key: ScorecardSort) => key !== "student" && key !== "test";

export const SCORECARD_SIZES = [10, 20, 50, 100];
export const DEFAULT_SCORECARD_SIZE = 20;

export const PERIODS = ["year", "12m", "90", "30"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = {
  year: "This school year",
  "12m": "Last 12 months",
  "90": "Last 90 days",
  "30": "Last 30 days",
};
export function isPeriod(v: unknown): v is Period {
  return (PERIODS as readonly string[]).includes(v as string);
}

/** First day (YYYY-MM-DD) of a period; the school year runs from the most recent August 1st. */
export function periodStart(period: Period, today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === "year") {
    const year = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return `${year}-08-01`;
  }
  if (period === "12m") d.setFullYear(d.getFullYear() - 1);
  else d.setDate(d.getDate() - Number(period));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export const STATUSES = ["completed", "processing", "failed", "uploaded"] as const;
export const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  completed: "Scored",
  processing: "Scoring",
  failed: "Failed",
  uploaded: "Uploaded",
};

export type ScorecardsView = {
  sort: ScorecardSort;
  dir: "asc" | "desc";
  page: number;
  size: number;
  student: string[];
  test: string[];
  status: string[];
  period: Period | null;
};

export const FILTER_KEYS = ["student", "test", "status"] as const;

export const DEFAULT_SCORECARDS_VIEW: ScorecardsView = {
  sort: "date",
  dir: "desc",
  page: 1,
  size: DEFAULT_SCORECARD_SIZE,
  student: [],
  test: [],
  status: [],
  period: null,
};

export function hasScorecardFilters(v: ScorecardsView): boolean {
  return FILTER_KEYS.some((k) => v[k].length > 0) || v.period != null;
}

type Raw = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** The view a URL's search params describe; anything malformed takes the default. */
export function parseScorecardsView(q: Raw): ScorecardsView {
  const sort = SCORECARD_SORTS.includes(q.sort as ScorecardSort) ? (q.sort as ScorecardSort) : "date";
  const dir = q.dir === "asc" || q.dir === "desc" ? q.dir : scorecardSortDefaultDesc(sort) ? "desc" : "asc";
  const page = Math.max(1, Math.floor(Number(q.page)) || 1);
  const size = SCORECARD_SIZES.includes(Number(q.size)) ? Number(q.size) : DEFAULT_SCORECARD_SIZE;
  return {
    sort,
    dir,
    page,
    size,
    student: list(q.student),
    test: list(q.test),
    status: list(q.status),
    period: isPeriod(q.period) ? q.period : null,
  };
}

function params(v: ScorecardsView, page: string, size: string): URLSearchParams {
  const q = new URLSearchParams();
  if (!(v.sort === "date" && v.dir === "desc")) {
    q.set("sort", v.sort);
    q.set("dir", v.dir);
  }
  if (page !== "1") q.set("page", page);
  if (size !== String(DEFAULT_SCORECARD_SIZE)) q.set("size", size);
  for (const key of FILTER_KEYS) for (const x of v[key]) q.append(key, x);
  if (v.period) q.set("period", v.period);
  return q;
}

export function scorecardsUrl(v: ScorecardsView): string {
  const s = params(v, String(v.page), String(v.size)).toString();
  return s ? `/dashboard?${s}` : "/dashboard";
}

/** The same URL with __PAGE__ and __SIZE__ left for the page navigator to fill in. */
export function scorecardsUrlTemplate(v: ScorecardsView): string {
  return `/dashboard?${params(v, "__PAGE__", "__SIZE__").toString()}`;
}
