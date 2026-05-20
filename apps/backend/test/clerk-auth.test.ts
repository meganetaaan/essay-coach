import { describe, expect, it, vi } from "vitest";
import { createClerkSessionVerifier } from "../src/app/clerk-auth";

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function publishableKeyForIssuerHost(host: string): string {
  return `pk_test_${Buffer.from(`${host}$`).toString("base64url")}`;
}

function unsignedTokenForIssuer(input: { issuer: string; kid: string }): string {
  return [
    base64UrlJson({ alg: "RS256", kid: input.kid }),
    base64UrlJson({ iss: input.issuer, sub: "user_123", exp: Math.floor(Date.now() / 1000) + 60 }),
    Buffer.from("invalid-signature").toString("base64url")
  ].join(".");
}

describe("Clerk session verifier", () => {
  it("does not cache a failed JWKS request forever", async () => {
    const issuerHost = "clerk.example.com";
    const kid = "rotating-key";
    const token = unsignedTokenForIssuer({ issuer: `https://${issuerHost}`, kid });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("temporary outage", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          keys: [
            {
              kty: "RSA",
              kid,
              alg: "RS256",
              use: "sig",
              n: "sXchWzEyMzQ1Njc4OTA123456789012345678901234567890123456789012345678901234567890",
              e: "AQAB"
            }
          ]
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const verifier = createClerkSessionVerifier({ publishableKey: publishableKeyForIssuerHost(issuerHost) });
      const request = new Request("http://localhost/api", { headers: { authorization: `Bearer ${token}` } });

      await expect(verifier(request)).resolves.toEqual({ ok: false, error: "clerk_session_invalid" });
      await expect(verifier(request)).resolves.toEqual({ ok: false, error: "clerk_session_invalid" });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
