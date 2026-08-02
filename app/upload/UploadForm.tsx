"use client";

import { useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { uploadAttempt } from "./actions";

export function UploadForm({
  isTutor = false,
  students = [],
}: {
  isTutor?: boolean;
  students?: { email: string; full_name: string | null }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [fileNames, setFileNames] = useState<{ html?: string; pdf?: string }>({});

  return (
    <form
      action={(formData) => startTransition(() => uploadAttempt(formData))}
      className="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-6"
    >
      {isTutor && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Student email</label>
          <input
            name="student_email"
            type="email"
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

      <FileField
        name="score_report_pdf"
        label="Score Report PDF"
        accept=".pdf"
        hint={
          <>
            Click the &quot;Download Score Report&quot; button at the top of the Score
            Details page to download the Score Report to your device. Then upload it
            here.
          </>
        }
        fileName={fileNames.pdf}
        onChange={(name) => setFileNames((f) => ({ ...f, pdf: name }))}
      />

      <FileField
        name="details_html"
        label="Score Details Page HTML"
        accept=".html,.htm"
        hint={
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              On the Score Details page, scroll down until you see &quot;Questions
              Overview.&quot;
            </li>
            <li>
              Turn ON the &quot;Show Correct Answers&quot; toggle and click &quot;All&quot;
              in the &quot;View&quot; options.
            </li>
            <li>
              Ensure the Questions Overview table is sorted by ascending question number,
              as indicated by a &quot;^&quot; next to &quot;Question&quot; (this is the
              default sort, so just don&apos;t change it by clicking &quot;Your
              Answer&quot; or &quot;Domain&quot; in the table&apos;s header).
            </li>
            <li>
              Once these options are selected, hit Ctrl+S (or Cmd+S) and save the page as
              &quot;Webpage, Complete.&quot;
            </li>
          </ol>
        }
        fileName={fileNames.html}
        onChange={(name) => setFileNames((f) => ({ ...f, html: name }))}
      />

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {isPending ? "Uploading & scoring…" : "Upload and score"}
      </button>
    </form>
  );
}

function FileField({
  name,
  label,
  accept,
  hint,
  fileName,
  onChange,
}: {
  name: string;
  label: string;
  accept: string;
  hint: ReactNode;
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
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="mt-1 text-xs text-gray-500">{hint}</p>

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
        className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
          isDragging
            ? "border-brand bg-brand-light"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        }`}
      >
        <p className="text-sm text-gray-600">
          <span className="font-medium text-brand">Choose a file</span> or drag and drop it
          here
        </p>
        {fileName && <p className="mt-1 text-xs text-gray-600">Selected: {fileName}</p>}
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
