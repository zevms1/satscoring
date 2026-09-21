"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BTN } from "@/lib/ui";
import { deleteAttempt, rescoreAttempt } from "./actions";

// View opens the branded report (scored tests only); Re-score runs the
// scorer again on the stored files (after item-bank edits, or to retry a
// failure); Delete removes the test and its files. The last two are
// admin-only and re-checked server-side.
export function AttemptRowActions({
  attemptId,
  label,
  status,
  isAdmin,
}: {
  attemptId: string;
  label: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"rescore" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rescore() {
    setBusy("rescore");
    setError(null);
    const result = await rescoreAttempt(attemptId);
    setBusy(null);
    if (result.error) setError(result.error);
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete ${label}?\n\nThis permanently removes the scored report and the uploaded files. It can't be undone.`)) return;
    setBusy("delete");
    setError(null);
    const result = await deleteAttempt(attemptId);
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex items-center justify-end gap-2 whitespace-nowrap text-xs">
      {status === "completed" && (
        <Link href={`/test/${attemptId}`} className={BTN.small}>
          View
        </Link>
      )}
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={rescore}
            disabled={busy != null || status === "processing"}
            title="Run the scorer again on the uploaded files"
            className={BTN.small}
          >
            {busy === "rescore" ? "Re-scoring…" : "Re-score"}
          </button>
          <button type="button" onClick={remove} disabled={busy != null} className={BTN.smallDanger}>
            {busy === "delete" ? "Deleting…" : "Delete"}
          </button>
        </>
      )}
      {error && <span className="max-w-xs whitespace-normal text-weak">{error}</span>}
    </span>
  );
}
