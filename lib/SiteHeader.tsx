import Link from "next/link";

export function SiteHeader({ email }: { email: string | null }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="text-lg font-semibold text-brand">
          Unique Prep
        </Link>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {email && <span>{email}</span>}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
