/**
 * Drover ACP (Agent Client Protocol) Bridge & Host
 */

export interface ACPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface ACPAgentSession {
  id: string;
  agentName: string;
  connectedAt: number;
  status: 'active' | 'idle' | 'disconnected';
  permissions: {
    fsRead: boolean;
    fsWrite: boolean;
    terminalExec: boolean;
  };
}

export class ACPBridge {
  private sessions: Map<string, ACPAgentSession> = new Map();
  private trafficLog: ACPMessage[] = [];
  public autoApprovePermissions: boolean = false;

  constructor(autoApprove: boolean = false) {
    this.autoApprovePermissions = autoApprove;
  }

  connectAgent(id: string, agentName: string): ACPAgentSession {
    const session: ACPAgentSession = {
      id,
      agentName,
      connectedAt: Date.now(),
      status: 'active',
      permissions: {
        fsRead: true,
        fsWrite: this.autoApprovePermissions,
        terminalExec: this.autoApprovePermissions
      }
    };
    this.sessions.set(id, session);
    return session;
  }

  disconnectAgent(id: string): boolean {
    const s = this.sessions.get(id);
    if (s) {
      s.status = 'disconnected';
      return true;
    }
    return false;
  }

  getSession(id: string): ACPAgentSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): ACPAgentSession[] {
    return Array.from(this.sessions.values());
  }

  logMessage(msg: ACPMessage): void {
    this.trafficLog.push(msg);
    if (this.trafficLog.length > 500) {
      this.trafficLog.shift();
    }
  }

  getTrafficLog(): ACPMessage[] {
    return [...this.trafficLog];
  }

  clearTrafficLog(): void {
    this.trafficLog = [];
  }

  handleRPC(req: ACPMessage): ACPMessage {
    this.logMessage(req);

    if (req.method === 'ping') {
      const resp: ACPMessage = {
        jsonrpc: '2.0',
        id: req.id,
        result: { status: 'pong', timestamp: Date.now() }
      };
      this.logMessage(resp);
      return resp;
    }

    if (req.method === 'agent/register') {
      const { agentId, name } = req.params || {};
      const session = this.connectAgent(agentId || 'default-agent', name || 'Agent');
      const resp: ACPMessage = {
        jsonrpc: '2.0',
        id: req.id,
        result: { sessionId: session.id, status: session.status }
      };
      this.logMessage(resp);
      return resp;
    }

    if (req.method === 'agent/permission/request') {
      const { permission, sessionId } = req.params || {};
      const s = this.sessions.get(sessionId);
      const approved = this.autoApprovePermissions;
      if (s && permission in s.permissions) {
        (s.permissions as any)[permission] = approved;
      }
      const resp: ACPMessage = {
        jsonrpc: '2.0',
        id: req.id,
        result: { permission, approved }
      };
      this.logMessage(resp);
      return resp;
    }

    const errResp: ACPMessage = {
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32601,
        message: `Method not found: ${req.method}`
      }
    };
    this.logMessage(errResp);
    return errResp;
  }
}
