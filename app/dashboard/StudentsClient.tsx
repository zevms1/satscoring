"use client";

import { BTN } from "@/lib/ui";
import { PageNav } from "./PageNav";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createStudent, deleteStudent, setStudentActive, updateStudent, type StudentInput } from "./actions";
import { ChipFilters, chipMatches, type ChipCategory, type ChipState } from "./ChipFilters";

// Roster management for the Students tab: chip filters (name, status,
// school, grade, tutor), sortable headers and paging over one table.
// Clicking a name opens the student's panel under their row (details,
// Edit, Delete, status); the row's one button opens the upload form for
// them. Delete spells out how many tests go with the student. All
// writes go through actions.ts. Copied from the ACT app; only the links
// out (upload form, report) and a few labels differ.

export type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  /** "Last, First", as the roster shows and sorts names. */
  sort_name: string;
  email: string | null;
  phone: string | null;
  school: string | null;
  /** 1-12, or 13 for "no longer in high school". */
  grade: number | null;
  tutor: string | null;
  enrollment_date: string | null;
  self_entry_allowed: boolean;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_active: boolean;
  /** Has signed in at least once (profiles.student_id points here). */
  linked: boolean;
  /** The sign-in profile's id, which is what tests are keyed by. */
  profileId: string | null;
  attemptCount: number;
  latestId: string | null;
  latestDate: string | null;
  latestComposite: number | null;
};

export const NLIHS_GRADE = 13;

export function gradeLabel(grade: number | null): string | null {
  if (grade == null) return null;
  return grade === NLIHS_GRADE ? "NLIHS" : String(grade);
}

const EMPTY: StudentInput = {
  first_name: "",
  last_name: "",
  email: null,
  phone: null,
  school: null,
  grade: null,
  tutor: null,
  enrollment_date: null,
  self_entry_allowed: false,
  street: null,
  city: null,
  state: null,
  zip: null,
  is_active: true,
};

function toInput(s: StudentRow): StudentInput {
  return {
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.email,
    phone: s.phone,
    school: s.school,
    grade: s.grade,
    tutor: s.tutor,
    enrollment_date: s.enrollment_date,
    self_entry_allowed: s.self_entry_allowed,
    street: s.street,
    city: s.city,
    state: s.state,
    zip: s.zip,
    is_active: s.is_active,
  };
}

const NONE = "__none__";
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
const distinct = (items: StudentRow[], pick: (s: StudentRow) => string | null) => {
  const seen = new Set<string>();
  for (const s of items) seen.add(pick(s) ?? NONE);
  const values = [...seen].filter((v) => v !== NONE).sort(byText);
  if (seen.has(NONE)) values.push(NONE);
  return values;
};

// Filter categories over the roster. Name is free text; Status is
// radio-style and starts on Active; the rest are multi-select.
const CATS: ChipCategory<StudentRow>[] = [
  {
    key: "name",
    label: "Name",
    text: true,
    match: (s, q) => {
      const needle = q.toLowerCase();
      return s.sort_name.toLowerCase().includes(needle) || `${s.first_name} ${s.last_name}`.toLowerCase().includes(needle);
    },
  },
  {
    key: "status",
    label: "Status",
    single: true,
    options: () => ["active", "inactive"],
    optLabel: (v) => (v === "active" ? "Active" : "Inactive"),
    value: (s) => (s.is_active ? "active" : "inactive"),
  },
  {
    key: "school",
    label: "School",
    options: (items) => distinct(items, (s) => s.school),
    optLabel: (v) => (v === NONE ? "No school on file" : v),
    value: (s) => s.school ?? NONE,
  },
  {
    key: "grade",
    label: "Grade",
    options: (items) => {
      const grades = [...new Set(items.map((s) => s.grade))];
      const nums = grades.filter((g): g is number => g != null).sort((a, b) => a - b).map(String);
      return grades.includes(null) ? [...nums, NONE] : nums;
    },
    optLabel: (v) => (v === NONE ? "No grade on file" : v === String(NLIHS_GRADE) ? "NLIHS" : v),
    value: (s) => (s.grade == null ? NONE : String(s.grade)),
  },
  {
    key: "tutor",
    label: "Tutor",
    options: (items) => distinct(items, (s) => s.tutor),
    optLabel: (v) => (v === NONE ? "No tutor on file" : v),
    value: (s) => s.tutor ?? NONE,
  },
];
const DEFAULT_FILTERS: ChipState = { name: {}, status: { active: true }, school: {}, grade: {}, tutor: {} };

type SortKey = "name" | "school" | "grade" | "tests" | "active";
// Name / School / Grade read A-Z (low to high); Tests starts with the
// most; Active starts with the active students.
const SORT_DEFAULT_DESC: Record<SortKey, boolean> = { name: false, school: false, grade: false, tests: true, active: false };

type PageSize = 10 | 20 | 100 | "all";
const PAGE_SIZES: PageSize[] = [10, 20, 100, "all"];

function Dash() {
  return <span className="text-gray-300">—</span>;
}

export function StudentsClient({ students, startNew = false }: { students: StudentRow[]; startNew?: boolean }) {
  const router = useRouter();
  // null = form closed; "new" = adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(startNew ? "new" : null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [draft, setDraft] = useState<StudentInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [filters, setFilters] = useState<ChipState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [page, setPage] = useState(1);

  const shown = students
    .filter((s) => chipMatches(s, CATS, filters))
    .sort((a, b) => {
      let c = 0;
      if (sort.key === "name") c = byText(a.sort_name, b.sort_name);
      else if (sort.key === "school") c = byText(a.school ?? "￿", b.school ?? "￿");
      else if (sort.key === "grade") c = (a.grade ?? 99) - (b.grade ?? 99);
      else if (sort.key === "tests") c = a.attemptCount - b.attemptCount;
      else c = a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1;
      if (sort.desc) c = -c;
      return c || byText(a.sort_name, b.sort_name);
    });

  // Paging over the filtered, sorted list; any change to filters, sort
  // or page size goes back to page 1.
  const pageCount = pageSize === "all" ? 1 : Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = pageSize === "all" ? shown : shown.slice((current - 1) * pageSize, current * pageSize);
  const firstIndex = shown.length === 0 ? 0 : pageSize === "all" ? 1 : (current - 1) * pageSize + 1;
  const lastIndex = pageSize === "all" ? shown.length : Math.min(current * pageSize, shown.length);

  function sortBy(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: SORT_DEFAULT_DESC[key] }));
    setPage(1);
  }

  function openNew() {
    setEditing("new");
    setDraft(EMPTY);
    setError(null);
  }

  function openEdit(s: StudentRow) {
    setEditing(s.id);
    setDraft(toInput(s));
    setError(null);
  }

  function close() {
    setEditing(null);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const result = editing === "new" ? await createStudent(draft) : await updateStudent(editing as string, draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function remove(s: StudentRow) {
    const what =
      s.attemptCount > 0
        ? `Delete ${s.sort_name} and their ${s.attemptCount} test${s.attemptCount === 1 ? "" : "s"} (every report and uploaded file)? This can't be undone.`
        : `Delete ${s.sort_name}? This can't be undone.`;
    if (!window.confirm(what)) return;
    setRowError(null);
    const result = await deleteStudent(s.id);
    if (!result.ok) {
      setRowError({ id: s.id, message: result.error });
      return;
    }
    if (editing === s.id) setEditing(null);
    if (viewing === s.id) setViewing(null);
    router.refresh();
  }

  async function toggleActive(s: StudentRow) {
    const next = !s.is_active;
    if (
      !next &&
      !window.confirm(
        `Mark ${s.sort_name} inactive? Their tests and scores stay on file, but they can no longer sign in to see them or enter new ones, and they leave the student pickers.`
      )
    )
      return;
    setRowError(null);
    const result = await setStudentActive(s.id, next);
    if (!result.ok) {
      setRowError({ id: s.id, message: result.error });
      return;
    }
    router.refresh();
  }

  const field = (label: string, key: keyof StudentInput, type: "text" | "email" | "date" = "text") => (
    <label className="block text-sm">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        type={type}
        value={draft[key] == null ? "" : String(draft[key])}
        onChange={(e) => {
          const v = e.target.value;
          setDraft((d) => ({ ...d, [key]: v === "" ? null : v }));
        }}
        className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
    </label>
  );

  const gradeField = (
    <label className="block text-sm">
      <span className="text-xs font-medium text-gray-500">Grade</span>
      <select
        value={draft.grade == null ? "" : String(draft.grade)}
        onChange={(e) => setDraft((d) => ({ ...d, grade: e.target.value === "" ? null : Number(e.target.value) }))}
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">—</option>
        {[7, 8, 9, 10, 11, 12].map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        <option value={NLIHS_GRADE}>NLIHS (no longer in high school)</option>
      </select>
    </label>
  );

  const form = (
    <div className="rounded-md border border-brand bg-brand-light/40 p-4">
      <h3 className="text-sm font-bold text-gray-900">{editing === "new" ? "New student" : "Edit student"}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("Last name", "last_name")}
        {field("First name", "first_name")}
        {field("Email", "email", "email")}
        {field("Phone", "phone")}
        {field("School", "school")}
        {gradeField}
        {field("Tutor", "tutor")}
        {field("Enrollment date", "enrollment_date", "date")}
        {field("Street", "street")}
        {field("City", "city")}
        {field("State", "state")}
        {field("ZIP", "zip")}
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={draft.self_entry_allowed}
            onChange={(e) => setDraft((d) => ({ ...d, self_entry_allowed: e.target.checked }))}
          />
          May upload their own tests
        </label>
        <label
          className="flex items-end gap-2 pb-2 text-sm text-gray-700"
          title="Inactive students keep their tests on file but can't use the app and leave the student pickers"
        >
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          Active
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        The email is what links a student&apos;s Google sign-in to this record. Add them here first; until then that
        Google account is turned away at sign-in.
      </p>
      {error && <p className="mt-2 rounded-md bg-weak-soft px-3 py-2 text-sm text-weak">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className={BTN.primary}
        >
          {busy ? "Saving…" : editing === "new" ? "Add student" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          className={BTN.neutral}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const detailItem = (label: string, value: React.ReactNode) => (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm text-gray-800">{value ?? <Dash />}</div>
    </div>
  );

  const details = (s: StudentRow) => {
    const cityLine = [s.city, [s.state, s.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {detailItem(
            "Address",
            s.street || cityLine ? (
              <>
                {s.street}
                {s.street && cityLine ? <br /> : null}
                {cityLine}
              </>
            ) : null
          )}
          {detailItem("Phone", s.phone)}
          {detailItem("Tutor", s.tutor)}
          {detailItem("Enrollment date", s.enrollment_date)}
          {detailItem("Self-entry", s.self_entry_allowed ? "May upload their own tests" : "No")}
          {detailItem("Sign-in", s.linked ? "Has signed in" : "Never signed in")}
          {detailItem(
            "Status",
            <span className="flex flex-wrap items-center gap-3">
              {s.is_active ? "Active" : <span className="font-medium text-weak">Inactive</span>}
              <button type="button" onClick={() => toggleActive(s)} className={BTN.small}>
                {s.is_active ? "Mark inactive" : "Reactivate"}
              </button>
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-3 text-xs">
          <button
            type="button"
            onClick={() => openEdit(s)}
            className={BTN.small}
          >
            Edit
          </button>
          <button type="button" onClick={() => remove(s)} className={`${BTN.smallDanger} ml-auto`}>
            Delete
          </button>
        </div>
        {rowError?.id === s.id && <div className="mt-2 text-xs text-weak">{rowError.message}</div>}
      </div>
    );
  };

  // Sortable header: the active column reads in the brand blue, with
  // the arrow, like every other sortable table in the app.
  const th = (key: SortKey, label: string, align: "left" | "right", title?: string) => {
    const sorted = sort.key === key;
    return (
      <th className={`px-4 py-2 text-${align} font-bold ${sorted ? "text-brand" : ""}`} title={title}>
        <button type="button" onClick={() => sortBy(key)} className={`uppercase tracking-wide ${sorted ? "" : "hover:text-gray-900"}`}>
          {label}
          {sorted ? (sort.desc ? " ▼" : " ▲") : ""}
        </button>
      </th>
    );
  };

  return (
    <div className="mt-6">
      <ChipFilters
        items={students}
        cats={CATS}
        state={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        trailing={
          <button
            type="button"
            onClick={openNew}
            className={BTN.primary}
          >
            + New student
          </button>
        }
      />
      <p className="mt-2 text-xs text-gray-500">
        {shown.length === 0
          ? `0 of ${students.length} students match.`
          : `Showing ${firstIndex}–${lastIndex} of ${shown.length} students` + (shown.length !== students.length ? ` (${students.length} on the roster).` : ".")}
      </p>

      {editing === "new" && <div className="mt-4">{form}</div>}

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{students.length === 0 ? "No students yet." : "No students match these filters."}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                {th("name", "Name", "left")}
                <th className="px-4 py-2 text-left font-bold">Email</th>
                {th("school", "School", "left")}
                {th("grade", "Grade", "right")}
                {th("tests", "Tests", "right")}
                <th className="px-4 py-2 text-left font-bold">Latest</th>
                {th("active", "Active?", "left", "Inactive students keep their history but can't use the app")}
                <th className="sticky right-0 bg-white px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageRows.map((s) => {
                const open = viewing === s.id;
                const isEditing = editing === s.id;
                return [
                  <tr key={s.id} className={isEditing || open ? "bg-brand-light/40" : "hover:bg-gray-50"}>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                      <button
                        type="button"
                        onClick={() => setViewing(open ? null : s.id)}
                        className="text-left font-medium text-gray-900 hover:text-brand hover:underline"
                        title={open ? "Hide details" : "Show details, edit or delete"}
                      >
                        {s.sort_name}
                      </button>
                      {s.linked && (
                        <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good" title="Has signed in">
                          signed in
                        </span>
                      )}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2 text-gray-700" title={s.email ?? undefined}>
                      {s.email ?? <Dash />}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{s.school ?? <Dash />}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700" title={s.grade === NLIHS_GRADE ? "No longer in high school" : undefined}>
                      {gradeLabel(s.grade) ?? <Dash />}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">
                      {s.attemptCount > 0 && s.profileId ? (
                        <Link href={`/dashboard?student=${s.profileId}`} className="font-medium text-brand hover:underline" title="All of this student's tests">
                          {s.attemptCount}
                        </Link>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                      {s.latestDate && s.latestId ? (
                        <Link href={`/test/${s.latestId}`} className="hover:underline" title="Latest score report">
                          {s.latestDate}
                          {s.latestComposite != null && <span className="ml-1 font-bold text-gray-900">{s.latestComposite}</span>}
                        </Link>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {s.is_active ? <span className="font-bold text-good">Yes</span> : <span className="font-medium text-weak">No</span>}
                    </td>
                    {/* Pinned to the right edge, so the actions stay in view even when a wide roster scrolls. */}
                    <td className="sticky right-0 bg-white px-4 py-2 text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.18)]">
                      {s.is_active && s.email ? (
                        <Link
                          href={`/upload?student=${encodeURIComponent(s.email)}`}
                          className={BTN.smallSecondary}
                          title="Upload a test for this student"
                        >
                          + Upload a test
                        </Link>
                      ) : s.is_active ? (
                        <span className="text-xs text-gray-400" title="Add an email to upload for this student">no email</span>
                      ) : (
                        <span className="text-xs text-gray-400">inactive</span>
                      )}
                    </td>
                  </tr>,
                  open && !isEditing ? (
                    <tr key={`${s.id}-view`} className="bg-brand-light/20">
                      <td colSpan={8} className="px-4 py-3">
                        {details(s)}
                      </td>
                    </tr>
                  ) : null,
                  isEditing ? (
                    <tr key={`${s.id}-edit`} className="bg-brand-light/20">
                      <td colSpan={8} className="px-4 py-3">
                        {form}
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {shown.length > 0 && (
        <PageNav
          page={current}
          pageCount={pageCount}
          size={pageSize}
          sizes={PAGE_SIZES}
          onPage={setPage}
          onSize={(s) => {
            setPageSize(s as PageSize);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}
