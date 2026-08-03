import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Attempt } from "@/lib/types";
import { REPORT_SKELETON } from "@/lib/report-template/skeleton";
import { REPORT_SCRIPT } from "@/lib/report-template/script";
import { LOGO_BASE64 } from "@/lib/report-template/logo";

// Serves the pixel-perfect branded score report (dashboard_template.html)
// as a fully self-contained static document -- deliberately a Route Handler,
// not a page.tsx, so it renders outside the app's root layout/Tailwind and
// the original vanilla-JS report script has the DOM entirely to itself.

function statusPage(title: string, message: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title} — Unique Prep</title>
</head>
<body style="font-family:'Roboto',sans-serif;max-width:640px;margin:80px auto;color:#1c1c1a;">
  <h1 style="font-size:20px;">${title}</h1>
  <p style="color:#77756e;">${message}</p>
  <p><a href="/dashboard" style="color:#1155cc;">&larr; Back to Dashboard</a></p>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: attemptData } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", id)
    .single();
  const attempt = attemptData as Attempt | null;

  if (!attempt) {
    return statusPage(
      "Not found",
      "This test report doesn't exist, or you don't have access to it."
    );
  }

  if (attempt.status === "failed") {
    return statusPage(
      "Scoring failed",
      attempt.error_message ?? "Unknown error while scoring this test."
    );
  }

  if (attempt.status !== "completed" || !attempt.report_json_path) {
    return statusPage(
      "Still scoring",
      "This test is still being scored — check back in a moment."
    );
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", attempt.student_id)
    .single();
  const studentName =
    (profileData as { full_name: string | null } | null)?.full_name ?? "Student";

  const { data: reportBlob, error: downloadError } = await supabase.storage
    .from("attempt-files")
    .download(attempt.report_json_path);

  if (downloadError || !reportBlob) {
    return statusPage(
      "Report unavailable",
      "Couldn't load the score report file. Try again shortly."
    );
  }

  const reportJson = JSON.parse(await reportBlob.text());

  const testDateLabel = new Date(attempt.test_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const report = {
    ...reportJson,
    student_name: studentName,
    test_name: attempt.test_name ?? "Practice Test",
    test_date_label: testDateLabel,
    // Postgres `date` column -- already a plain "YYYY-MM-DD" string with no
    // time/timezone component, so no reformatting needed. Used to build the
    // suggested filename when printing/saving as PDF (see printFull /
    // printQuestionsOnly in script.ts).
    test_date_iso: attempt.test_date,
    user_email: user.email ?? "",
  };

  // Guard against a stray "</script" in any question/answer text prematurely
  // closing the inline <script> tag when embedded below.
  const reportDataJs = JSON.stringify(report).replace(/<\/script/gi, "<\\/script");
  const inlineScript = `const REPORT = ${reportDataJs};\n${REPORT_SCRIPT}`;

  // split/join (not .replace with a string arg) to avoid "$&"/"$$"-style
  // special replacement-pattern interpretation inside the large payload.
  const html = REPORT_SKELETON.split("__LOGO_BASE64__")
    .join(LOGO_BASE64)
    .split("__SCRIPT_PLACEHOLDER__")
    .join(inlineScript);

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
