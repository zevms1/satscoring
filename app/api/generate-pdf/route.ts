import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Renders an already-fully-rendered score report page (the exact live DOM
// snapshot sent up by lib/report-template/script.ts -- filters, sort order,
// module selection, and toggled columns all baked in) to a PDF via a hosted
// headless-Chrome API, and streams the result back for direct download.
//
// This exists so printed/saved reports look the same for every student
// regardless of their local browser's print-dialog settings (margins,
// scale, "headers and footers", background graphics): instead of asking the
// browser to print, we control every one of those settings here in code and
// hand back a finished PDF file.
//
// Requires a Browserless.io account (or compatible hosted-Chrome PDF API)
// and its token set as BROWSERLESS_TOKEN. See .env.example.

const BROWSERLESS_PDF_URL =
  process.env.BROWSERLESS_URL || "https://production-sfo.browserless.io/pdf";

export async function POST(request: Request) {
  // Require a signed-in user so this doesn't become an open HTML-to-PDF
  // proxy for anyone who finds the URL -- consistent with the rest of the
  // app being locked to Michael's existing clients.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "PDF generation isn't configured yet (missing BROWSERLESS_TOKEN)." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const html = body?.html;
  const filename = typeof body?.filename === "string" && body.filename.trim() ? body.filename : "report";

  if (typeof html !== "string" || !html.trim()) {
    return NextResponse.json({ error: "Missing HTML to render." }, { status: 400 });
  }

  let browserlessRes: Response;
  try {
    browserlessRes = await fetch(`${BROWSERLESS_PDF_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        options: {
          printBackground: true,
          format: "Letter",
          margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
        },
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the PDF rendering service." }, { status: 502 });
  }

  if (!browserlessRes.ok) {
    const detail = await browserlessRes.text().catch(() => "");
    return NextResponse.json(
      { error: `PDF service error (${browserlessRes.status}): ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const pdfBuffer = await browserlessRes.arrayBuffer();

  // Filenames are already built from known-clean fields (yyyy-mm-dd date,
  // student name, test name, report type) with no punctuation by design
  // (see printFilename in script.ts), but strip anything unexpected before
  // it goes into a Content-Disposition header just in case.
  const safeFilename = filename.replace(/[^a-zA-Z0-9 ,._-]/g, "").trim() || "report";

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}.pdf"`,
    },
  });
}
