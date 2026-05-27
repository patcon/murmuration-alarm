import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const LEADER_RADIUS = 44
const FOLLOWER_RADIUS = 30
const PANEL_HEIGHT = 270
const DOUBLE_TAP_MS = 300

interface PhysicsConfig {
  stiffness: number
  damping: number
  mass: number
}

interface Config extends PhysicsConfig {
  leaderTrail: number    // ms, 0–2000
  followerTrail: number  // ms, 0–2000
  showLeader: boolean
  showFollower: boolean
}

const DEFAULT_CONFIG: Config = {
  stiffness: 0.12,
  damping: 0.75,
  mass: 1,
  leaderTrail: 0,
  followerTrail: 0,
  showLeader: true,
  showFollower: true,
}

type TrailPoint = { x: number; y: number; t: number }
type RecordedPoint = { x: number; y: number; t: number }
type Recording = { points: RecordedPoint[]; duration: number; returnDuration: number; config: PhysicsConfig }

function trimTrail(buf: TrailPoint[], maxAge: number, now: number) {
  const cutoff = now - maxAge
  let i = 0
  while (i < buf.length && buf[i].t < cutoff) i++
  if (i > 0) buf.splice(0, i)
}

function renderTrail(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  buf: TrailPoint[],
  radius: number,
  color: string,
  strokeWidth: number,
  maxAge: number,
  now: number,
) {
  if (maxAge === 0 || buf.length === 0) {
    group.selectAll('circle').remove()
    return
  }
  group.selectAll<SVGCircleElement, TrailPoint>('circle')
    .data(buf, d => String(d.t))
    .join('circle')
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('r', radius)
    .attr('fill', 'none')
    .attr('stroke', color)
    .attr('stroke-width', strokeWidth)
    .attr('opacity', d => Math.max(0, (1 - (now - d.t) / maxAge) * 0.5))
}

function interpolateRecording(points: RecordedPoint[], t: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { x: points[0].x, y: points[0].y }
  let lo = 0, hi = points.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (points[mid].t <= t) lo = mid; else hi = mid
  }
  const a = points[lo], b = points[hi]
  if (b.t === a.t) return { x: b.x, y: b.y }
  const frac = (t - a.t) / (b.t - a.t)
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac }
}

function computeReturnDuration(points: RecordedPoint[]): number {
  let pathLength = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    pathLength += Math.sqrt(dx * dx + dy * dy)
  }
  const recordingDuration = points[points.length - 1].t
  if (pathLength === 0 || recordingDuration === 0) return 400
  const avgSpeed = pathLength / recordingDuration
  const first = points[0], last = points[points.length - 1]
  const returnDist = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2)
  return Math.min(Math.max(returnDist / avgSpeed, 150), 1200)
}

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null)
  const leaderRef = useRef<SVGCircleElement | null>(null)
  const followerRef = useRef<SVGCircleElement | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const configRef = useRef(config)
  configRef.current = config

  const physics = useRef({ x: -999, y: -999, vx: 0, vy: 0 })
  const leader = useRef({ x: -999, y: -999, visible: false })
  const rafRef = useRef<number>(0)

  // Trail buffers
  const leaderTrailRef = useRef<TrailPoint[]>([])
  const followerTrailRef = useRef<TrailPoint[]>([])
  const ghostLeaderTrailRef = useRef<TrailPoint[]>([])
  const ghostFollowerTrailRef = useRef<TrailPoint[]>([])

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [startMarker, setStartMarker] = useState<{ x: number; y: number } | null>(null)
  const lastTapTime = useRef(0)
  const recordingRef = useRef<{ active: boolean; startTime: number; points: RecordedPoint[]; config: PhysicsConfig }>({
    active: false, startTime: 0, points: [], config: DEFAULT_CONFIG,
  })
  const loopRef = useRef<Recording | null>(null)
  const loopStartTime = useRef(0)
  const ghostPhysics = useRef({ x: -999, y: -999, vx: 0, vy: 0 })

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    const leaderDot = svg.select<SVGCircleElement>('.leader')
    const followerDot = svg.select<SVGCircleElement>('.follower')
    const ghostLeaderDot = svg.select<SVGCircleElement>('.ghost-leader')
    const ghostFollowerDot = svg.select<SVGCircleElement>('.ghost-follower')
    const leaderTrailGroup = svg.select<SVGGElement>('.leader-trail')
    const followerTrailGroup = svg.select<SVGGElement>('.follower-trail')
    const ghostLeaderTrailGroup = svg.select<SVGGElement>('.ghost-leader-trail')
    const ghostFollowerTrailGroup = svg.select<SVGGElement>('.ghost-follower-trail')

    let initialized = false

    function show(x: number, y: number) {
      leader.current.x = x
      leader.current.y = y
      leader.current.visible = true
      if (!initialized) {
        physics.current.x = x
        physics.current.y = y
        initialized = true
      }
      leaderDot.attr('cx', x).attr('cy', y)
    }

    function hide() {
      leader.current.visible = false
      leaderTrailRef.current.length = 0
      followerTrailRef.current.length = 0
      initialized = false
    }

    function onMouseMove(event: MouseEvent) { show(event.clientX, event.clientY) }
    function onMouseLeave() { hide() }

    function onTouchStart(event: TouchEvent) {
      const now = Date.now()
      if (now - lastTapTime.current < DOUBLE_TAP_MS) {
        lastTapTime.current = 0
        const touch = event.touches[0]
        const { stiffness, damping, mass } = configRef.current
        recordingRef.current = { active: true, startTime: now, points: [], config: { stiffness, damping, mass } }
        loopRef.current = null
        ghostPhysics.current = { x: -999, y: -999, vx: 0, vy: 0 }
        ghostLeaderTrailRef.current.length = 0
        ghostFollowerTrailRef.current.length = 0
        ghostLeaderDot.attr('opacity', 0)
        ghostFollowerDot.attr('opacity', 0)
        setIsRecording(true)
        setStartMarker({ x: touch.clientX, y: touch.clientY })
      } else {
        lastTapTime.current = now
      }
    }

    function onTouchMove(event: TouchEvent) {
      event.preventDefault()
      const touch = event.touches[0]
      const x = touch.clientX, y = touch.clientY
      show(x, y)
      if (recordingRef.current.active) {
        const t = Date.now() - recordingRef.current.startTime
        recordingRef.current.points.push({ x, y, t })
      }
    }

    function onTouchEnd() {
      if (recordingRef.current.active) {
        const { points, config: snapConfig } = recordingRef.current
        if (points.length >= 2) {
          const offset = points[0].t
          for (const p of points) p.t -= offset
          const duration = points[points.length - 1].t
          const returnDuration = computeReturnDuration(points)
          const firstPoint = points[0]
          loopRef.current = { points, duration, returnDuration, config: snapConfig }
          loopStartTime.current = Date.now()
          ghostPhysics.current = { x: firstPoint.x, y: firstPoint.y, vx: 0, vy: 0 }
        }
        recordingRef.current.active = false
        setIsRecording(false)
        setStartMarker(null)
      }
      hide()
    }

    const el = svgRef.current!
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    function tick() {
      const now = Date.now()
      const { showLeader, showFollower, leaderTrail, followerTrail, stiffness, damping, mass } = configRef.current

      // Live circles: opacity driven by visibility + show flags
      const liveVisible = leader.current.visible
      leaderDot.attr('opacity', liveVisible && showLeader ? 1 : 0)
      followerDot.attr('opacity', liveVisible && showFollower ? 1 : 0)

      if (liveVisible) {
        const p = physics.current
        const dx = leader.current.x - p.x
        const dy = leader.current.y - p.y
        p.vx = p.vx * damping + (dx * stiffness) / mass
        p.vy = p.vy * damping + (dy * stiffness) / mass
        p.x += p.vx
        p.y += p.vy
        followerDot.attr('cx', p.x).attr('cy', p.y)

        if (showLeader && leaderTrail > 0) {
          leaderTrailRef.current.push({ x: leader.current.x, y: leader.current.y, t: now })
          trimTrail(leaderTrailRef.current, leaderTrail, now)
        } else {
          leaderTrailRef.current.length = 0
        }
        if (showFollower && followerTrail > 0) {
          followerTrailRef.current.push({ x: p.x, y: p.y, t: now })
          trimTrail(followerTrailRef.current, followerTrail, now)
        } else {
          followerTrailRef.current.length = 0
        }
      }

      renderTrail(leaderTrailGroup, leaderTrailRef.current, LEADER_RADIUS, 'dodgerblue', 3, leaderTrail, now)
      renderTrail(followerTrailGroup, followerTrailRef.current, FOLLOWER_RADIUS, 'tomato', 2, followerTrail, now)

      // Ghost loop playback
      const loop = loopRef.current
      if (loop && loop.duration > 0) {
        const elapsed = now - loopStartTime.current
        const totalDuration = loop.duration + loop.returnDuration
        const t = elapsed % totalDuration
        if (t <= loop.duration) {
          const ghostLeaderPos = interpolateRecording(loop.points, t)
          const gp = ghostPhysics.current
          const dx = ghostLeaderPos.x - gp.x
          const dy = ghostLeaderPos.y - gp.y
          gp.vx = gp.vx * loop.config.damping + (dx * loop.config.stiffness) / loop.config.mass
          gp.vy = gp.vy * loop.config.damping + (dy * loop.config.stiffness) / loop.config.mass
          gp.x += gp.vx
          gp.y += gp.vy

          ghostLeaderDot.attr('cx', ghostLeaderPos.x).attr('cy', ghostLeaderPos.y).attr('opacity', showLeader ? 0.4 : 0)
          ghostFollowerDot.attr('cx', gp.x).attr('cy', gp.y).attr('opacity', showFollower ? 0.4 : 0)

          if (showLeader && leaderTrail > 0) {
            ghostLeaderTrailRef.current.push({ x: ghostLeaderPos.x, y: ghostLeaderPos.y, t: now })
            trimTrail(ghostLeaderTrailRef.current, leaderTrail, now)
          } else {
            ghostLeaderTrailRef.current.length = 0
          }
          if (showFollower && followerTrail > 0) {
            ghostFollowerTrailRef.current.push({ x: gp.x, y: gp.y, t: now })
            trimTrail(ghostFollowerTrailRef.current, followerTrail, now)
          } else {
            ghostFollowerTrailRef.current.length = 0
          }
        } else {
          ghostLeaderDot.attr('opacity', 0)
          ghostFollowerDot.attr('opacity', 0)
          ghostLeaderTrailRef.current.length = 0
          ghostFollowerTrailRef.current.length = 0
          const first = loop.points[0]
          ghostPhysics.current = { x: first.x, y: first.y, vx: 0, vy: 0 }
        }
      }

      renderTrail(ghostLeaderTrailGroup, ghostLeaderTrailRef.current, LEADER_RADIUS, 'dodgerblue', 3, leaderTrail, now)
      renderTrail(ghostFollowerTrailGroup, ghostFollowerTrailRef.current, FOLLOWER_RADIUS, 'tomato', 2, followerTrail, now)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      cancelAnimationFrame(rafRef.current!)
    }
  }, [])

  function setParam<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig(c => ({ ...c, [key]: value }))
  }

  return (
    <>
      <svg
        ref={svgRef}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
      >
        <g className="ghost-leader-trail" />
        <g className="ghost-follower-trail" />
        <g className="leader-trail" />
        <g className="follower-trail" />
        <circle className="ghost-leader" r={LEADER_RADIUS} fill="none" stroke="dodgerblue" strokeWidth={3} opacity={0} />
        <circle className="ghost-follower" r={FOLLOWER_RADIUS} fill="none" stroke="tomato" strokeWidth={2} opacity={0} />
        <circle ref={leaderRef} className="leader" r={LEADER_RADIUS} fill="none" stroke="dodgerblue" strokeWidth={3} opacity={0} />
        <circle ref={followerRef} className="follower" r={FOLLOWER_RADIUS} fill="none" stroke="tomato" strokeWidth={2} opacity={0} />
      </svg>

      {isRecording && (
        <div style={{
          position: 'fixed', top: 16, right: 16,
          width: 12, height: 12, borderRadius: '50%',
          background: 'tomato', zIndex: 50,
          animation: 'pulse-record 1s ease-in-out infinite',
        }} />
      )}

      {startMarker && (
        <div style={{
          position: 'fixed',
          left: startMarker.x - 8, top: startMarker.y - 8,
          width: 16, height: 16, borderRadius: '50%',
          background: 'limegreen', zIndex: 50, pointerEvents: 'none',
          animation: 'pulse-record 0.8s ease-in-out infinite',
        }} />
      )}

      <button
        onClick={() => setDebugOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: debugOpen ? PANEL_HEIGHT + 8 : 8,
          right: 12, zIndex: 10,
          background: 'rgba(0,0,0,0.6)', color: '#fff',
          border: '1px solid #555', borderRadius: 6,
          padding: '4px 10px', cursor: 'pointer', fontSize: 12,
          transition: 'bottom 0.2s',
        }}
      >
        {debugOpen ? 'Close debug' : 'Debug'}
      </button>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: PANEL_HEIGHT, overflowY: 'auto',
        boxSizing: 'border-box',
        background: 'rgba(10,10,10,0.88)', color: '#eee',
        zIndex: 9, fontFamily: 'monospace', fontSize: 13,
        backdropFilter: 'blur(4px)', borderTop: '1px solid #333',
        padding: '12px 20px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
        transform: debugOpen ? 'translateY(0)' : `translateY(${PANEL_HEIGHT}px)`,
        transition: 'transform 0.2s',
      }}>
        <SliderRow label="Stiffness" value={config.stiffness} min={0.01} max={0.5} step={0.01} onChange={v => setParam('stiffness', v)} />
        <SliderRow label="Damping" value={config.damping} min={0.1} max={0.99} step={0.01} onChange={v => setParam('damping', v)} />
        <SliderRow label="Mass" value={config.mass} min={0.1} max={5} step={0.1} onChange={v => setParam('mass', v)} />
        <SliderRow label="Leader trail" value={config.leaderTrail} min={0} max={2000} step={50} displayValue={`${config.leaderTrail}ms`} onChange={v => setParam('leaderTrail', v)} />
        <SliderRow label="Follower trail" value={config.followerTrail} min={0} max={2000} step={50} displayValue={`${config.followerTrail}ms`} onChange={v => setParam('followerTrail', v)} />
        <CheckboxRow label="Show leader" checked={config.showLeader} onChange={v => setParam('showLeader', v)} />
        <CheckboxRow label="Show follower" checked={config.showFollower} onChange={v => setParam('showFollower', v)} />
      </div>
    </>
  )
}

function SliderRow({ label, value, min, max, step, onChange, displayValue }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  displayValue?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#7df' }}>{displayValue ?? value.toFixed(2)}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'dodgerblue' }}
      />
    </label>
  )
}

function CheckboxRow({ label, checked, onChange }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input
        type="checkbox" checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'dodgerblue', width: 14, height: 14 }}
      />
      <span>{label}</span>
    </label>
  )
}
