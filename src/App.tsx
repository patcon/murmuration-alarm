import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const LEADER_RADIUS = 44
const FOLLOWER_RADIUS = 30
const PANEL_HEIGHT = 185
const DOUBLE_TAP_MS = 300

interface PhysicsConfig {
  stiffness: number
  damping: number
  mass: number
}

const DEFAULT_CONFIG: PhysicsConfig = {
  stiffness: 0.12,
  damping: 0.75,
  mass: 1,
}

type RecordedPoint = { x: number; y: number; t: number }
type Recording = { points: RecordedPoint[]; duration: number; config: PhysicsConfig }

function interpolateRecording(points: RecordedPoint[], t: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return { x: points[0].x, y: points[0].y }
  // Binary search for the segment containing t
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

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null)
  const leaderRef = useRef<SVGCircleElement | null>(null)
  const followerRef = useRef<SVGCircleElement | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [config, setConfig] = useState<PhysicsConfig>(DEFAULT_CONFIG)
  const configRef = useRef(config)
  configRef.current = config

  // Live physics state
  const physics = useRef({ x: -999, y: -999, vx: 0, vy: 0 })
  const leader = useRef({ x: -999, y: -999, visible: false })
  const rafRef = useRef<number>(0)

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const isRecordingRef = useRef(false)
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
      leaderDot.attr('cx', x).attr('cy', y).attr('opacity', 1)
      followerDot.attr('opacity', 1)
    }

    function hide() {
      leader.current.visible = false
      leaderDot.attr('opacity', 0)
      followerDot.attr('opacity', 0)
      initialized = false
    }

    function onMouseMove(event: MouseEvent) {
      show(event.clientX, event.clientY)
    }
    function onMouseLeave() { hide() }

    function onTouchStart(event: TouchEvent) {
      const now = Date.now()
      if (now - lastTapTime.current < DOUBLE_TAP_MS) {
        // Double-tap: start recording
        lastTapTime.current = 0
        const snapshotConfig = { ...configRef.current }
        recordingRef.current = { active: true, startTime: now, points: [], config: snapshotConfig }
        loopRef.current = null
        ghostPhysics.current = { x: -999, y: -999, vx: 0, vy: 0 }
        ghostLeaderDot.attr('opacity', 0)
        ghostFollowerDot.attr('opacity', 0)
        isRecordingRef.current = true
        setIsRecording(true)
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
          const duration = points[points.length - 1].t
          const firstPoint = points[0]
          loopRef.current = { points, duration, config: snapConfig }
          loopStartTime.current = Date.now()
          ghostPhysics.current = { x: firstPoint.x, y: firstPoint.y, vx: 0, vy: 0 }
        }
        recordingRef.current.active = false
        isRecordingRef.current = false
        setIsRecording(false)
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
      // Live follower physics
      if (leader.current.visible) {
        const { stiffness, damping, mass } = configRef.current
        const p = physics.current
        const dx = leader.current.x - p.x
        const dy = leader.current.y - p.y
        p.vx = p.vx * damping + (dx * stiffness) / mass
        p.vy = p.vy * damping + (dy * stiffness) / mass
        p.x += p.vx
        p.y += p.vy
        followerDot.attr('cx', p.x).attr('cy', p.y)
      }

      // Ghost loop playback
      const loop = loopRef.current
      if (loop && loop.duration > 0) {
        const elapsed = Date.now() - loopStartTime.current
        const t = elapsed % loop.duration
        const ghostLeaderPos = interpolateRecording(loop.points, t)
        const { stiffness, damping, mass } = loop.config
        const gp = ghostPhysics.current
        const dx = ghostLeaderPos.x - gp.x
        const dy = ghostLeaderPos.y - gp.y
        gp.vx = gp.vx * damping + (dx * stiffness) / mass
        gp.vy = gp.vy * damping + (dy * stiffness) / mass
        gp.x += gp.vx
        gp.y += gp.vy
        ghostLeaderDot
          .attr('cx', ghostLeaderPos.x).attr('cy', ghostLeaderPos.y).attr('opacity', 0.4)
        ghostFollowerDot
          .attr('cx', gp.x).attr('cy', gp.y).attr('opacity', 0.4)
      }

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

  function setParam<K extends keyof PhysicsConfig>(key: K, value: number) {
    setConfig(c => ({ ...c, [key]: value }))
  }

  return (
    <>
      <svg
        ref={svgRef}
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
      >
        <circle className="ghost-leader" r={LEADER_RADIUS} fill="none" stroke="dodgerblue" strokeWidth={3} opacity={0} />
        <circle className="ghost-follower" r={FOLLOWER_RADIUS} fill="none" stroke="tomato" strokeWidth={2} opacity={0} />
        <circle ref={leaderRef} className="leader" r={LEADER_RADIUS} fill="none" stroke="dodgerblue" strokeWidth={3} opacity={0} />
        <circle ref={followerRef} className="follower" r={FOLLOWER_RADIUS} fill="none" stroke="tomato" strokeWidth={2} opacity={0} />
      </svg>

      {/* Recording indicator */}
      {isRecording && (
        <div style={{
          position: 'fixed',
          top: 16,
          right: 16,
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: 'tomato',
          zIndex: 50,
          animation: 'pulse-record 1s ease-in-out infinite',
        }} />
      )}

      {/* Debug toggle — floats above panel */}
      <button
        onClick={() => setDebugOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: debugOpen ? PANEL_HEIGHT + 8 : 8,
          right: 12,
          zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: '1px solid #555',
          borderRadius: 6,
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: 12,
          transition: 'bottom 0.2s',
        }}
      >
        {debugOpen ? 'Close debug' : 'Debug'}
      </button>

      {/* Debug panel */}
      {debugOpen && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: PANEL_HEIGHT,
          boxSizing: 'border-box',
          background: 'rgba(10,10,10,0.88)',
          color: '#eee',
          zIndex: 9,
          fontFamily: 'monospace',
          fontSize: 13,
          backdropFilter: 'blur(4px)',
          borderTop: '1px solid #333',
          padding: '12px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <SliderRow label="Stiffness" value={config.stiffness} min={0.01} max={0.5} step={0.01} onChange={v => setParam('stiffness', v)} />
          <SliderRow label="Damping" value={config.damping} min={0.1} max={0.99} step={0.01} onChange={v => setParam('damping', v)} />
          <SliderRow label="Mass" value={config.mass} min={0.1} max={5} step={0.1} onChange={v => setParam('mass', v)} />
        </div>
      )}
    </>
  )
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#7df' }}>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'dodgerblue' }}
      />
    </label>
  )
}
