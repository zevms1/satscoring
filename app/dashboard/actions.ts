"use server";

import { revalidatePath } from "next/cache";
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
