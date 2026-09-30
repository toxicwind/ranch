export interface RigAgent {
  id: string; name: string; persona: string; persona_role: string | null;
  model_name: string; model_provider: string; state: string;
  ready: boolean; is_inferencing: boolean; last_active: string;
}
export async function listAgents(): Promise<RigAgent[]> {
  const res = await fetch('/api/rig/agents');
  if (!res.ok) throw new Error('agents ' + res.status);
  return res.json();
}
export async function sendMessage(id: string, message: string): Promise<unknown> {
  const res = await fetch('/api/rig/agents/' + encodeURIComponent(id) + '/message', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const body = await res.json().catch(() => ({ raw: res.statusText }));
  if (!res.ok) throw new Error((body as { error?: string }).error || ('message ' + res.status));
  return body;
}
