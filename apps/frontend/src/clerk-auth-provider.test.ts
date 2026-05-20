import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const providerSource = readFileSync(join(process.cwd(), "src/clerk-auth-provider.tsx"), "utf8");

describe("Clerk auth provider", () => {
  it("detects the hash-routed sign-up URL", () => {
    expect(providerSource).toContain("window.location.hash.includes(\"sign-up\")");
    expect(providerSource).not.toContain("window.location.pathname.includes(\"sign-up\")");
  });
});
