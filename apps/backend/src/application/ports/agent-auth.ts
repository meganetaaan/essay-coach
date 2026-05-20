export type AgentScope = "review:claim" | "review:validate" | "review:submit" | "review:fail";

export interface AuthenticatedAgent {
  agentId: string;
  scopes: AgentScope[];
}

export interface AgentTokenRegistry {
  verifyToken(token: string): Promise<AuthenticatedAgent | undefined>;
}
