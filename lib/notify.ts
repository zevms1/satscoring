import { createClient } from "@supabase/supabase-js";

/**
 * Emails every admin when a test has been uploaded and scored (or failed to
 * score). Sending goes through Resend's REST API; when RESEND_API_KEY is not
 * set this is a silent no-op, so the upload flow never depends on it.
 *
 * Runs after the response has been sent (see `after()` in the upload action),
 * so a slow or failing email never delays the student.
 */
export async function notifyAdminsOfUpload(opts: { attemptId: string; uploaderId: string; origin: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apiKey || !url || !serviceKey) return;

  try {
    // Service role: the uploader (a student) can't read admin profiles, and
    // we want the same email no matter who uploaded.
    const db = createClient(url, serviceKey, { auth: { persistSession: false } });

    const [{ data: attempt }, { data: admins }] = await Promise.all([
      db
        .from("attempts")
        .select(
          "id, student_id, test_name, test_date, status, form_code, rw_scaled, math_scaled, total_scaled, error_message, profiles(full_name, email)"
        )
        .eq("id", opts.attemptId)
        .maybeSingle(),
      db.from("profiles").select("id, email").eq("role", "admin"),
    ]);
    if (!attempt) return;

    const a = attempt as unknown as {
      id: string;
      student_id: string;
      test_name: string | null;
      test_date: string | null;
      status: string;
      form_code: string | null;
      rw_scaled: number | null;
      math_scaled: number | null;
      total_scaled: number | null;
      error_message: string | null;
      profiles: { full_name: string | null; email: string | null } | null;
    };

    // Don't email an admin about their own upload.
    const to = ((admins ?? []) as { id: string; email: string | null }[])
      .filter((p) => p.id !== opts.uploaderId && p.email)
      .map((p) => p.email as string);
    if (to.length === 0) return;

    let formLabel = a.form_code ?? a.test_name ?? "SAT";
    if (a.form_code) {
      const { data: form } = await db.from("test_forms").select("label").eq("form_code", a.form_code).maybeSingle();
      formLabel = (form as { label: string } | null)?.label ?? formLabel;
    }

    const student = a.profiles?.full_name ?? a.profiles?.email ?? "A student";
    const link = `${opts.origin}/test/${a.id}`;
    const date = a.test_date
      ? new Date(`${a.test_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

    let subject: string;
    let text: string;
    let body: string;
    if (a.status === "completed" && a.total_scaled != null) {
      subject = `New SAT upload: ${student} - ${formLabel}`;
      text = `${student} uploaded ${formLabel}${date ? ` (taken ${date})` : ""}.\nTotal ${a.total_scaled} · Reading & Writing ${a.rw_scaled ?? "—"} · Math ${a.math_scaled ?? "—"}\n${link}`;
      body = `
        <p><strong>${esc(student)}</strong> uploaded <strong>${esc(formLabel)}</strong>${date ? ` (taken ${esc(date)})` : ""}.</p>
        <table cellpadding="6" style="border-collapse:collapse;font-size:15px">
          <tr><td>Total</td><td><strong>${a.total_scaled}</strong></td></tr>
          <tr><td>Reading &amp; Writing</td><td>${a.rw_scaled ?? "—"}</td></tr>
          <tr><td>Math</td><td>${a.math_scaled ?? "—"}</td></tr>
        </table>
        <p><a href="${link}">Open the scorecard</a></p>`;
    } else if (a.status === "failed") {
      subject = `Scoring failed: ${student} on ${formLabel}`;
      text = `${student} uploaded a test but scoring failed.\n${a.error_message ?? "Unknown error"}\n${opts.origin}/dashboard`;
      body = `
        <p><strong>${esc(student)}</strong> uploaded a test but scoring failed.</p>
        <p style="color:#b00">${esc(a.error_message ?? "Unknown error")}</p>
        <p><a href="${opts.origin}/dashboard">Open the dashboard</a> to re-score or delete it.</p>`;
    } else {
      subject = `New SAT upload: ${student} - ${formLabel} (still processing)`;
      text = `${student} uploaded a test. Scoring was still running when this was sent.\n${link}`;
      body = `
        <p><strong>${esc(student)}</strong> uploaded a test. Scoring was still running when this was sent.</p>
        <p><a href="${link}">Check the scorecard</a></p>`;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "SAT Scoring <onboarding@resend.dev>",
        to,
        subject,
        text,
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">${body}</div>`,
      }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
  } catch (err) {
    console.error("notifyAdminsOfUpload failed", err);
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
