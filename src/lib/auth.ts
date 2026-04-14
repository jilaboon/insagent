import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Get the authenticated user from the Supabase session.
 * Returns the user object or null if not authenticated.
 */
export async function getAuthUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Require authentication for API routes.
 * Returns the user and their email if authenticated, or a 401 JSON response.
 */
export async function requireAuth(): Promise<{
  user: Awaited<ReturnType<typeof getAuthUser>>;
  email: string;
  response: NextResponse | null;
}> {
  const user = await getAuthUser();
  if (!user) {
    return {
      user: null,
      email: "",
      response: NextResponse.json(
        { error: "לא מורשה — נדרשת התחברות" },
        { status: 401 }
      ),
    };
  }
  return { user, email: user.email ?? "", response: null };
}
