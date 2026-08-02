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

  return (
    <>
      <SiteHeader email={user?.email ?? null} />
      <main className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900">Upload a practice test</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload both files from a single MyPractice test attempt to get your scored,
          domain- and skill-level breakdown.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <UploadForm />
      </main>
    </>
  );
}
