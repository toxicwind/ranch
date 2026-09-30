<script lang="ts">
  import RigAgents from './lib/RigAgents.svelte';
</script>
<main class="mx-auto max-w-6xl p-6">
  <header class="mb-6">
    <h1 class="text-2xl font-bold tracking-tight">🤠 Ranch Console</h1>
    <p class="text-sm text-stone-500">herd · rig · the whole spread, one screen</p>
  </header>
  <section class="mb-6 rounded-2xl border border-stone-800 bg-stone-950/80 p-4">
    <h2 class="mb-2 text-lg font-semibold tracking-tight">🐄 Herd</h2>
    <p class="text-sm text-stone-500">llama-swap multiplexer on <code class="text-stone-300">:25100</code> — router, keypool and model-guard live alongside.</p>
  </section>
  <RigAgents />
  <footer class="mt-6 text-xs text-stone-600">rig = OpenFang, now a first-class ranch component · served from herd/ui</footer>
</main>
