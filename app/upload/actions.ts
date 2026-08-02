"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function uploadAttempt(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const htmlFile = formData.get("details_html") as File | null;
  const pdfFile = formData.get("score_report_pdf") as File | null;

  if (!htmlFile?.size || !pdfFile?.size) {
    redirect("/upload?error=Please choose both files.");
  }

  // 1. Create the attempt row first so we have an id to namespace the files.
  // test_name/test_date are placeholders -- the parser reads the real values
  // off the saved page's own <title> and overwrites these once scoring
  // finishes (see api/parse.py + sat_parser.parse_test_meta).
  const { data: attempt, error: insertError } = await supabase
    .from("attempts")
    .insert({
      student_id: user.id,
      test_name: "Processing…",
      test_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single();

  if (insertError || !attempt) {
    redirect(`/upload?error=${encodeURIComponent(insertError?.message ?? "Could not create attempt")}`);
  }

  const attemptId = attempt!.id;
  const basePath = `${user.id}/${attemptId}`;
  const htmlPath = `${basePath}/details.html`;
  const pdfPath = `${basePath}/score_report.pdf`;

  // 2. Upload both source files to Storage.
  const [htmlUpload, pdfUpload] = await Promise.all([
    supabase.storage.from("attempt-files").upload(htmlPath, htmlFile, {
      contentType: "text/html",
      upsert: true,
    }),
    supabase.storage.from("attempt-files").upload(pdfPath, pdfFile, {
      contentType: "application/pdf",
      upsert: true,
    }),
  ]);

  if (htmlUpload.error || pdfUpload.error) {
    await supabase
      .from("attempts")
      .update({
        status: "failed",
        error_message: htmlUpload.error?.message ?? pdfUpload.error?.message ?? "Upload failed",
      })
      .eq("id", attemptId);
    redirect(`/upload?error=${encodeURIComponent("File upload failed. Please try again.")}`);
  }

  // 3. Record the paths and hand off to the Python parser.
  await supabase
    .from("attempts")
    .update({
      source_html_path: htmlPath,
      source_pdf_path: pdfPath,
      status: "processing",
    })
    .eq("id", attemptId);

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${host}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

    const res = await fetch(`${origin}/api/parse`, {
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
    }
  } catch (err) {
    // Parsing can legitimately take a while; if the request times out or the
    // connection drops, leave status as "processing" — the dashboard will
    // just show it as still working rather than incorrectly marking it failed.
    console.error("Parse request error", err);
  }

  redirect(`/test/${attemptId}`);
}
