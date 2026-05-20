import type { AgentScope } from "./agent-auth";

export type AgentAuditOperation = "capabilities" | "claim" | "validate" | "submit" | "fail";
export type AgentAuditStatus = "success" | "unauthorized" | "forbidden" | "not_found" | "invalid" | "conflict" | "error";

export interface AgentAuditEvent {
  agentId?: string;
  operation: AgentAuditOperation;
  reviewJobId?: string;
  status: AgentAuditStatus;
  requiredScopes?: AgentScope[];
  timestamp: Date;
}

export interface AgentAuditLog {
  record(event: AgentAuditEvent): Promise<void>;
}
