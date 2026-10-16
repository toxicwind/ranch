import { describe, it, expect } from 'bun:test';
import { ACPBridge } from '../src/acp/index';

describe('ACPBridge (Agent Client Protocol)', () => {
  it('should manage agent connection sessions', () => {
    const bridge = new ACPBridge(false);
    const session = bridge.connectAgent('agent-1', 'Copilot');

    expect(session.id).toBe('agent-1');
    expect(session.status).toBe('active');
    expect(session.permissions.fsWrite).toBe(false);

    expect(bridge.getSession('agent-1')).toBeDefined();
    expect(bridge.getAllSessions().length).toBe(1);

    expect(bridge.disconnectAgent('agent-1')).toBe(true);
    expect(bridge.getSession('agent-1')?.status).toBe('disconnected');
    expect(bridge.disconnectAgent('non-existent')).toBe(false);
  });

  it('should handle ping RPC method', () => {
    const bridge = new ACPBridge();
    const resp = bridge.handleRPC({
      jsonrpc: '2.0',
      id: 1,
      method: 'ping'
    });

    expect(resp.result?.status).toBe('pong');
    expect(resp.error).toBeUndefined();
    expect(bridge.getTrafficLog().length).toBe(2); // request + response
  });

  it('should handle agent/register RPC method', () => {
    const bridge = new ACPBridge();
    const resp = bridge.handleRPC({
      jsonrpc: '2.0',
      id: 'req-reg',
      method: 'agent/register',
      params: { agentId: 'tau-agent', name: 'Tau' }
    });

    expect(resp.result?.sessionId).toBe('tau-agent');
    expect(resp.result?.status).toBe('active');
  });

  it('should handle permission requests with autoApprove flag', () => {
    const bridgeStrict = new ACPBridge(false);
    bridgeStrict.connectAgent('s1', 'TestAgent');
    const respStrict = bridgeStrict.handleRPC({
      jsonrpc: '2.0',
      id: 10,
      method: 'agent/permission/request',
      params: { sessionId: 's1', permission: 'fsWrite' }
    });
    expect(respStrict.result?.approved).toBe(false);

    const bridgeAuto = new ACPBridge(true);
    bridgeAuto.connectAgent('s2', 'TestAgent2');
    const respAuto = bridgeAuto.handleRPC({
      jsonrpc: '2.0',
      id: 11,
      method: 'agent/permission/request',
      params: { sessionId: 's2', permission: 'fsWrite' }
    });
    expect(respAuto.result?.approved).toBe(true);
  });

  it('should return -32601 error for unknown RPC method', () => {
    const bridge = new ACPBridge();
    const resp = bridge.handleRPC({
      jsonrpc: '2.0',
      id: 99,
      method: 'unknown/method'
    });

    expect(resp.error?.code).toBe(-32601);
    expect(resp.error?.message).toContain('Method not found');
  });

  it('should clear traffic log', () => {
    const bridge = new ACPBridge();
    bridge.handleRPC({ jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(bridge.getTrafficLog().length).toBeGreaterThan(0);
    bridge.clearTrafficLog();
    expect(bridge.getTrafficLog().length).toBe(0);
  });
});
