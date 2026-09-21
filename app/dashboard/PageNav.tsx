"use client";

import { useRouter } from "next/navigation";
import { BTN } from "@/lib/ui";

// The page navigator under the roster and the Scorecards list: Prev, the
// page numbers (all of them when there are few, else the ends and a
// window around the current page), Next, and a per-page picker. Driven
// by callbacks when the list is paged in the browser (the roster), or by
// a URL template when the server pages it (Scorecards): __PAGE__ and
// __SIZE__ in the template are filled in and pushed.

export type PageSize = number | "all";

function pageNumbers(current: number, pageCount: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  if (pageCount <= 9) {
    for (let p = 1; p <= pageCount; p++) out.push(p);
    return out;
  }
  const around = [1, 2, current - 1, current, current + 1, pageCount - 1, pageCount].filter((p) => p >= 1 && p <= pageCount);
  const uniq = [...new Set(around)].sort((a, b) => a - b);
  uniq.forEach((p, i) => {
    if (i > 0 && p - uniq[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function PageNav({
  page,
  pageCount,
  size,
  sizes,
  onPage,
  onSize,
  hrefTemplate,
}: {
  page: number;
  pageCount: number;
  size: PageSize;
  sizes: PageSize[];
  onPage?: (page: number) => void;
  onSize?: (size: PageSize) => void;
  hrefTemplate?: string;
}) {
  const router = useRouter();
  const current = Math.min(Math.max(1, page), Math.max(1, pageCount));

  const href = (p: number, s: PageSize) => (hrefTemplate ?? "").replace("__PAGE__", String(p)).replace("__SIZE__", String(s));
  const goPage = (p: number) => {
    if (onPage) onPage(p);
    else if (hrefTemplate) router.push(href(p, size));
  };
  const goSize = (s: PageSize) => {
    if (onSize) onSize(s);
    else if (hrefTemplate) router.push(href(1, s));
  };

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => goPage(Math.max(1, current - 1))} disabled={current === 1} className={BTN.small}>
          &larr; Prev
        </button>
        {pageNumbers(current, pageCount).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-gray-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => goPage(p)}
              className={p === current ? `${BTN.smallPrimary} min-w-[2rem]` : `${BTN.small} min-w-[2rem]`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => goPage(Math.min(pageCount, current + 1))}
          disabled={current >= pageCount}
          className={BTN.small}
        >
          Next &rarr;
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-500">
        Per page
        <select
          value={String(size)}
          onChange={(e) => goSize(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
        >
          {sizes.map((n) => (
            <option key={String(n)} value={String(n)}>
              {n === "all" ? "All" : n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
