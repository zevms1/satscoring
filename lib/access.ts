import { createClient } from "@/lib/supabase/server";

// Who the signed-in user is and whether they may use the app. Students
// must be on the roster (students table) and active; admins and tutors
// always may. link_my_student() also links a student's profile to their
// roster row by email if that hasn't happened yet, so a student added to
// the roster after they first signed in still gets through.
export type AccessStatus = "staff" | "active" | "inactive" | "unlinked";

export interface Access {
  userId: string;
  email: string | null;
  role: "admin" | "tutor" | "student";
  status: AccessStatus;
  allowed: boolean;
}

export async function getAccess(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Access | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: status }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.rpc("link_my_student"),
  ]);
  const role = ((profile as { role: string } | null)?.role ?? "student") as Access["role"];
  const s = (typeof status === "string" ? status : "unlinked") as AccessStatus;
  return { userId: user.id, email: user.email ?? null, role, status: s, allowed: s === "staff" || s === "active" };
}

export const ACCESS_MESSAGES: Record<Exclude<AccessStatus, "staff" | "active">, string> = {
  unlinked:
    "That Google account isn't on the student roster yet. Ask Michael to add you (using this same email), then sign in again.",
  inactive: "Your account is inactive. Your tests are still on file; ask Michael if you'd like it reactivated.",
};
