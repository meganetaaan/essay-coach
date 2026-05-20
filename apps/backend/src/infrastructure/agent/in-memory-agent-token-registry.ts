import { createHash } from "node:crypto";
import type { AgentScope, AgentTokenRegistry, AuthenticatedAgent } from "../../application/ports/agent-auth";

export interface InMemoryAgentTokenRecord {
  agentId: string;
  token?: string;
  tokenHash?: string;
  scopes: AgentScope[];
}

export class InMemoryAgentTokenRegistry implements AgentTokenRegistry {
  private readonly recordsByTokenHash = new Map<string, AuthenticatedAgent>();

  constructor(records: InMemoryAgentTokenRecord[]) {
    for (const record of records) {
      const tokenHash = record.tokenHash ?? (record.token ? hashToken(record.token) : undefined);
      if (!tokenHash) throw new Error(`Agent token hash is required for ${record.agentId}`);
      this.recordsByTokenHash.set(tokenHash, {
        agentId: record.agentId,
        scopes: [...record.scopes]
      });
    }
  }

  async verifyToken(token: string): Promise<AuthenticatedAgent | undefined> {
    const record = this.recordsByTokenHash.get(hashToken(token));
    return record ? { agentId: record.agentId, scopes: [...record.scopes] } : undefined;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function parseAgentTokenRecordsFromJson(value?: string, variableName = "ESSAY_COACH_AGENT_TOKENS_JSON"): InMemoryAgentTokenRecord[] {
  if (value === undefined || value.trim() === "") return [];

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${variableName} must be a JSON array.`);

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`${variableName}[${index}] must be an object.`);
    const record = entry as Record<string, unknown>;
    if (typeof record.agentId !== "string" || record.agentId.length === 0) {
      throw new Error(`${variableName}[${index}].agentId must be a non-empty string.`);
    }
    const rawToken = record.token;
    const rawTokenHash = record.tokenHash;
    if (rawToken !== undefined && typeof rawToken !== "string") throw new Error(`${variableName}[${index}].token must be a string.`);
    if (rawTokenHash !== undefined && typeof rawTokenHash !== "string") {
      throw new Error(`${variableName}[${index}].tokenHash must be a string.`);
    }
    const token = rawToken as string | undefined;
    const tokenHash = rawTokenHash as string | undefined;
    if (token === undefined && tokenHash === undefined) {
      throw new Error(`${variableName}[${index}] must include tokenHash or a runtime-only token.`);
    }
    if (!Array.isArray(record.scopes) || !record.scopes.every(isAgentScope)) {
      throw new Error(`${variableName}[${index}].scopes must be valid agent scopes.`);
    }
    return {
      agentId: record.agentId,
      token,
      tokenHash,
      scopes: record.scopes
    };
  });
}

function isAgentScope(value: unknown): value is AgentScope {
  return value === "review:claim" || value === "review:validate" || value === "review:submit" || value === "review:fail";
}
