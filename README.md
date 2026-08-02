# Unique Prep Student Dashboard

Live at **https://satscoring.vercel.app**. Students sign in with Google,
upload two files from a College Board MyPractice test, and get a scored,
domain/skill-level breakdown — either as a simple in-app table (dashboard)
or the full branded score report (bars, color-coded accuracy heatmap,
filters, sortable skill tables). Tutors/admins can see and upload on behalf
of any student.

This doc is a snapshot of the current state, meant to let a new chat (or a
new Claude session) pick up the project without re-deriving everything from
scratch. If you're an AI assistant reading this at the start of a new
conversation: the codebase and the live Supabase project are the source of
truth, not memory — read the relevant files before changing anything.

## Stack

- **Next.js 15** (App Router) on **Vercel** — `unique-prep-dashboard` /
  repo `zevms1/satscoring` on GitHub.
- **Supabase** (`zvvxmwnyrdzkrkbeftes`, org "Unique Prep", `us-east-1`) for
  Postgres + Auth (Google OAuth) + Storage.
- **Python** (`api/parse.py`, a Vercel serverless function) wraps
  `api/sat_parser.py` to do the actual scoring/parsing.

## How it fits together

1. Student (or tutor, on a student's behalf) signs in with Google via
   Supabase Auth → `app/login/actions.ts` / `app/auth/callback/route.ts`.
   `middleware.ts` gates every route except `/login` and `/auth/callback`.
2. `/upload` (`app/upload/`) — a form for the two MyPractice files (Score
   Report PDF, Score Details Page HTML), with drag-and-drop dropzones.
   `actions.ts`'s `uploadAttempt` Server Action:
   - creates a placeholder `attempts` row (`test_name: "Processing…"`,
     `test_date: today`),
   - uploads both files to Storage under `{student_id}/{attempt_id}/`,
   - POSTs to `/api/parse` with `attempt_id` and an internal shared secret.
3. `api/parse.py` downloads the two files back from Storage, calls
   `sat_parser.build_report()`, and writes the results:
   - top-line scores + `test_name`/`test_date` (see below) onto `attempts`,
   - one row per domain into `domain_results`, one per skill into
     `skill_results`,
   - the full raw report (question-by-question detail) as JSON to Storage,
     path recorded in `attempts.report_json_path`.
4. `/dashboard` (`app/dashboard/`) lists attempts — sortable by Test, Date,
   R&W, Math, Total, and (for tutors/admins) Student-by-last-name. RLS
   alone decides whether a query returns just one student's rows or every
   student's.
5. `/test/[id]` (`app/test/[id]/route.ts`) serves the **branded** report —
   a fully self-contained HTML document (not a normal Next.js page/layout)
   assembled from `lib/report-template/` (skeleton, script, logo — all
   verbatim from the original `dashboard_template.html` design) plus the
   live `report_json_path` JSON. It's a Route Handler, not a page, so the
   original vanilla-JS report script owns the DOM with nothing from the
   app's own Tailwind layout interfering.

## Data model

Four content tables plus `profiles`, all in `public`. `domains`/`skills`
are static reference tables (8 domains, 29 skills, official Digital SAT
codes) seeded once and rarely touched.

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `email`, `full_name`, `role` | `role` is `student` (default) / `tutor` / `admin`. Row auto-created on first sign-in by the `handle_new_user()` trigger. |
| `attempts` | `id`, `student_id`, `test_name`, `test_date`, `rw_scaled`, `math_scaled`, `total_scaled` (generated), `form_code`, `status`, `report_json_path`, `source_html_path`, `source_pdf_path` | One row per uploaded test. `status`: `uploaded` → `processing` → `completed`/`failed`. |
| `domain_results` | `attempt_id`, `domain_code`, `correct`/`incorrect`/`omitted`/`total`, `accuracy_pct` | One row per domain per attempt. |
| `skill_results` | `attempt_id`, `skill_code`, `correct`/`incorrect`/`omitted`/`total`, `accuracy_pct` | One row per skill per attempt. |

Storage bucket `attempt-files` (private) holds, per attempt, under
`{student_id}/{attempt_id}/`: `details.html`, `score_report.pdf`,
`report.json`.

### Roles & RLS

`is_tutor()` (SQL, `SECURITY DEFINER`) is the single permission check used
everywhere:

```sql
select exists (
  select 1 from public.profiles
  where id = auth.uid() and role in ('tutor', 'admin')
);
```

Every RLS policy on `attempts` / `domain_results` / `skill_results` /
`profiles` / `storage.objects` (bucket `attempt-files`) is
`own_row OR is_tutor()` — a student only ever sees/writes their own data; a
`tutor` or `admin` sees/writes everything. **`tutor` and `admin` are
currently treated identically** — there's no per-tutor student assignment
yet (see Backlog).

Right now `mike@uniqueprep.com` is the only `admin` account;
`zevms1@gmail.com` (Michael's original test account) was demoted back to
`student` once real testing moved to the `uniqueprep.com` address. Promote
an account with:

```sql
update public.profiles set role = 'admin' where email = 'someone@example.com';
```

New sign-ins always default to `role = 'student'` — this has to be done by
hand in the Supabase SQL Editor (or by asking Claude to run it via the
Supabase connector).

### Test name/date

Students never type these in. `sat_parser.parse_test_meta()` reads the
saved HTML page's own `<title>` tag — MyPractice titles it e.g.
`"MyPractice - SAT Practice 7 - August 7, 2025 - Details"` — and
`api/parse.py` patches `attempts.test_name`/`test_date` with the parsed
values once scoring finishes. The placeholder inserted at upload time only
survives if parsing fails before getting that far.

### Uploading on behalf of a student

Tutors/admins see an extra "Student email" field on `/upload` (with
autocomplete from known students). `uploadAttempt` resolves that email to
a `profiles.id` server-side and uses it for both `attempts.student_id` and
the Storage path — RLS's `WITH CHECK (student_id = auth.uid() OR
is_tutor())` is the actual enforcement, the email-lookup is just UX. The
target student must have signed in at least once already (so a `profiles`
row exists) — there's no "invite before they've signed up" path yet.

## File map

```
app/
  login/            Google sign-in (Server Action + callback route)
  upload/            Upload form, drag-and-drop, tutor "on behalf of" field
  dashboard/         Sortable attempts table (AttemptsTable.tsx is the client component)
  test/[id]/route.ts Branded score report (standalone HTML, bypasses app layout)
api/
  parse.py           Vercel Python function: downloads files, runs sat_parser, writes DB + Storage
  sat_parser.py      Parsing/scoring logic (HTML + PDF + Google Sheets item bank -> report JSON)
lib/
  supabase/          Browser/server Supabase client factories
  report-template/   skeleton.ts / script.ts / logo.ts — verbatim assets for the branded report,
                      stored as generated TS string constants (see note below)
  types.ts           Hand-written types mirroring the DB schema
  SiteHeader.tsx      Shared nav/header for the plain (non-report) pages
middleware.ts        Auth gate — redirects unauthenticated requests to /login
```

`lib/report-template/*.ts` are **generated, not hand-written**: the
original `dashboard_template.html`'s CSS/JS/logo were extracted and
`json.dumps()`'d into TS string constants (avoids any hand-escaping of the
script's own many backticks/`${}` template literals). If the branded report
design ever needs to change, easiest is to edit the extracted source and
regenerate, not hand-edit the generated `.ts` files directly (though direct
edits do work fine for small tweaks, as done for the "Go to my scored
tests" link).

There's no `schema.sql` committed to this repo — the live Supabase project
is the source of truth. The Data model section above is a snapshot; for
exact current DDL, query `information_schema`/`pg_policies` directly via
the Supabase connector.

## Backlog / discussed-but-not-built

- **Cumulative/historical/trends views** — chart a student's scaled score
  or skill accuracy across all their attempts over time. Schema-ready
  (`domain_results`/`skill_results` already keyed by `attempt_id`), just
  needs a query + UI.
- **Compare two tests** — pull two attempts' domain/skill rows side by
  side, show deltas. Same story, schema-ready.
- **True 3-tier permissions** (admin sees everyone; tutor sees only their
  assigned students; student sees only themselves) — needs a `tutor_id`
  column on `profiles` (nullable, set for students) and an updated
  `is_tutor()`/RLS check. Not built; currently every `tutor`/`admin` sees
  every student.
- **Pending invites** — let a tutor upload a test for a student who has
  never signed in yet (currently blocked: the email lookup requires an
  existing `profiles` row).
- **Per-student filter on the tutor dashboard** — once there are more than
  a handful of students, the single combined table will want a filter or
  "view as student" picker.

## Operational notes (for whoever/whatever works on this repo next)

- **Git push from an AI sandbox doesn't work** — outbound access to
  `github.com` is blocked from Claude's sandboxed shell in this
  environment (403 from an internal proxy). The pattern that's worked
  throughout this project: Claude edits files and runs `git commit`
  locally, then tells Michael to run `git push` himself in Git Bash.
- **This Dropbox-synced folder occasionally locks files** — editing a file
  that Dropbox is mid-sync on can fail with `EPERM: operation not
  permitted` on the rename step. Workaround that's worked: call
  `allow_cowork_file_delete` on the specific path, delete the file, then
  recreate it fresh with the new content (a brand-new inode isn't locked).
- **No local build/typecheck is possible from the sandbox** — `npm
  install`, `tsc`, and `pip install` all fail (the sandbox can't reach
  the npm registry or PyPI in this environment for some packages, and
  even where it can, there's no point installing without being able to
  run `next build`). `next.config.mjs` sets `typescript.ignoreBuildErrors`
  and `eslint.ignoreDuringBuilds` so a real type error doesn't block
  deployment — but it also means nothing catches type errors before
  Vercel's own build does. Read code carefully; when in doubt, check
  Vercel's deployment logs after pushing.
- **Supabase access** is via the Supabase MCP connector (direct SQL +
  migrations), not raw HTTP from the sandbox — this does work reliably.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values from Supabase project settings
npm run dev
```

`api/parse.py` only runs on Vercel — locally, uploads will get stuck at
"processing" unless you also run `vercel dev` (which emulates Vercel
Functions, including Python, locally). `npm run dev` alone is fine for
everything except the actual scoring step.

## Redeploying from scratch (reference only — already done once)

1. **Push to GitHub**: `git init && git add -A && git commit -m "..."`,
   create a repo, `git remote add origin <url> && git push -u origin main`.
2. **Google OAuth client**: [Google Auth Platform console](https://console.cloud.google.com/auth/overview) →
   create a Web application OAuth client. Authorized redirect URI must be
   exactly `https://zvvxmwnyrdzkrkbeftes.supabase.co/auth/v1/callback`.
   Authorized JavaScript origins: your Vercel URL + `http://localhost:3000`
   for local testing.
3. **Supabase Auth**: [Auth → Providers → Google](https://supabase.com/dashboard/project/zvvxmwnyrdzkrkbeftes/auth/providers) —
   paste in the Client ID/Secret from step 2.
4. **Vercel**: import the repo, set env vars (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
   `INTERNAL_API_SECRET`), deploy.
5. **Supabase Auth URL config**: [Auth → URL Configuration](https://supabase.com/dashboard/project/zvvxmwnyrdzkrkbeftes/auth/url-configuration) —
   Site URL + Redirect URLs must point at the real production URL, not
   `localhost` (this bit us once — sign-in redirected to
   `localhost:3000` and failed until fixed).
6. Promote your own account to `admin` (see Roles & RLS above).

## Maintenance

If College Board changes MyPractice's HTML or PDF layout, or the saved
page's `<title>` format changes, `api/sat_parser.py` (regexes against both
the HTML `<tr data-tr="...">` rows and the PDF's extracted text, plus
`parse_test_meta()` for the title) is what needs patching. The parser
already survived one real gotcha: if a student saves the Details page
without turning on "Show Correct Answers" and selecting "All" in the View
options first, the correct-answer column comes back empty and domain/skill
data ends up all zeros — the upload page's instructions exist specifically
to prevent this.
