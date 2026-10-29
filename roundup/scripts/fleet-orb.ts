import * as THREE from 'three';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const daemons = readFileSync('daemons.txt','utf8').trim().split('\n').map(l => {
  const [name, ...rest] = l.split(' '); return { name, status: rest.join(' ') || 'unknown' };
});

// deterministic hash -> sphere point (glyph-as-coordinate, fleet-as-glyph-set)
function hash3(s: string): [number,number,number] {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const u = (h>>>0) / 4294967295;
  h = Math.imul(h ^ 0x9e3779b9, 1274126177); const v = (h>>>0) / 4294967295;
  h = Math.imul(h ^ 0x85ebca6b, 2654435761); const w = (h>>>0) / 4294967295;
  return [u, v, w];
}
function toSphere([u,v,w]: [number,number,number]) {
  const theta = 2*Math.PI*u, phi = Math.acos(2*v-1);
  return new THREE.Vector3(Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
}
const STATUS_R: Record<string,number> = { running: 1.0, errored: 0.3, stopped: 0.55, available: 0.8 };

// ghost mass: count /home/toxic/estate literals per pen product — pulls points inward
function ghostMass(name: string): number {
  const [pen, ...prod] = name.split('/');
  if (!prod.length) return 0;
  const dir = `/home/toxic/pens/${pen}/products/${prod[0]}`;
  try {
    const out = execSync(`timeout 15 grep -rl '/home/toxic/estate' ${dir}/src ${dir}/bin ${dir}/config 2>/dev/null | wc -l`, {encoding:'utf8'});
    return Math.min(parseInt(out.trim())/10, 0.6);
  } catch { return 0; }
}

type P = { name: string; status: string; pos: THREE.Vector3; ghost: number };
const points: P[] = daemons.map(d => {
  const base = toSphere(hash3(d.name));
  const r = STATUS_R[d.status] ?? 0.7;
  const g = ghostMass(d.name);
  return { name: d.name, status: d.status, ghost: g, pos: base.multiplyScalar(r * (1 - g)) };
});

// spatial wound detection: errored daemons nearest-neighbors
function nnDist(p: P): number {
  let m = Infinity;
  for (const q of points) if (q !== p) m = Math.min(m, p.pos.distanceTo(q.pos));
  return m;
}
const wounds = points.filter(p => p.status === 'errored').map(p => ({ name: p.name, nn: nnDist(p), ghost: p.ghost }));
wounds.sort((a,b) => a.nn - b.nn);
const centroid = points.reduce((a,p)=>a.add(p.pos.clone().multiplyScalar(1/points.length)), new THREE.Vector3());
const inner = points.filter(p => p.pos.length() < 0.5).map(p=>p.name);
const haunted = points.filter(p => p.ghost > 0);

console.log(`FLEET ORB: ${points.length} daemons embedded. Centroid drift: ${centroid.length().toFixed(4)} (0 = perfectly balanced fleet)`);
console.log(`\nWOUNDS (errored, nearest-neighbor distance — small nn = spatially entangled failure):`);
wounds.slice(0,8).forEach(w => console.log(`  ${w.name.padEnd(28)} nn=${w.nn.toFixed(3)} ghostMass=${w.ghost.toFixed(2)}`));
console.log(`\nCOLLAPSED CORE (r<0.5 — daemons below the health horizon): ${inner.length}`);
inner.slice(0,10).forEach(n => console.log(`  • ${n}`));
console.log(`\nHAUNTED (pulled inward by /home/toxic/estate ghost mass): ${haunted.length}`);
haunted.forEach(h => console.log(`  ☢ ${h.name} ghost=${h.ghost.toFixed(2)} r=${h.pos.length().toFixed(3)}`));

// interactive orb
const html = `<!doctype html><html><head><meta charset=utf-8><title>Fleet Orb</title><style>body{margin:0;background:#050508;color:#8f8;font-family:monospace}#hud{position:fixed;top:8px;left:8px;font-size:11px}</style></head><body><div id=hud>fleet orb — drag to rotate, scroll to zoom</div><script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js"}}</script><script type="module">
import * as THREE from 'three';
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, .1, 100); camera.position.z = 4;
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const DATA = ${JSON.stringify(points.map(p => ({name:p.name, status:p.status, x:p.pos.x, y:p.pos.y, z:p.pos.z, ghost:p.ghost})))};
const C = { running:0x00ff88, errored:0xff2244, stopped:0x555577, available:0x88aaff, unknown:0x888888 };
const geo = new THREE.SphereGeometry(0.02, 12, 12);
for (const d of DATA) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({color: C[d.status] ?? C.unknown, transparent:true, opacity: d.ghost>0?0.4:0.95}));
  m.position.set(d.x,d.y,d.z); scene.add(m);
  if (d.ghost>0) { const t=document.createElement('div'); t.textContent=d.name; t.style.cssText='position:fixed;color:#f66;font-size:9px;pointer-events:none'; document.body.appendChild(t); t.dataset.world=JSON.stringify([d.x,d.y,d.z]); }
}
const wire = new THREE.Mesh(new THREE.SphereGeometry(1,32,32), new THREE.MeshBasicMaterial({color:0x113322, wireframe:true, transparent:true, opacity:0.15})); scene.add(wire);
let drag=false, px=0, py=0, rotY=0, rotX=0;
onmousedown=e=>{drag=true;px=e.clientX;py=e.clientY}; onmouseup=()=>drag=false;
onmousemove=e=>{if(!drag)return; rotY+=(e.clientX-px)*.01; rotX+=(e.clientY-py)*.01; px=e.clientX; py=e.clientY;};
onwheel=e=>{camera.position.z=Math.max(1.2,Math.min(20,camera.position.z+e.deltaY*.002))};
const labels=[...document.querySelectorAll('div[data-world]')];
function tick(){ requestAnimationFrame(tick);
  scene.rotation.y=rotY; scene.rotation.x=rotX;
  for(const t of labels){ const [x,y,z]=JSON.parse(t.dataset.world); const v=new THREE.Vector3(x,y,z).applyEuler(scene.rotation).project(camera); t.style.left=(v.x*.5+.5)*innerWidth+'px'; t.style.top=(-v.y*.5+.5)*innerHeight+'px'; }
  renderer.render(scene,camera); } tick();
</script></body></html>`;
writeFileSync('fleet-orb.html', html);
console.log(`\nOrb written: /tmp/kappa/fleet-orb/fleet-orb.html (${points.length} points)`);
