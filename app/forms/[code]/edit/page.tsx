import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/lib/SiteHeader";
import { AdminChrome } from "@/app/dashboard/AdminChrome";
import { loadForm, loadReference, requireAdminPage } from "@/lib/forms-data";
import { EditFormClient, type AttemptSummary } from "./EditFormClient";

// Edit a practice-test form (Test repository -> Edit): label, notes, and
// every question's correct answer / difficulty / domain / skill inline.
// After saving, the tests already scored against the form can be re-run
// from here so their reports pick up the change. Admin-only.

export default async function EditFormPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, user } = await requireAdminPage();
  const [{ form, rows }, { domains, skills }, { data: attempts }] = await Promise.all([
    loadForm(supabase, code),
    loadReference(supabase),
    supabase
      .from("attempts")
      .select("id, test_name, test_date, status, profiles(full_name)")
      .eq("form_code", code)
      .order("test_date", { ascending: false }),
  ]);
  if (!form) notFound();

  return (
    <>
      <SiteHeader email={user.email ?? null} />
      <main className="mx-auto max-w-5xl px-4 py-5">
        <AdminChrome active="tests" />
        <Link href={`/forms/${form.form_code}`} className="mt-5 inline-block text-sm font-medium text-brand hover:underline">
          &larr; Back to {form.label}
        </Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">
          Edit {form.label} <span className="ml-1 text-base font-medium text-gray-500">{form.form_code}</span>
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Change anything below and save. Tests already scored against this form keep their old numbers until you
          re-score them, which you can do right after saving.
        </p>
        <EditFormClient
          form={form}
          rows={rows}
          domains={domains}
          skills={skills}
          attempts={(attempts ?? []) as unknown as AttemptSummary[]}
        />
      </main>
    </>
  );
}
