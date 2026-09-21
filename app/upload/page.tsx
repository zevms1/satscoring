import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";
import { SiteHeader } from "@/lib/SiteHeader";
import { UploadForm } from "./UploadForm";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; student?: string }>;
}) {
  const { error, student: presetStudent } = await searchParams;
  const supabase = await createClient();
  const access = await getAccess(supabase);
  if (!access) redirect("/login");
  if (!access.allowed) redirect("/dashboard");
  const user = { email: access.email };
  const isTutor = access.role !== "student";

  // A student may upload for themselves only if their roster row allows
  // it; otherwise their tutor uploads on their behalf.
  let selfUploadAllowed = true;
  if (!isTutor) {
    const { data: me } = await supabase.from("students").select("self_entry_allowed").eq("profile_id", access.userId).maybeSingle();
    selfUploadAllowed = (me as { self_entry_allowed: boolean } | null)?.self_entry_allowed ?? false;
  }

  // Suggestions for the "upload on behalf of" email field -- RLS already
  // returns every profile here once role != 'student', empty array otherwise.
  const { data: studentsData } = isTutor
    ? await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("role", "student")
        .order("full_name")
    : { data: [] };
  const students = (studentsData ?? []) as { email: string; full_name: string | null }[];

  return (
    <>
      <SiteHeader email={user?.email ?? null} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Upload practice test files</h1>
          <Link
            href="/dashboard"
            className="shrink-0 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Go to my scored tests &rarr;
          </Link>
        </div>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {selfUploadAllowed ? (
          <UploadForm isTutor={isTutor} students={students} presetStudent={presetStudent ?? null} />
        ) : (
          <p className="mt-6 rounded-md bg-mid-soft px-3 py-2 text-sm text-mid">
            Your tutor uploads tests for you. Send them your two MyPractice files and the scored report will
            appear on your dashboard.
          </p>
        )}
      </main>
    </>
  );
}
