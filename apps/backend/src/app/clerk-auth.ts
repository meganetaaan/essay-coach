import {
  createHttpActorResolver,
  type ClerkSessionVerifier,
  type HttpActorResolver
} from "../interfaces/http/auth-context";

export interface ClerkAuthEnv {
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  ESSAY_COACH_ALLOWED_EMAILS?: string;
  ESSAY_COACH_ALLOW_DEV_AUTH_HEADER_FALLBACK?: string;
}

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type ClerkJwtPayload = {
  iss?: string;
  sub?: string;
  azp?: string;
  exp?: number;
  nbf?: number;
  email?: string;
  primary_email_address?: string;
};

type ClerkUserEmailAddress = {
  id?: string;
  email_address?: string;
};

type ClerkUserResponse = {
  primary_email_address_id?: string;
  email_addresses?: ClerkUserEmailAddress[];
};

type ClerkJsonWebKey = JsonWebKey & { kid?: string };

type JsonWebKeySet = {
  keys?: ClerkJsonWebKey[];
};

const jwksCacheTtlMilliseconds = 5 * 60 * 1000;
const jwksCache = new Map<string, { expiresAt: number; promise: Promise<JsonWebKeySet> }>();

function nonBlank(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseAuthorizedParties(raw: string | undefined): string[] | undefined {
  const values = raw
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

function parseAllowedEmails(raw: string | undefined): string[] | undefined {
  const values = raw
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

function extractBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization")?.trim();
  return /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim();
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function expectedIssuerFromPublishableKey(publishableKey: string): string | undefined {
  const encodedInstance = publishableKey.replace(/^pk_(?:test|live)_/, "");
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(encodedInstance)).replace(/\$$/, "");
    return decoded ? `https://${decoded}` : undefined;
  } catch {
    return undefined;
  }
}

async function loadJwks(issuer: string, options: { forceRefresh?: boolean } = {}): Promise<JsonWebKeySet> {
  const cached = jwksCache.get(issuer);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = fetch(`${issuer}/.well-known/jwks.json`).then(async (response) => {
    if (!response.ok) throw new Error("Clerk JWKS request failed");
    return (await response.json()) as JsonWebKeySet;
  });
  jwksCache.set(issuer, { expiresAt: Date.now() + jwksCacheTtlMilliseconds, promise });

  try {
    return await promise;
  } catch (error) {
    if (jwksCache.get(issuer)?.promise === promise) jwksCache.delete(issuer);
    throw error;
  }
}

function emailFromJwtPayload(payload: ClerkJwtPayload): string | undefined {
  return nonBlank(payload.email) ?? nonBlank(payload.primary_email_address);
}

async function fetchClerkPrimaryEmail(input: { userId: string; secretKey: string }): Promise<string | undefined> {
  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(input.userId)}`, {
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error("Clerk user request failed");

  const user = (await response.json()) as ClerkUserResponse;
  const primary = user.email_addresses?.find((email) => email.id === user.primary_email_address_id);
  return nonBlank(primary?.email_address) ?? nonBlank(user.email_addresses?.[0]?.email_address);
}

async function verifyClerkJwt(input: {
  token: string;
  publishableKey: string;
  authorizedParties?: string[];
}): Promise<ClerkJwtPayload> {
  const [encodedHeader, encodedPayload, encodedSignature] = input.token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Malformed JWT");

  const header = decodeJson<JwtHeader>(encodedHeader);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported JWT header");

  const payload = decodeJson<ClerkJwtPayload>(encodedPayload);
  const expectedIssuer = expectedIssuerFromPublishableKey(input.publishableKey);
  if (!payload.iss || !expectedIssuer || payload.iss !== expectedIssuer) throw new Error("Unexpected Clerk issuer");

  if (input.authorizedParties && !input.authorizedParties.includes(String(payload.azp ?? ""))) {
    throw new Error("Unexpected authorized party");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp <= nowSeconds) throw new Error("Expired JWT");
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) throw new Error("JWT not yet valid");

  let jwks = await loadJwks(payload.iss);
  let jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  if (!jwk) {
    jwks = await loadJwks(payload.iss, { forceRefresh: true });
    jwk = jwks.keys?.find((candidate) => candidate.kid === header.kid);
  }
  if (!jwk) throw new Error("Clerk signing key not found");

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify"
  ]);
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(decodeBase64Url(encodedSignature)),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!verified) throw new Error("Invalid JWT signature");

  return payload;
}

export function createClerkSessionVerifier(input: {
  publishableKey: string;
  authorizedParties?: string[];
  secretKey?: string;
}): ClerkSessionVerifier {
  return async (request) => {
    const token = extractBearerToken(request);
    if (!token) return { ok: false, error: "clerk_session_missing" };

    try {
      const payload = await verifyClerkJwt({ token, publishableKey: input.publishableKey, authorizedParties: input.authorizedParties });
      const userId = payload.sub?.trim();
      if (!userId) return { ok: false, error: "clerk_session_invalid" };

      const email = emailFromJwtPayload(payload) ?? (input.secretKey ? await fetchClerkPrimaryEmail({ userId, secretKey: input.secretKey }) : undefined);
      return { ok: true, value: email ? { userId, email } : { userId } };
    } catch {
      return { ok: false, error: "clerk_session_invalid" };
    }
  };
}

export function createClerkActorResolverFromEnv(env: ClerkAuthEnv): HttpActorResolver {
  const publishableKey = nonBlank(env.CLERK_PUBLISHABLE_KEY);
  const secretKey = nonBlank(env.CLERK_SECRET_KEY);
  const allowDevHeaderFallback = env.ESSAY_COACH_ALLOW_DEV_AUTH_HEADER_FALLBACK === "true";

  return createHttpActorResolver({
    verifier: publishableKey
      ? createClerkSessionVerifier({
          publishableKey,
          secretKey,
          authorizedParties: parseAuthorizedParties(env.CLERK_AUTHORIZED_PARTIES)
        })
      : async () => ({ ok: false, error: "clerk_session_missing" }),
    allowDevHeaderFallback,
    allowedEmails: parseAllowedEmails(env.ESSAY_COACH_ALLOWED_EMAILS)
  });
}
