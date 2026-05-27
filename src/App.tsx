import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

const LEADER_RADIUS = 44
const FOLLOWER_RADIUS = 30

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

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null)
  const leaderRef = useRef<SVGCircleElement | null>(null)
  const followerRef = useRef<SVGCircleElement | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [config, setConfig] = useState<PhysicsConfig>(DEFAULT_CONFIG)
  const configRef = useRef(config)
  configRef.current = config

  // Physics state (mutable, not React state)
  const physics = useRef({ x: -999, y: -999, vx: 0, vy: 0 })
  const leader = useRef({ x: -999, y: -999, visible: false })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    const leaderDot = svg.select<SVGCircleElement>('.leader')
    const followerDot = svg.select<SVGCircleElement>('.follower')

    // Sync follower start position on first show
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
    function onTouchMove(event: TouchEvent) {
      event.preventDefault()
      const touch = event.touches[0]
      show(touch.clientX, touch.clientY)
    }
    function onTouchEnd() { hide() }

    const el = svgRef.current!
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    // Animation loop
    function tick() {
      if (leader.current.visible) {
        const { stiffness, damping, mass } = configRef.current
        const p = physics.current
        const dx = leader.current.x - p.x
        const dy = leader.current.y - p.y
        const ax = (dx * stiffness) / mass
        const ay = (dy * stiffness) / mass
        p.vx = p.vx * damping + ax
        p.vy = p.vy * damping + ay
        p.x += p.vx
        p.y += p.vy
        followerDot.attr('cx', p.x).attr('cy', p.y)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
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
        <circle ref={leaderRef} className="leader" r={LEADER_RADIUS} fill="none" stroke="dodgerblue" strokeWidth={3} opacity={0} />
        <circle ref={followerRef} className="follower" r={FOLLOWER_RADIUS} fill="none" stroke="tomato" strokeWidth={2} opacity={0} />
      </svg>

      {/* Debug panel toggle */}
      <button
        onClick={() => setDebugOpen(o => !o)}
        style={{
          position: 'fixed',
          bottom: debugOpen ? 140 : 8,
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
          height: 140,
          background: 'rgba(10,10,10,0.88)',
          color: '#eee',
          padding: '12px 20px',
          zIndex: 9,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '10px 24px',
          alignContent: 'start',
          fontFamily: 'monospace',
          fontSize: 13,
          backdropFilter: 'blur(4px)',
          borderTop: '1px solid #333',
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
