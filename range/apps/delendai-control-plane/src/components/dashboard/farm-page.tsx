import { useEffect, useState } from 'react'

// Farm page — the AI Harvest Moon living map.
// Villagers = rigs, buildings = daemons, speech bubbles = squawk chatter,
// day/night = real clock. Data: pitchfork status + squawk recent via the
// control-plane's proxy endpoints; both degrade to last-known/empty offline.

interface DaemonState {
  name: string
  status: string
}

const BUILDINGS = [
  { name: 'rhodochrosite', label: 'Gem House', x: 12, y: 20 },
  { name: 'bornite', label: 'Barn', x: 30, y: 14 },
  { name: 'keypool', label: 'Key Shed', x: 48, y: 18 },
  { name: 'estate-chat', label: 'Campfire', x: 66, y: 16 },
  { name: 'rig', label: 'Village Hall', x: 82, y: 22 },
  { name: 'forge', label: 'Smithy', x: 88, y: 50 },
  { name: 'village-irc', label: 'Watchtower', x: 8, y: 52 },
]

const VILLAGERS = [
  { name: 'tau', x: 50, y: 55 },
  { name: 'kappa', x: 62, y: 50 },
  { name: 'geode', x: 20, y: 62 },
  { name: 'hephaistos', x: 35, y: 45 },
  { name: 'skopos', x: 75, y: 62 },
  { name: 'muse', x: 15, y: 40 },
  { name: 'keryx', x: 82, y: 42 },
  { name: 'kryptos', x: 40, y: 72 },
  { name: 'kairos', x: 55, y: 76 },
  { name: 'ergane', x: 28, y: 80 },
  { name: 'hestia', x: 68, y: 82 },
  { name: 'tack', x: 45, y: 35 },
]

function isNight(h: number) {
  return h < 6 || h >= 19
}
function skyColor(h: number): string {
  if (h >= 6 && h < 8) return '#f5c98a'
  if (h >= 8 && h < 17) return '#8ecae6'
  if (h >= 17 && h < 19) return '#f4a261'
  return '#1d3557'
}

export function FarmPage() {
  const [daemons, setDaemons] = useState<DaemonState[]>([])
  const [speeches, setSpeeches] = useState<Record<string, string>>({})
  const [hour, setHour] = useState(new Date().getHours())
  const [updated, setUpdated] = useState('')

  useEffect(() => {
    let alive = true
    async function tick() {
      try {
        const [d, s] = await Promise.allSettled([
          fetch('/api/pitchfork/status', { signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
          fetch('/api/squawk/recent', { signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
        ])
        if (!alive) return
        if (d.status === 'fulfilled' && Array.isArray(d.value)) setDaemons(d.value)
        if (s.status === 'fulfilled' && Array.isArray(s.value)) {
          const map: Record<string, string> = {}
          for (const m of s.value.slice(0, 12)) {
            if (!map[m.from_agent]) map[m.from_agent] = String(m.body).slice(0, 80)
          }
          setSpeeches(map)
        }
        setHour(new Date().getHours())
        setUpdated(new Date().toLocaleTimeString())
      } catch {
        /* degrade to last-known */
      }
    }
    tick()
    const iv = setInterval(tick, 30_000)
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [])

  const lit = (name: string) =>
    daemons.find((d) => d.name === name)?.status.toLowerCase().includes('running') ?? false
  const litCount = BUILDINGS.filter((b) => lit(b.name)).length
  const night = isNight(hour)

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg-100">🏛 Estate Farm</h2>
        <span className={`text-xs ${night ? 'text-fg-400' : 'text-fg-200'}`}>
          {night ? '🌙' : '☀️'} {updated || '—'} · {litCount}/{BUILDINGS.length} buildings lit ·{' '}
          {VILLAGERS.length} villagers
        </span>
      </header>

      <div
        className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-ink-700"
        style={{
          background: `linear-gradient(to bottom, ${skyColor(hour)} 0%, ${skyColor(hour)} 38%, #7cb56b 38%, #5e9450 100%)`,
          transition: 'background 2s',
        }}
      >
        {BUILDINGS.map((b) => {
          const on = lit(b.name)
          return (
            <div
              key={b.name}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
              title={`${b.label} (${b.name}) — ${on ? 'running' : 'down'}`}
            >
              <div className="relative h-[26px] w-[34px] rounded-sm border-2 border-[#5c3d1e] bg-[#a5713f] opacity-90">
                <div
                  className="absolute left-1/2 top-[6px] h-[10px] w-[10px] -translate-x-1/2 rounded-[1px]"
                  style={{
                    background: on ? '#ffd166' : '#333',
                    boxShadow: on ? '0 0 8px 2px #ffd16688' : 'none',
                  }}
                />
                <div
                  className="absolute -top-3 -left-[3px] -right-[3px] h-0 border-x-[17px] border-b-[12px] border-x-transparent border-b-[#8b4513]"
                />
              </div>
              <span className="whitespace-nowrap text-[0.62rem] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {b.label}
              </span>
            </div>
          )
        })}

        {VILLAGERS.map((v) => {
          const speech = speeches[v.name]
          return (
            <div
              key={v.name}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-px"
              style={{ left: `${v.x}%`, top: `${v.y}%` }}
            >
              {speech && (
                <div className="absolute bottom-[130%] left-1/2 max-w-[140px] -translate-x-1/2 rounded-md bg-white px-1.5 py-0.5 text-[0.6rem] text-neutral-800 shadow-md after:absolute after:top-full after:left-1/2 after:ml-[-4px] after:border-4 after:border-transparent after:border-t-white">
                  {speech}
                </div>
              )}
              <div className="flex flex-col items-center">
                <div className="h-[10px] w-[10px] rounded-full border border-black/25 bg-[#f1c27d]" />
                <div className="h-[14px] w-[12px] rounded-t-sm border border-black/25 bg-[#457b9d]" />
              </div>
              <span className="whitespace-nowrap text-[0.62rem] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                {v.name}
              </span>
            </div>
          )
        })}
      </div>

      <footer className="text-[0.72rem] text-fg-400 opacity-70">
        30s poll cadence · day/night from wall clock · speech = latest squawk per villager
      </footer>
    </div>
  )
}
