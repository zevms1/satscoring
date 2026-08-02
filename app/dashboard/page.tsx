import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/lib/SiteHeader";
import { AttemptsTable, type AttemptRow } from "./AttemptsTable";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  const isTutor = (ownProfile as { role: string } | null)?.role !== "student";

  // No student_id filter here on purpose -- RLS already scopes this to just
  // the signed-in student's own rows, or every student's rows for a tutor/
  // admin (see is_tutor() in the schema). Tutors get the profiles(full_name)
  // join below so multiple students' tests are distinguishable.
  const { data } = await supabase
    .from("attempts")
    .select(
      "id, test_name, test_date, status, rw_scaled, math_scaled, total_scaled, error_message, processed_at, student_id, profiles(full_name)"
    )
    .order("test_date", { ascending: false });
  const attempts = data as unknown as AttemptRow[] | null;

  return (
    <>
      <SiteHeader email={user?.email ?? null} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">
            {isTutor ? "All practice tests" : "Your practice tests"}
          </h1>
          <Link
            href="/upload"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Upload a new test
          </Link>
        </div>

        {!attempts || attempts.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">
              No practice tests yet. Upload your MyPractice results to get started.
            </p>
          </div>
        ) : (
          <AttemptsTable attempts={attempts} isTutor={isTutor} />
        )}
      </main>
    </>
  );
}
