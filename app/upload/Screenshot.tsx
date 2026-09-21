"use client";

import { useRef } from "react";
import Image from "next/image";

// A small inline "See screenshot" link that opens an annotated MyPractice
// screenshot in a modal, so the directions stay short for students who
// don't need the visual. Uses the native <dialog> so Esc, the backdrop
// click and the close button all dismiss it without any extra state.
export function Screenshot({
  src,
  width,
  height,
  alt,
  caption,
  label = "See screenshot",
}: {
  src: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  label?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex items-center gap-1 whitespace-nowrap align-baseline text-xs font-medium text-brand hover:underline"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
        >
          <path
            fillRule="evenodd"
            d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13.5 3a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM10 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            clipRule="evenodd"
          />
        </svg>
        {label}
      </button>

      <dialog
        ref={dialogRef}
        // Clicking the translucent backdrop (the dialog element itself,
        // outside its inner panel) closes it.
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="max-h-[90vh] w-[min(92vw,60rem)] max-w-none overflow-auto rounded-lg bg-white p-0 shadow-2xl backdrop:bg-gray-900/60"
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
          <p className="text-sm font-medium text-gray-800">{caption}</p>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            &times;
          </button>
        </div>
        <div className="p-3">
          <Image
            src={src}
            width={width}
            height={height}
            alt={alt}
            sizes="(max-width: 1000px) 92vw, 960px"
            className="h-auto w-full rounded-md border border-gray-200"
          />
        </div>
      </dialog>
    </>
  );
}
