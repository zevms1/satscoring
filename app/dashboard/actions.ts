"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Admin-only: permanently remove a practice test -- its attempts row (the
// domain_results / skill_results rows cascade), plus everything uploaded
// or generated for it in Storage under {student_id}/{attempt_id}/.
// RLS would already let any tutor delete, but the product decision for now
// is that only admins get the button, so the same check is enforced here.
export async function deleteAttempt(attemptId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return { error: "Only admins can delete tests." };
  }

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, student_id")
    .eq("id", attemptId)
    .single();
  if (!attempt) return { error: "That test no longer exists." };

  // Files first, so a half-failed delete leaves the row (and thus the
  // evidence) rather than orphaned files nobody can see.
  const folder = `${attempt.student_id}/${attempt.id}`;
  const { data: files, error: listError } = await supabase.storage
    .from("attempt-files")
    .list(folder);
  if (listError) return { error: `Couldn't list the test's files: ${listError.message}` };
  if (files && files.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("attempt-files")
      .remove(files.map((f) => `${folder}/${f.name}`));
    if (removeError) return { error: `Couldn't delete the test's files: ${removeError.message}` };
  }

  const { error: deleteError } = await supabase.from("attempts").delete().eq("id", attempt.id);
  if (deleteError) return { error: `Couldn't delete the test: ${deleteError.message}` };

  revalidatePath("/dashboard");
  return {};
}

// Admin-only: run the scorer again on a test's stored HTML + PDF. Used to
// retry a failed upload and to pick up item-bank edits (difficulty, skill,
// answer key) on tests scored before the change. Same hand-off as
// app/upload/actions.ts: POST the attempt id to /api/parse with the
// internal secret and wait for it (parsing takes a few seconds).
export async function rescoreAttempt(attemptId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return { error: "Only admins can re-score tests." };
  }

  const { data: attempt } = await supabase
    .from("attempts")
    .select("id, source_html_path, source_pdf_path")
    .eq("id", attemptId)
    .single();
  if (!attempt) return { error: "That test no longer exists." };
  if (!attempt.source_html_path || !attempt.source_pdf_path) {
    return { error: "This test's uploaded files are missing, so it can't be re-scored." };
  }

  await supabase
    .from("attempts")
    .update({ status: "processing", error_message: null })
    .eq("id", attemptId);

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    const res = await fetch(`${protocol}://${host}/api/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ attempt_id: attemptId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text();
      await supabase
        .from("attempts")
        .update({ status: "failed", error_message: body.slice(0, 500) })
        .eq("id", attemptId);
      revalidatePath("/dashboard");
      return { error: `Scoring failed: ${body.slice(0, 200)}` };
    }
  } catch (err) {
    console.error("Re-score request error", err);
    revalidatePath("/dashboard");
    return { error: "The scorer didn't answer in time. Refresh in a moment to see whether it finished." };
  }

  revalidatePath("/dashboard");
  return {};
}
