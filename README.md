# Unique Prep Student Dashboard

Next.js (App Router) app + a Python serverless function that wraps
`sat_parser.py`. Students sign in with Google, upload their two MyPractice
files, and get a scored, domain/skill-level breakdown backed by Supabase
(Postgres + Auth + Storage).

## What's already done

- Supabase project `unique-prep-dashboard` is live: tables, RLS, and the
  `attempt-files` storage bucket are all created (see `../schema.sql`).
- This app is fully written. What's left is account/config setup below,
  then deploying.

## 1. Push this to GitHub

```bash
cd unique-prep-dashboard
git init
git add -A
git commit -m "Initial Unique Prep dashboard"
```

Create a new (private) repo on GitHub and push to it — either via the
`gh` CLI or the GitHub website's "create repository" flow, then:

```bash
git remote add origin <your-repo-url>
git push -u origin main
```

## 2. Create the Google OAuth client

Google sign-in needs a Client ID + Secret from Google Cloud, wired into
Supabase Auth. This only has to be done once.

1. Go to the [Google Auth Platform console](https://console.cloud.google.com/auth/overview)
   and create/select a Google Cloud project for Unique Prep.
2. Under **Data Access (Scopes)**, make sure these are present: `openid`
   (add manually), `.../auth/userinfo.email`, `.../auth/userinfo.profile`
   (the last two are added by default). Don't add anything else — extra
   scopes can trigger a slow Google verification review.
3. Go to [Clients](https://console.cloud.google.com/auth/clients/create) →
   **Create OAuth client ID** → application type **Web application**.
4. Under **Authorized JavaScript origins**, add your production URL (you'll
   get this from Vercel in step 4 — you can come back and add it after) and,
   for local testing, `http://localhost:3000`.
5. Under **Authorized redirect URIs**, add your Supabase project's auth
   callback URL exactly:

   ```
   https://zvvxmwnyrdzkrkbeftes.supabase.co/auth/v1/callback
   ```

6. Click **Create**. Copy the **Client ID** and **Client Secret** — you'll
   need them in the next step.

## 3. Enable Google in Supabase Auth

1. Open [Auth → Providers → Google](https://supabase.com/dashboard/project/zvvxmwnyrdzkrkbeftes/auth/providers)
   in the Supabase dashboard.
2. Toggle it on, paste in the **Client ID** and **Client Secret** from step 2,
   and save.

## 4. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo
   you pushed in step 1. Vercel auto-detects Next.js.
2. Under **Environment Variables**, add (values from Supabase → Project
   Settings → API, and Project Settings → API → service_role secret key):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://zvvxmwnyrdzkrkbeftes.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_04S_-K3YIaHvY8jB09YrXA_kAV4VQez` |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(copy from Supabase dashboard — keep secret)* |
   | `INTERNAL_API_SECRET` | *(any random string, e.g. output of `openssl rand -hex 32`)* |

3. Click **Deploy**.
4. Once deployed, copy your production URL (e.g. `https://unique-prep-dashboard.vercel.app`)
   and go back to the [Google Auth Platform console](https://console.cloud.google.com/auth/clients)
   to add it under **Authorized JavaScript origins** on the OAuth client from
   step 2.
5. Also add it in Supabase: [Auth → URL Configuration](https://supabase.com/dashboard/project/zvvxmwnyrdzkrkbeftes/auth/url-configuration) →
   set **Site URL** to your Vercel URL, and add
   `https://<your-vercel-url>/auth/callback` to **Redirect URLs**.

## 5. Try it

Visit your Vercel URL, sign in with Google, and upload a test's two files
from the Upload page. The Python function (`api/parse.py`) runs
`sat_parser.py` against them and writes the scored results — you'll land on
the results page once it finishes (usually a few seconds).

To see your own data as a tutor rather than a student, promote your account
once you've signed in at least once:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

(Run this in the Supabase SQL Editor.)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

The Python function (`api/parse.py`) only runs on Vercel — locally, uploads
will get stuck at "processing" unless you also run `vercel dev` (which
emulates Vercel Functions, including Python, locally). `npm run dev` alone
is fine for working on everything except the actual scoring step.

## What's not built yet (see the project's phased plan)

- **Compare-two-tests / trends-over-time views** (Phase 2) — the DB schema
  already supports this (`domain_results`/`skill_results` across multiple
  `attempts` per student), just needs the UI.
- **Tutor/admin view across all students** — `profiles.role` and the RLS
  policies already support this (a `tutor`/`admin` account can read
  everyone's data), just needs a `/admin` page.
- **The polished branded HTML report** (from `dashboard_template.html` /
  `render_dashboard.py` in the original chat) isn't wired in — this app
  renders its own simpler in-app dashboard instead. The full raw parser
  output is saved to Storage at `report_json_path` on each attempt, so it's
  available if you want to render the branded version later.
- **Maintenance**: if College Board changes MyPractice's HTML or PDF layout,
  `api/sat_parser.py` (identical to `sat_parser.py` from the other chat) is
  what needs patching.
