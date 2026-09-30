// SPARKFALL phase 3 — organize + rename the Dropbox mirror.
// Reads /home/toxic/dropbox-mirror (4 shards, read-only), builds
// /home/toxic/dropbox-mirror/organized/ and writes rename manifests into
// /home/toxic/sovereign/projects/range/ranch/spark/manifests/.
// Run: bun organize-phase3.ts   (on yote, as user toxic)
// NEVER deletes or touches the shard dirs.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const MIRROR = '/home/toxic/dropbox-mirror';
const ORG = join(MIRROR, 'organized');
const MANIFESTS = '/home/toxic/sovereign/projects/range/ranch/spark/manifests';

const SHARD_ROOTS: Record<string, string> = {
  'shard-a': join(MIRROR, 'shard-a', 'shard-a'),
  'shard-b': join(MIRROR, 'shard-b', 'shard-b'),
  'shard-c': join(MIRROR, 'shard-c'),
  'shard-d': join(MIRROR, 'shard-d', 'shard-d'),
};

// [dropbox path, new kebab-case repo name] — 23 repo candidates
const REPOS: Array<[string, string]> = [
  ['/Sovereign_Master_Orchestrator/2026-09-28T13-38-49_toolchain_doctor_ast_bm25_star_repo', 'toolchain-doctor'],
  ['/Sovereign_Master_Orchestrator/phytovapor', 'phytovapor'],
  ['/Sovereign_Master_Orchestrator/sovereign_hatch_toolkit', 'sovereign-hatch-toolkit'],
  ['/Sovereign_Master_Orchestrator/sovereign_mesh', 'sovereign-mesh'],
  ['/Sovereign_Master_Orchestrator/telemetric_runtime_oracle', 'telemetric-runtime-oracle'],
  ['/Sovereign_Political_Ad_Intel_Engine_20260929T134500/postal_spectre', 'postal-spectre-usps'],
  ['/Sovereign_AST_BM25_Hybrid_Engine_20260928T134500', 'dualspace-ast-bm25-hybrid'],
  ['/Sovereign_Political_Ad_Intel_Engine_20260929T134500', 'political-ad-intel-engine'],
  ['/Sovereign_PostalSpectre_Engine_20260929T141600', 'postal-spectre'],
  ['/Sovereign_Postal_Spectre_ESM', 'postal-spectre-detector'],
  ['/Sovereign_Postal_Spectre_ESM_20260929', 'postal-spectre-correlator'],
  ['/Sovereign_Star_Repo_Bayesian_Knapsack_Bandit_20260929T141500', 'bayesian-knapsack-bandit'],
  ['/Sovereign_Star_Repo_DualSpace_AST_BM25_20260928T134531', 'dualspace-ast-bm25'],
  ['/Sovereign_Star_Repo_DualSpace_AST_BM25_20260928T134642', 'dualspace-ast-bm25-v2'],
  ['/Sovereign_Star_Repo_Gatehouse_TwoTier_MCP_20260929T141500', 'gatehouse'],
  ['/Sovereign_Star_Repo_Herd_KeyPool_Gateway_20260929T134600', 'herd-keypool-gateway'],
  ['/Sovereign_Star_Repo_Hyper_Racer_20260929T144000', 'hyper-racer'],
  ['/Sovereign_Star_Repo_MetaClaw_Runtime_20260929T213000', 'metaclaw-runtime'],
  ['/Sovereign_Star_Repo_Olfactory_Headspace_Engine_20260929T134000', 'olfactory-headspace-engine'],
  ['/Sovereign_Star_Repo_Ranch_Interlock_20260929T220000', 'ranch-interlock'],
  ['/Sovereign_Star_Repo_Skills_Hub_20260929T140500', 'sovereign-skills-hub'],
  ['/Sovereign_Star_Repo_Universal_KeyPool_Bun_20260929T141500', 'universal-keypool-bun'],
  ['/Sovereign_Star_Repo_Universal_KeyPool_Gateway_20260929T141000', 'universal-keypool-gateway'],
];
// longest-prefix first so nested candidates (postal_spectre inside political-ad-intel) win
const REPOS_SORTED = [...REPOS].sort((a, b) => b[0].length - a[0].length);

const kebab = (s: string) => s.replace(/_/g, '-').replace(/-+/g, '-').toLowerCase();

function findPhysical(dropboxPath: string): string | null {
  const rel = dropboxPath.replace(/^\//, '');
  for (const root of Object.values(SHARD_ROOTS)) {
    const p = join(root, rel);
    if (existsSync(p)) return p;
  }
  return null;
}

// ---- deterministic old -> new mapping (pure; also used for the manifest) ----
function mapPath(p: string): string | null {
  for (const [old, name] of REPOS_SORTED) {
    if (p === old) return `organized/repos/${name}`;
    if (p.startsWith(old + '/')) return `organized/repos/${name}` + p.slice(old.length);
  }
  const SMO = '/Sovereign_Master_Orchestrator';
  if (p === SMO) return 'organized/misc/sovereign-master-orchestrator';
  if (p.startsWith(SMO + '/')) return 'organized/misc/sovereign-master-orchestrator' + p.slice(SMO.length);
  if (p === '/Sovereign') return 'organized/misc/sovereign-m3u';
  if (p.startsWith('/Sovereign/')) return 'organized/misc/sovereign-m3u' + p.slice('/Sovereign'.length);
  if (p === '/Sovereign_Artifacts_Bundle') return 'organized/bundles/sovereign-artifacts-bundle';
  if (p.startsWith('/Sovereign_Artifacts_Bundle/')) return 'organized/bundles/sovereign-artifacts-bundle' + p.slice('/Sovereign_Artifacts_Bundle'.length);
  if (p === '/Sovereign_Live_Execution_Bundle_2026') return 'organized/bundles/live-execution-bundle-2026';
  if (p === '/Functional Programming in Scala.pdf') return 'organized/docs/functional-programming-in-scala.pdf';
  const CB = '/Sovereign_Chats_Backup';
  if (p === CB) return 'organized/docs/chat-backups';
  if (p.startsWith(CB + '/')) {
    const rest = p.slice(CB.length + 1);
    const segs = rest.split('/');
    // kebab-case the top-level chat dir/file names; keep deeper data filenames as-is
    const head = kebab(segs[0].replace(/\.[^.]+$/, '')) + (/\.md$/i.test(segs[0]) ? segs[0].slice(segs[0].lastIndexOf('.')).toLowerCase() : '');
    return 'organized/docs/chat-backups/' + [head, ...segs.slice(1)].join('/');
  }
  if (p === '/sovereign_toxic_root_maximal.py') return 'organized/misc/sovereign-toxic-root-maximal.py';
  if (p === '/sovereign-master-fix.sh') return 'organized/misc/sovereign-master-fix.sh';
  if (p === '/Apps/Tampermonkey/.version') return 'organized/misc/tampermonkey-app-version.txt';
  if (p === '/Apps') return 'organized/misc/apps';
  if (p === '/Apps/Tampermonkey') return 'organized/misc/apps/tampermonkey';
  // Ghost from the Dropbox listing: 8-byte marker, never landed in the physical shards
  if (p === '/.version') return 'organized/misc/dropbox-version-marker.txt';
  return null;
}

const cpy = (src: string, dst: string) => {
  mkdirSync(dst === ORG ? ORG : require('path').dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: false });
};

function main() {
  const inv = JSON.parse(require('fs').readFileSync(join(MANIFESTS, 'dropbox-inventory.json'), 'utf8'));
  const entries: Array<{ path: string; type: string }> = inv.entries;

  console.log(`inventory entries: ${entries.length}`);
  const unmapped: string[] = [];
  for (const e of entries) if (!mapPath(e.path)) unmapped.push(e.path);
  if (unmapped.length) { console.error('UNMAPPED:', unmapped); process.exit(1); }
  console.log('all 895 entries map to organized/ — OK');

  if (existsSync(ORG)) { console.error(`REFUSING: ${ORG} already exists`); process.exit(1); }
  for (const d of ['repos', 'docs', 'misc', 'bundles']) mkdirSync(join(ORG, d), { recursive: true });

  // 1. repo candidates
  const missing: string[] = [];
  for (const [old, name] of REPOS) {
    const src = findPhysical(old);
    if (!src) { missing.push(old); continue; }
    const dst = join(ORG, 'repos', name);
    cpSync(src, dst, { recursive: true, dereference: false });
    console.log(`repo ${name} <- ${old}`);
  }
  if (missing.length) { console.error('MISSING SOURCES:', missing); process.exit(1); }

  // 2. SMO leftovers: full tree, minus the 5 carved-out candidates
  const smoSrc = findPhysical('/Sovereign_Master_Orchestrator')!;
  const smoDst = join(ORG, 'misc', 'sovereign-master-orchestrator');
  cpSync(smoSrc, smoDst, { recursive: true, dereference: false });
  for (const [old] of REPOS) {
    if (old.startsWith('/Sovereign_Master_Orchestrator/')) {
      const sub = old.slice('/Sovereign_Master_Orchestrator/'.length);
      const target = join(smoDst, sub);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    }
  }
  console.log('misc/sovereign-master-orchestrator (leftovers) OK');

  // 3. Sovereign (m3u toolkit) -> misc
  cpSync(findPhysical('/Sovereign')!, join(ORG, 'misc', 'sovereign-m3u'), { recursive: true, dereference: false });

  // 4. bundles
  cpSync(findPhysical('/Sovereign_Artifacts_Bundle')!, join(ORG, 'bundles', 'sovereign-artifacts-bundle'), { recursive: true, dereference: false });
  mkdirSync(join(ORG, 'bundles', 'live-execution-bundle-2026'), { recursive: true }); // ghost: empty in Dropbox

  // 5. docs
  cpSync(findPhysical('/Functional Programming in Scala.pdf')!, join(ORG, 'docs', 'functional-programming-in-scala.pdf'));
  const cbSrc = findPhysical('/Sovereign_Chats_Backup')!;
  const cbDst = join(ORG, 'docs', 'chat-backups');
  mkdirSync(cbDst, { recursive: true });
  for (const name of readdirSync(cbSrc)) {
    const src = join(cbSrc, name);
    const isDir = statSync(src).isDirectory();
    const stem = name.replace(/\.[^.]+$/, '');
    const ext = /\.md$/i.test(name) ? name.slice(name.lastIndexOf('.')).toLowerCase() : '';
    const dstName = kebab(stem) + ext;
    cpSync(src, join(cbDst, dstName), { recursive: true, dereference: false });
    void isDir;
  }

  // 6. misc singles
  cpSync(findPhysical('/sovereign_toxic_root_maximal.py')!, join(ORG, 'misc', 'sovereign-toxic-root-maximal.py'));
  cpSync(findPhysical('/sovereign-master-fix.sh')!, join(ORG, 'misc', 'sovereign-master-fix.sh'));
  // Tampermonkey mount marker: content is a bare version string; give it a readable name
  const tmSrc = findPhysical('/Apps/Tampermonkey/.version')!;
  const tmBody = require('fs').readFileSync(tmSrc, 'utf8').trim();
  writeFileSync(join(ORG, 'misc', 'tampermonkey-app-version.txt'), `Tampermonkey app version marker (from Dropbox /Apps/Tampermonkey/.version)\nversion=${tmBody}\n`);
  mkdirSync(join(ORG, 'misc', 'apps', 'tampermonkey'), { recursive: true });
  // Ghost entry: '/.version' exists in the Dropbox inventory (8 bytes, 2023-11-02Z)
  // but never landed in the physical shards. Record the provenance, don't invent content.
  const ghost = entries.find(e => e.path === '/.version');
  writeFileSync(join(ORG, 'misc', 'dropbox-version-marker.txt'),
    `Provenance note (SPARKFALL phase 3)\n` +
    `Dropbox inventory entry: ${JSON.stringify(ghost)}\n` +
    `This file was NOT present in the physical shard extraction; no bytes were recoverable.\n`);

  // ---- verify: every copied file's target exists via mapPath ----
  let fileCount = 0, missing2 = 0;
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p); else fileCount++;
    }
  };
  walk(ORG);
  for (const e of entries) {
    if (e.type !== 'file') continue;
    const tgt = join(MIRROR, mapPath(e.path)!);
    if (!existsSync(tgt)) { console.error('TARGET MISSING:', e.path, '->', tgt); missing2++; }
  }
  console.log(`organized files: ${fileCount}; manifest targets verified missing=${missing2}`);
  if (missing2) process.exit(1);

  // ---- old-to-new-manifest.json (complete: every inventory entry) ----
  const mappings: Record<string, string> = {};
  for (const e of entries) mappings[e.path] = mapPath(e.path)!;
  writeFileSync(join(MANIFESTS, 'old-to-new-manifest.json'), JSON.stringify({
    generated_at: new Date().toISOString(),
    phase: 'sparkfall-3-organize',
    worker: 'rune',
    source_inventory: 'dropbox-inventory.json',
    entry_count: entries.length,
    mappings,
  }, null, 1) + '\n');

  // ---- repo-registry.json ----
  const registry = REPOS.map(([old, name]) => ({
    old_path: old,
    new_name: name,
    organized_path: `organized/repos/${name}`,
    github_repo: '',
    visibility: '',
    status: 'organized',
  }));
  writeFileSync(join(MANIFESTS, 'repo-registry.json'), JSON.stringify(registry, null, 1) + '\n');

  console.log('wrote old-to-new-manifest.json + repo-registry.json');
}

main();
