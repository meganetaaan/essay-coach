export interface AuthenticatedActor {
  userId: string;
  email?: string;
}

export type ClerkSessionVerificationError = "clerk_session_missing" | "clerk_session_invalid";
export type HttpAuthContextError = "auth_context_missing" | "auth_context_invalid" | "auth_context_forbidden";

export type ClerkSessionVerifier = (
  request: Request
) => Promise<{ ok: true; value: AuthenticatedActor } | { ok: false; error: ClerkSessionVerificationError }>;

export type HttpActorResolver = (
  request: Request
) => Promise<{ ok: true; actor: AuthenticatedActor } | { ok: false; error: HttpAuthContextError }>;

export async function resolveActorFromRequest(
  request: Request,
  resolver: HttpActorResolver
): Promise<{ ok: true; actor: AuthenticatedActor } | { ok: false; status: 401 | 403; body: { error: string } }> {
  const result = await resolver(request);
  if (result.ok) return result;
  return {
    ok: false,
    status: result.error === "auth_context_forbidden" ? 403 : 401,
    body: { error: result.error }
  };
}

function normalizeEmail(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}

export function createHttpActorResolver(input: {
  verifier: ClerkSessionVerifier;
  allowDevHeaderFallback: boolean;
  allowedEmails?: readonly string[];
}): HttpActorResolver {
  const allowedEmails = new Set(input.allowedEmails?.map(normalizeEmail).filter((value): value is string => Boolean(value)) ?? []);

  return async (request) => {
    const session = await input.verifier(request);
    if (session.ok) {
      const userId = session.value.userId.trim();
      if (userId.length === 0) return { ok: false, error: "auth_context_invalid" };

      const email = normalizeEmail(session.value.email);
      if (allowedEmails.size > 0 && (!email || !allowedEmails.has(email))) {
        return { ok: false, error: "auth_context_forbidden" };
      }

      return {
        ok: true,
        actor: session.value.email === undefined ? { userId } : { userId, email: session.value.email }
      };
    }

    if (session.error === "clerk_session_invalid") {
      return { ok: false, error: "auth_context_invalid" };
    }

    if (input.allowDevHeaderFallback) {
      const userId = request.headers.get("x-essay-coach-dev-user-id")?.trim();
      if (userId) return { ok: true, actor: { userId } };
    }

    return { ok: false, error: "auth_context_missing" };
  };
}
