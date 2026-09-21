import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_MESSAGES, getAccess } from "@/lib/access";

// Handles the redirect back from Google via Supabase Auth: exchanges the
// one-time `code` for a session and sets the auth cookies. Then the gate:
// a student who isn't on the roster (or is inactive) is signed straight
// back out with a message, so only people Michael has entered get in.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const access = await getAccess(supabase);
      if (access && !access.allowed) {
        await supabase.auth.signOut();
        const message = ACCESS_MESSAGES[access.status as keyof typeof ACCESS_MESSAGES];
        return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not sign in with Google`);
}
