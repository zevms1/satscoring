import Link from "next/link";

// The admin's persistent header: the title, the quick actions and the
// tab bar. Every admin screen renders it (the dashboard tabs and the
// test-repository pages alike) so the tabs never disappear and no page
// needs a "back to" link to get around. Kept compact on purpose.

export type AdminTab = "attempts" | "students" | "tests";
export const ADMIN_TABS: { key: AdminTab; label: string }[] = [
  { key: "attempts", label: "Scorecards" },
  { key: "students", label: "Students" },
  { key: "tests", label: "Test repository" },
];

const action = "inline-flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-bold";
const actionPrimary = `${action} bg-brand text-white hover:bg-brand-dark`;
const actionSecondary = `${action} border border-brand bg-white text-brand hover:bg-brand-light/40`;

export function AdminChrome({ active }: { active: AdminTab }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900">Admin dashboard</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/upload" className={actionPrimary}>
            + Upload a test
          </Link>
          <Link href="/dashboard?tab=students&new=1" className={actionSecondary}>
            + New student
          </Link>
          <Link href="/forms/new" className={actionSecondary}>
            + New test form
          </Link>
        </div>
      </div>
      <nav className="mt-2 flex flex-wrap gap-1 border-b border-gray-200">
        {ADMIN_TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "attempts" ? "/dashboard" : `/dashboard?tab=${t.key}`}
            className={`-mb-px px-3 py-1.5 text-sm font-medium ${
              active === t.key ? "border-b-2 border-brand text-brand" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
