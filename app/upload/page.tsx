import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/lib/SiteHeader";
import { UploadForm } from "./UploadForm";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Upload practice test files</h1>
          <Link href="/dashboard" className="text-sm font-medium text-brand hover:underline">
            Go to my scored tests
          </Link>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Log into{" "}
          <a
            href="https://mypractice.collegeboard.org/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            mypractice.collegeboard.org/dashboard
          </a>
          , locate the tile for the test you want to analyze, click the yellow &quot;Score
          Details&quot; button, and generate the 2 files below.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <UploadForm isTutor={isTutor} students={students} />
      </main>
    </>
  );
}
