import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/lib/SiteHeader";
import type { Attempt } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("attempts")
    .select(
      "id, test_name, test_date, status, rw_scaled, math_scaled, total_scaled, error_message"
    )
    .order("test_date", { ascending: false });
  const attempts = data as Attempt[] | null;

  return (
    <>
      <SiteHeader email={user?.email ?? null} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Your practice tests</h1>
          <Link
            href="/upload"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Upload a new test
          </Link>
        </div>

        {!attempts || attempts.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-gray-600">
              No practice tests yet. Upload your MyPractice results to get started.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Test</Th>
                  <Th>Date</Th>
                  <Th>R&amp;W</Th>
                  <Th>Math</Th>
                  <Th>Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {attempts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm">
                      {a.status === "completed" ? (
                        <Link
                          href={`/test/${a.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {a.test_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">{a.test_name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(a.test_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.rw_scaled ?? "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{a.math_scaled ?? "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {a.total_scaled || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={a.status} errorMessage={a.error_message} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </th>
  );
}

function StatusBadge({
  status,
  errorMessage,
}: {
  status: Attempt["status"];
  errorMessage: string | null;
}) {
  const styles: Record<Attempt["status"], string> = {
    uploaded: "bg-gray-100 text-gray-700",
    processing: "bg-yellow-100 text-yellow-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span
      title={status === "failed" ? errorMessage ?? undefined : undefined}
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
