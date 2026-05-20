import type { AgentAuditEvent, AgentAuditLog } from "../../application/ports/agent-audit-log";

export class InMemoryAgentAuditLog implements AgentAuditLog {
  private readonly events: AgentAuditEvent[] = [];

  async record(event: AgentAuditEvent): Promise<void> {
    this.events.push({ ...event, timestamp: new Date(event.timestamp.getTime()) });
  }

  async list(): Promise<AgentAuditEvent[]> {
    return this.events.map((event) => ({ ...event, timestamp: new Date(event.timestamp.getTime()) }));
  }
}
