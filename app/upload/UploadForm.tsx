"use client";

import { useState, useTransition } from "react";
import { uploadAttempt } from "./actions";

export function UploadForm() {
  const [isPending, startTransition] = useTransition();
  const [fileNames, setFileNames] = useState<{ html?: string; pdf?: string }>({});

  return (
    <form
      action={(formData) => startTransition(() => uploadAttempt(formData))}
      className="mt-6 space-y-5 rounded-lg border border-gray-200 bg-white p-6"
    >
      <div>
        <label className="block text-sm font-medium text-gray-700">Test name</label>
        <input
          name="test_name"
          type="text"
          required
          placeholder="e.g. SAT Practice Test 6"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Test date</label>
        <input
          name="test_date"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <FileField
        name="details_html"
        label="MyPractice Details page (.html)"
        accept=".html,.htm"
        hint='From MyPractice: open your test results, then "Save Page As -> Webpage, Complete".'
        fileName={fileNames.html}
        onChange={(name) => setFileNames((f) => ({ ...f, html: name }))}
      />

      <FileField
        name="score_report_pdf"
        label="Official Score Report (.pdf)"
        accept=".pdf"
        hint="Downloaded from MyPractice as a PDF."
        fileName={fileNames.pdf}
        onChange={(name) => setFileNames((f) => ({ ...f, pdf: name }))}
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
  hint: string;
  fileName?: string;
  onChange: (name: string | undefined) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        name={name}
        type="file"
        required
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0]?.name)}
        className="mt-1 w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-blue-100"
      />
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
      {fileName && <p className="mt-1 text-xs text-gray-600">Selected: {fileName}</p>}
    </div>
  );
}
