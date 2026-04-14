import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import type { UserRole } from "@prisma/client";

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
 * Returns the user, their email, role, userId, or a 401 JSON response.
 * Looks up the internal User record in Prisma by email.
 */
export async function requireAuth(): Promise<{
  user: Awaited<ReturnType<typeof getAuthUser>>;
  email: string;
  role: UserRole | null;
  userId: string | null;
  response: NextResponse | null;
}> {
  const user = await getAuthUser();
  if (!user) {
    return {
      user: null,
      email: "",
      role: null,
      userId: null,
      response: NextResponse.json(
        { error: "לא מורשה — נדרשת התחברות" },
        { status: 401 }
      ),
    };
  }

  const email = user.email ?? "";

  // Look up internal User record by email
  let role: UserRole | null = null;
  let userId: string | null = null;
  if (email) {
    const internalUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true },
    });
    if (internalUser) {
      role = internalUser.role;
      userId = internalUser.id;
    }
  }

  return { user, email, role, userId, response: null };
}

/**
 * Check if the user has one of the required roles.
 * Returns a 403 response if the role check fails, or null if allowed.
 */
export function requireRole(
  userRole: UserRole | null,
  allowedRoles: UserRole[]
): NextResponse | null {
  if (!userRole || !allowedRoles.includes(userRole)) {
    return NextResponse.json(
      { error: "אין הרשאה לפעולה זו" },
      { status: 403 }
    );
  }
  return null;
}
