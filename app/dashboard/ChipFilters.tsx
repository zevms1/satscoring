"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The "+ School (1)" chip filters from Question Details / Score History,
// for React pages: each category opens a checklist (with a search box
// once the list is long) or, for a free-text category, a single search
// field; chosen values show as chips beneath with "Clear all", and
// counts next to each option are the items that pass every other
// filter. State is the caller's: one set of chosen values per category
// key (a text category holds the typed query as its one value).

export type ChipCategory<T> = {
  key: string;
  label: string;
  /** Radio-style: choosing one value replaces the other. */
  single?: boolean;
  /** Free-text: the panel is a search field and the chip shows what was typed. */
  text?: boolean;
  match?: (item: T, query: string) => boolean;
  /** Every value the category can take, in display order (checklist categories). */
  options?: (items: T[]) => string[];
  optLabel?: (value: string) => string;
  value?: (item: T) => string;
  /** Instead of value(): does an item pass a chosen option (a period, say)? */
  test?: (item: T, value: string) => boolean;
};

export type ChipState = Record<string, Record<string, true>>;

export function emptyChipState<T>(cats: ChipCategory<T>[]): ChipState {
  const s: ChipState = {};
  for (const c of cats) s[c.key] = {};
  return s;
}

/** Does an item pass every filter (optionally ignoring one category)? */
export function chipMatches<T>(item: T, cats: ChipCategory<T>[], state: ChipState, excludeKey?: string): boolean {
  for (const cat of cats) {
    if (cat.key === excludeKey) continue;
    const set = state[cat.key] ?? {};
    const keys = Object.keys(set);
    if (!keys.length) continue;
    if (cat.text) {
      if (cat.match && !cat.match(item, keys[0])) return false;
    } else if (cat.test) {
      if (!keys.some((k) => cat.test!(item, k))) return false;
    } else if (!set[cat.value!(item)]) {
      return false;
    }
  }
  return true;
}

// Lists longer than this get a search box at the top of the checklist.
const SEARCH_THRESHOLD = 6;

export function ChipFilters<T>({
  items,
  cats,
  state,
  onChange,
  trailing,
}: {
  items: T[];
  cats: ChipCategory<T>[];
  state: ChipState;
  onChange: (next: ChipState) => void;
  /** Anything to show at the right end of the chip bar. */
  trailing?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  function toggleValue(cat: ChipCategory<T>, value: string) {
    const set = { ...(state[cat.key] ?? {}) };
    if (set[value]) {
      delete set[value];
    } else {
      if (cat.single) for (const k of Object.keys(set)) delete set[k];
      set[value] = true;
    }
    onChange({ ...state, [cat.key]: set });
  }

  function setText(cat: ChipCategory<T>, query: string) {
    onChange({ ...state, [cat.key]: query.trim() ? { [query.trim()]: true } : {} });
  }

  function clearAll() {
    onChange(emptyChipState(cats));
    setOpen(null);
  }

  const labelOf = (cat: ChipCategory<T>, v: string) => (cat.optLabel ? cat.optLabel(v) : v);
  const chips: { cat: ChipCategory<T>; value: string }[] = [];
  for (const cat of cats) for (const v of Object.keys(state[cat.key] ?? {})) chips.push({ cat, value: v });
  const panelClass = "absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-gray-200 bg-white p-1.5 shadow-lg";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div ref={barRef} className="flex flex-wrap gap-2">
          {cats.map((cat) => {
            const active = Object.keys(state[cat.key] ?? {}).length;
            const isOpen = open === cat.key;
            return (
              <div key={cat.key} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(isOpen ? null : cat.key);
                    setSearch("");
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    active
                      ? "border-brand bg-brand-light/40 text-brand"
                      : "border-dashed border-gray-400 text-gray-700 hover:border-brand hover:text-brand"
                  }`}
                >
                  + {cat.label}
                  {active && !cat.text ? ` (${active})` : ""}
                </button>
                {isOpen && cat.text && (
                  <div className={panelClass}>
                    <input
                      autoFocus
                      type="text"
                      value={Object.keys(state[cat.key] ?? {})[0] ?? ""}
                      onChange={(e) => setText(cat, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" || e.key === "Enter") setOpen(null);
                      }}
                      placeholder={`Type part of a ${cat.label.toLowerCase()}…`}
                      className="block w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                    />
                    <div className="px-1 pt-1 text-[11px] text-gray-400">Matches anywhere in the {cat.label.toLowerCase()}.</div>
                  </div>
                )}
                {isOpen && !cat.text && (() => {
                  const opts = cat.options!(items);
                  const q = search.trim().toLowerCase();
                  const shown = q ? opts.filter((v) => labelOf(cat, v).toLowerCase().includes(q)) : opts;
                  return (
                    <div className={`${panelClass} max-h-72 overflow-y-auto`}>
                      {opts.length > SEARCH_THRESHOLD && (
                        <input
                          autoFocus
                          type="text"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setOpen(null);
                          }}
                          placeholder="Type to narrow the list…"
                          className="mb-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                        />
                      )}
                      {shown.length === 0 && <div className="px-2 py-1 text-xs text-gray-400">No matches.</div>}
                      {shown.map((v) => {
                        const checked = !!state[cat.key]?.[v];
                        const count = items.filter(
                          (it) => chipMatches(it, cats, state, cat.key) && (cat.test ? cat.test(it, v) : cat.value!(it) === v)
                        ).length;
                        const disabled = count === 0 && !checked;
                        return (
                          <label
                            key={v}
                            className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                              disabled ? "cursor-not-allowed text-gray-300" : "cursor-pointer text-gray-800 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type={cat.single ? "radio" : "checkbox"}
                              checked={checked}
                              disabled={disabled}
                              onChange={() => toggleValue(cat, v)}
                            />
                            <span className="flex-1">{labelOf(cat, v)}</span>
                            <span className="text-gray-400">{count}</span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        {trailing && <div className="ml-auto">{trailing}</div>}
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {chips.map(({ cat, value }) => (
            <span
              key={`${cat.key}:${value}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-light/40 py-0.5 pl-3 pr-2 text-xs font-medium text-brand"
            >
              {cat.label}: {labelOf(cat, value)}
              <button type="button" onClick={() => toggleValue(cat, value)} className="text-sm leading-none" aria-label="Remove">
                &times;
              </button>
            </span>
          ))}
          <button type="button" onClick={clearAll} className="text-xs text-gray-500 underline hover:text-gray-800">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
