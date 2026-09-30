<script lang="ts">
  import { onMount } from 'svelte';
  import { listAgents, sendMessage, type RigAgent } from './api';
  let agents: RigAgent[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);
  let selected: RigAgent | null = $state(null);
  let draft = $state('');
  let sending = $state(false);
  let reply: string | null = $state(null);
  let replyError: string | null = $state(null);
  async function refresh() {
    loading = true; error = null;
    try { agents = await listAgents(); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { loading = false; }
  }
  function pick(a: RigAgent) { selected = a; draft = ''; reply = null; replyError = null; }
  async function send() {
    if (!selected || !draft.trim() || sending) return;
    sending = true; reply = null; replyError = null;
    try {
      const res = await sendMessage(selected.id, draft.trim());
      reply = JSON.stringify(res, null, 2); draft = '';
    } catch (e) { replyError = e instanceof Error ? e.message : String(e); }
    finally { sending = false; }
  }
  onMount(refresh);
</script>
<div class="rounded-2xl border border-stone-800 bg-stone-950/80 p-4">
  <div class="mb-3 flex items-center justify-between">
    <h2 class="text-lg font-semibold tracking-tight">🐴 Rig <span class="text-stone-500 font-normal">/ OpenFang agents</span></h2>
    <button onclick={refresh} class="rounded-lg border border-stone-700 px-3 py-1 text-sm hover:bg-stone-800" disabled={loading}>{loading ? '…' : '↻ refresh'}</button>
  </div>
  {#if error}
    <div class="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">kernel unreachable: {error}</div>
  {:else if loading}
    <div class="text-sm text-stone-500">loading agents…</div>
  {:else if agents.length === 0}
    <div class="text-sm text-stone-500">no agents registered</div>
  {:else}
    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {#each agents as a (a.id)}
        <button onclick={() => pick(a)} class="rounded-xl border p-3 text-left transition {selected?.id === a.id ? 'border-amber-600 bg-amber-950/30' : 'border-stone-800 bg-stone-900/60 hover:border-stone-600'}">
          <div class="flex items-center justify-between">
            <span class="font-medium">{a.persona || a.name}</span>
            <span class="h-2 w-2 rounded-full {a.ready ? 'bg-emerald-500' : 'bg-stone-600'}" title={a.state}></span>
          </div>
          <div class="mt-1 truncate text-xs text-stone-400">{a.model_provider}/{a.model_name}</div>
          {#if a.persona_role}<div class="mt-1 truncate text-xs text-stone-500">{a.persona_role}</div>{/if}
        </button>
      {/each}
    </div>
  {/if}
  {#if selected}
    <div class="mt-4 rounded-xl border border-stone-800 bg-stone-900/60 p-3">
      <div class="mb-2 text-sm font-medium">message → {selected.persona || selected.name} <span class="ml-2 text-xs text-stone-500">{selected.id.slice(0, 8)}</span></div>
      <div class="flex gap-2">
        <input bind:value={draft} onkeydown={(e) => e.key === 'Enter' && send()} placeholder="say something to the agent…" class="flex-1 rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm outline-none focus:border-amber-600" />
        <button onclick={send} disabled={sending || !draft.trim()} class="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-40">{sending ? '…' : 'send'}</button>
      </div>
      {#if reply}<pre class="mt-2 max-h-48 overflow-auto rounded-lg bg-stone-950 p-2 text-xs text-stone-300">{reply}</pre>{/if}
      {#if replyError}<div class="mt-2 rounded-lg border border-red-900 bg-red-950/40 p-2 text-xs text-red-300">{replyError}</div>{/if}
    </div>
  {/if}
</div>
