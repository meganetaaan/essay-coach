import { describe, expect, it } from "vitest";
import {
  createHttpActorResolver,
  resolveActorFromRequest,
  type ClerkSessionVerifier
} from "../src/interfaces/http/auth-context";

describe("HTTP auth context", () => {
  it("reports missing auth when no bearer session is present", async () => {
    const resolver = createHttpActorResolver({
      verifier: async () => ({ ok: false, error: "clerk_session_missing" }),
      allowDevHeaderFallback: false
    });

    await expect(resolveActorFromRequest(new Request("http://localhost/api"), resolver)).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: "auth_context_missing" }
    });
  });

  it("resolves a valid Clerk session into an authenticated actor", async () => {
    const verifier: ClerkSessionVerifier = async () => ({ ok: true, value: { userId: "user_123" } });
    const resolver = createHttpActorResolver({ verifier, allowDevHeaderFallback: false });

    await expect(resolveActorFromRequest(new Request("http://localhost/api"), resolver)).resolves.toEqual({
      ok: true,
      actor: { userId: "user_123" }
    });
  });

  it("allows only configured email addresses when an allowlist is present", async () => {
    const verifier: ClerkSessionVerifier = async () => ({
      ok: true,
      value: { userId: "user_123", email: "ISHIKAWA.S.1027@gmail.com" }
    });
    const resolver = createHttpActorResolver({
      verifier,
      allowDevHeaderFallback: false,
      allowedEmails: ["ishikawa.s.1027@gmail.com"]
    });

    await expect(resolveActorFromRequest(new Request("http://localhost/api"), resolver)).resolves.toEqual({
      ok: true,
      actor: { userId: "user_123", email: "ISHIKAWA.S.1027@gmail.com" }
    });
  });

  it("rejects a signed-in Clerk user whose email address is not allowed", async () => {
    const verifier: ClerkSessionVerifier = async () => ({
      ok: true,
      value: { userId: "user_456", email: "someone@example.com" }
    });
    const resolver = createHttpActorResolver({
      verifier,
      allowDevHeaderFallback: false,
      allowedEmails: ["ishikawa.s.1027@gmail.com"]
    });

    await expect(resolveActorFromRequest(new Request("http://localhost/api"), resolver)).resolves.toEqual({
      ok: false,
      status: 403,
      body: { error: "auth_context_forbidden" }
    });
  });

  it("rejects a signed-in Clerk user with no email when an allowlist is present", async () => {
    const verifier: ClerkSessionVerifier = async () => ({ ok: true, value: { userId: "user_789" } });
    const resolver = createHttpActorResolver({
      verifier,
      allowDevHeaderFallback: false,
      allowedEmails: ["ishikawa.s.1027@gmail.com"]
    });

    await expect(resolveActorFromRequest(new Request("http://localhost/api"), resolver)).resolves.toEqual({
      ok: false,
      status: 403,
      body: { error: "auth_context_forbidden" }
    });
  });

  it("does not let invalid Clerk auth fall back to dev headers", async () => {
    const resolver = createHttpActorResolver({
      verifier: async () => ({ ok: false, error: "clerk_session_invalid" }),
      allowDevHeaderFallback: true
    });
    const request = new Request("http://localhost/api", {
      headers: {
        "x-essay-coach-dev-user-id": "user_from_header"
      }
    });

    await expect(resolveActorFromRequest(request, resolver)).resolves.toEqual({
      ok: false,
      status: 401,
      body: { error: "auth_context_invalid" }
    });
  });

  it("allows explicit dev header fallback only when Clerk auth is missing", async () => {
    const resolver = createHttpActorResolver({
      verifier: async () => ({ ok: false, error: "clerk_session_missing" }),
      allowDevHeaderFallback: true
    });
    const request = new Request("http://localhost/api", {
      headers: {
        "x-essay-coach-dev-user-id": "user_from_header"
      }
    });

    await expect(resolveActorFromRequest(request, resolver)).resolves.toEqual({
      ok: true,
      actor: { userId: "user_from_header" }
    });
  });
});
