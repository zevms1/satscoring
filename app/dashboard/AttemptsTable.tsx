"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Attempt } from "@/lib/types";

export type AttemptRow = Attempt & { profiles: { full_name: string | null } | null };

type SortKey =
  | "student_last_name"
  | "test_name"
  | "test_date"
  | "rw_scaled"
  | "math_scaled"
  | "total_scaled";
type SortDir = "asc" | "desc";

// "Michael Scharf" -> "Scharf". Just the last whitespace-separated token --
// good enough for sorting a tutoring roster, no need for real name parsing.
function lastName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || null;
}

export function AttemptsTable({
  attempts,
  isTutor,
}: {
  attempts: AttemptRow[];
  isTutor: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("test_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const rows = [...attempts];
    rows.sort((a, b) => {
      const av = sortKey === "student_last_name" ? lastName(a.profiles?.full_name) : a[sortKey];
      const bv = sortKey === "student_last_name" ? lastName(b.profiles?.full_name) : b[sortKey];

      // Missing scores/names always sink to the bottom, regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      const cmp =
        typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);

      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [attempts, sortKey, sortDir]);

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {isTutor && (
              <SortableTh
                label="Student"
                sortKey="student_last_name"
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
              />
            )}
            <SortableTh
              label="Test"
              sortKey="test_name"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
            />
            <SortableTh
              label="Date"
              sortKey="test_date"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
            />
            <SortableTh
              label="R&W"
              sortKey="rw_scaled"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              align="right"
            />
            <SortableTh
              label="Math"
              sortKey="math_scaled"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              align="right"
            />
            <SortableTh
              label="Total"
              sortKey="total_scaled"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              align="right"
            />
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sorted.map((a) => (
            <tr key={a.id} className="hover:bg-gray-50">
              {isTutor && (
                <td className="px-4 py-3 text-sm text-gray-600">
                  {a.profiles?.full_name ?? "—"}
                </td>
              )}
              <td className="px-4 py-3 text-sm">
                {a.status === "completed" ? (
                  <Link href={`/test/${a.id}`} className="font-medium text-brand hover:underline">
                    {a.test_name}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">{a.test_name}</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {new Date(a.test_date).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right text-sm text-gray-600">
                {a.rw_scaled ?? "—"}
              </td>
              <td className="px-4 py-3 text-right text-sm text-gray-600">
                {a.math_scaled ?? "—"}
              </td>
              <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                {a.total_scaled || "—"}
              </td>
              <td className="px-4 py-3 text-sm">
                <StatusBadge status={a.status} errorMessage={a.error_message} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </th>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = sortKey === activeKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 hover:text-gray-700 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-gray-400">{isActive ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </span>
    </th>
  );
}

function StatusBadge({
  status,
  errorMessage,
}: {
  status: Attempt["status"];
  errorMessage: string | null;
}) {
  const styles: Record<Attempt["status"], string> = {
    uploaded: "bg-gray-100 text-gray-700",
    processing: "bg-yellow-100 text-yellow-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span
      title={status === "failed" ? errorMessage ?? undefined : undefined}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
