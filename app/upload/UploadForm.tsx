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
          <div className="space-y-2">
            <p>
              <span className="font-semibold">NOTE:</span> You must use Chrome, Edge, or
              Firefox to download these files. Safari can&apos;t save the page in the
              format needed. Also, some of these instructions will vary slightly depending
              on whether you&apos;re using a Mac or PC.
            </p>
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                On the Score Details page, scroll down until you see &quot;Questions
                Overview&quot; and make the following two changes:
                <ol className="mt-1 list-[lower-alpha] space-y-0.5 pl-5">
                  <li>Turn ON the &quot;Show Correct Answers&quot; toggle</li>
                  <li>In the &quot;View&quot; options, click &quot;All&quot;</li>
                </ol>
                <p className="mt-1">
                  Also, ensure the Questions Overview table is sorted by ascending question
                  number, as indicated by a &quot;^&quot; next to &quot;Question&quot; (this
                  is the default sort, so just don&apos;t change it by clicking any of the
                  other column headers like &quot;Your Answer&quot; or &quot;Domain&quot;).
                </p>
              </li>
              <li>
                Once the above steps are done, hit Ctrl+S (or Cmd+S) to open a &quot;Save
                As&quot; or &quot;Save Page As&quot; window. In this window:
                <ol className="mt-1 list-[lower-alpha] space-y-0.5 pl-5">
                  <li>
                    Select a location where the files will be easy to find, such as your
                    desktop or downloads folder
                  </li>
                  <li>
                    In the &quot;Save as type,&quot; you must select &quot;Webpage,
                    Complete.&quot;
                  </li>
                </ol>
                <p className="mt-1">
                  Once these options are set, click &quot;Save,&quot; and your browser will
                  download two things:
                </p>
                <ol className="mt-1 list-[lower-alpha] space-y-0.5 pl-5">
                  <li>
                    A single .html file (named something like &quot;MyPractice - SAT
                    Practice 7 - ... - Details.html&quot;)
                  </li>
                  <li>A folder with the same name ending in &quot;_files&quot;</li>
                </ol>
              </li>
              <li>
                Once the files are downloaded, you need to upload{" "}
                <span className="font-semibold">ONLY the single .html file</span>; click the
                blue &quot;Choose a file&quot; below or just drag and drop the .html file to
                the area below. (The folder that was downloaded isn&apos;t needed; it is safe
                to delete it.)
              </li>
              <li>
                After you click &quot;Upload and score&quot; and your score report opens,
                the file is saved to your account. You can then delete the .html file (and
                the Score Report PDF, if you wish) from your device.
              </li>
            </ol>
          </div>
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
      <div className="mt-1 text-xs text-gray-500">{hint}</div>

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
