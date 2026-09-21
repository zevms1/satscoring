import { SiteHeader } from "@/lib/SiteHeader";
import { AdminChrome } from "@/app/dashboard/AdminChrome";
import { loadReference, requireAdminPage } from "@/lib/forms-data";
import { NewFormClient } from "./NewFormClient";

// Add a practice-test form to the item bank by pasting its question rows
// (from a spreadsheet or CSV), reviewing them, then creating. Admin-only.

export default async function NewFormPage() {
  const { supabase, user } = await requireAdminPage();
  const { domains, skills } = await loadReference(supabase);
  return (
    <>
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-5xl px-4 py-5">
        <AdminChrome active="tests" />
        <h1 className="mt-5 text-xl font-bold text-gray-900">New test form</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste the form&apos;s questions, check the review table, then create it. Nothing is saved until you click
          Create. The scorer picks the new form up immediately.
        </p>
        <NewFormClient domains={domains} skills={skills} />
      </main>
    </>
  );
}
