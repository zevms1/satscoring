"use client";

import { useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { uploadAttempt } from "./actions";
import { Screenshot } from "./Screenshot";

export function UploadForm({
  isTutor = false,
  students = [],
  presetStudent = null,
}: {
  isTutor?: boolean;
  students?: { email: string; full_name: string | null }[];
  /** Email to pre-fill the student field with (from the roster's "Upload a test" button). */
  presetStudent?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [fileNames, setFileNames] = useState<{ html?: string; pdf?: string }>({});

  const bothChosen = Boolean(fileNames.pdf && fileNames.html);

  return (
    <form
      action={(formData) => startTransition(() => uploadAttempt(formData))}
      className="mt-6 space-y-6"
    >
      <div className="rounded-md border-l-4 border-brand bg-brand-light px-4 py-3 text-sm text-gray-700">
        <span className="font-semibold text-brand-dark">Use Chrome, Edge, or Firefox.</span>{" "}
        Safari can&apos;t save the page in the format needed. A few steps differ slightly on
        Mac vs. PC.
      </div>

      {isTutor && (
        <div className="max-w-md">
          <label className="block text-sm font-medium text-gray-700">Student email</label>
          <input
            name="student_email"
            type="email"
            defaultValue={presetStudent ?? undefined}
            required
            list="student-emails"
            placeholder="student@example.com"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <datalist id="student-emails">
            {students.map((s) => (
              <option key={s.email} value={s.email}>
                {s.full_name ?? s.email}
              </option>
            ))}
          </datalist>
          <p className="mt-1 text-xs text-gray-500">
            Who this test is for. They need to have signed in at least once already.
          </p>
        </div>
      )}

      {/* Step 1 has no file of its own: it's where both files come from. */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <CardHeader step={1} title="Open the test's Score Details page" />
        <p className="mt-3 text-sm text-gray-600">
          Log into{" "}
          <a
            href="https://mypractice.collegeboard.org/dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            mypractice.collegeboard.org/dashboard
          </a>
          , open the tile for the test you want to analyze, and click the yellow{" "}
          <span className="font-medium text-gray-700">Score Details</span> button. Steps 2
          and 3 both start from that page.
        </p>
      </div>

      {/* The two files side by side; they stack on narrow screens. */}
      <div className="grid items-start gap-6 md:grid-cols-2">
        <FileField
          step={2}
          name="score_report_pdf"
          label="Upload Score Report PDF"
          accept=".pdf"
          dropHint="PDF only"
          hint={
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                At the top of the Score Details page, click{" "}
                <span className="font-medium text-gray-700">Download Score Report</span>.{" "}
                <Screenshot
                  src="/upload-help/download-score-report.webp"
                  width={1785}
                  height={881}
                  alt="The top of the MyPractice Score Details page, with the Download Score Report button circled"
                  caption="Step 2: the Download Score Report button at the top of the Score Details page"
                />
              </li>
              <li>The PDF saves to your device. Upload that file here.</li>
            </ol>
          }
          fileName={fileNames.pdf}
          onChange={(name) => setFileNames((f) => ({ ...f, pdf: name }))}
        />

        <FileField
          step={3}
          name="details_html"
          label="Upload Score Details Page HTML"
          accept=".html,.htm"
          dropHint="The single .html file only"
          hint={
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Scroll down to{" "}
                <span className="font-medium text-gray-700">Questions Overview</span> and
                make two changes:
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>
                    Turn <span className="font-medium text-gray-700">ON</span> the &quot;Show
                    Correct Answers&quot; toggle
                  </li>
                  <li>
                    In the &quot;View&quot; options, click{" "}
                    <span className="font-medium text-gray-700">All</span>{" "}
                    <Screenshot
                      src="/upload-help/questions-overview.webp"
                      width={1612}
                      height={976}
                      alt="The Questions Overview section with the Show Correct Answers toggle turned on and the All view option circled"
                      caption="Step 3: the Show Correct Answers toggle and the All view option under Questions Overview"
                    />
                  </li>
                </ul>
                <p className="mt-1 text-gray-500">
                  Keep the table sorted by ascending question number (the &quot;^&quot; next
                  to &quot;Question&quot;, the default). Don&apos;t click other column
                  headers.
                </p>
              </li>
              <li>
                Press <span className="font-medium text-gray-700">Ctrl+S</span> (or{" "}
                <span className="font-medium text-gray-700">Cmd+S</span>) to open &quot;Save
                Page As&quot;, then:
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>Pick somewhere easy to find, like your desktop or downloads folder</li>
                  <li>
                    Under &quot;Save as type,&quot; select{" "}
                    <span className="font-medium text-gray-700">Webpage, Complete</span>
                  </li>
                </ul>
                <p className="mt-1 text-gray-500">
                  Saving gives you a single .html file (like &quot;MyPractice - SAT Practice
                  7 - ... - Details.html&quot;) plus a folder ending in &quot;_files&quot;.
                </p>
              </li>
              <li>
                Upload <span className="font-medium text-gray-700">only the .html file</span>{" "}
                below. The &quot;_files&quot; folder isn&apos;t needed, so it&apos;s safe to
                delete.
              </li>
              <li>
                After scoring, the file is saved to your account, so you can delete both
                downloads from your device.
              </li>
            </ol>
          }
          fileName={fileNames.html}
          onChange={(name) => setFileNames((f) => ({ ...f, html: name }))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-gray-500" aria-live="polite">
          {bothChosen ? "Both files attached. Ready to score." : "Attach both files to continue."}
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {isPending ? "Uploading & scoring…" : "Upload and score"}
        </button>
      </div>
    </form>
  );
}

function CardHeader({
  step,
  title,
  required = false,
}: {
  step: number;
  title: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 text-lg font-semibold text-gray-900">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-300 text-xs font-semibold text-gray-600">
          {step}
        </span>
        {title}
      </div>
      {required && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Required
        </span>
      )}
    </div>
  );
}

function FileField({
  step,
  name,
  label,
  accept,
  hint,
  dropHint,
  fileName,
  onChange,
}: {
  step: number;
  name: string;
  label: string;
  accept: string;
  hint: ReactNode;
  dropHint: string;
  fileName?: string;
  onChange: (name: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function assignFile(file: File) {
    const input = inputRef.current;
    if (!input) return;
    // Programmatically assigning .files doesn't fire a native "change" event,
    // so update the displayed filename ourselves. FormData still reads the
    // real file off the input at submit time either way.
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    onChange(file.name);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) assignFile(file);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <CardHeader step={step} title={label} required />
      <div className="mb-4 mt-3 text-sm text-gray-600">{hint}</div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${
          isDragging
            ? "border-brand bg-brand-light"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        }`}
      >
        <p className="text-sm font-medium text-brand">Choose a file or drag it here</p>
        <p className="mt-1 text-xs text-gray-500">{dropHint}</p>
        {fileName && (
          <p className="mt-2 text-xs text-gray-700">
            Selected: <span className="font-medium">{fileName}</span>
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        name={name}
        type="file"
        required
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0]?.name)}
        className="sr-only"
      />
    </div>
  );
}
