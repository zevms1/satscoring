"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BTN } from "@/lib/ui";
import { deleteForm } from "@/app/forms/actions";

// View / Edit / Delete for one row of the Test repository. Delete is
// disabled while any scored test uses the form (the server refuses too).
export function FormRowActions({ formCode, label, attemptCount }: { formCode: string; label: string; attemptCount: number }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    const ok = window.confirm(`Delete ${label} (${formCode}) and all of its questions?\n\nThis can't be undone.`);
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteForm(formCode);
      if (result.error) window.alert(result.error);
    });
  }

  return (
    <div className="flex justify-end gap-2">
      <Link href={`/forms/${formCode}`} className={BTN.small}>
        View
      </Link>
      <Link href={`/forms/${formCode}/edit`} className={BTN.smallSecondary}>
        Edit
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending || attemptCount > 0}
        title={attemptCount > 0 ? `${attemptCount} scored test(s) use this form` : undefined}
        className={BTN.smallDanger}
      >
        {isPending ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
