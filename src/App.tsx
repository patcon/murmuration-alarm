import { useRef, useState } from 'react'
import { DEFAULT_CONFIG, LEADER_RADIUS, FOLLOWER_RADIUS, PANEL_HEIGHT } from './constants'
import type { Config } from './types'
import { useAnimation } from './hooks/useAnimation'
import { SliderRow } from './components/SliderRow'
import { CheckboxRow } from './components/CheckboxRow'
import { RadioRow } from './components/RadioRow'

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null)
  const leaderRef = useRef<SVGCircleElement | null>(null)
  const followerRef = useRef<SVGCircleElement | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  const [isRecording, setIsRecording] = useState(false)
  const [startMarker, setStartMarker] = useState<{ x: number; y: number } | null>(null)

  useAnimation(svgRef, config, setIsRecording, setStartMarker)

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
        <RadioRow label="Trail type" value={config.trailType} options={[{ value: 'outline', label: 'outline' }, { value: 'path', label: 'path line' }]} onChange={v => setParam('trailType', v as 'outline' | 'path')} />
        <RadioRow label="Trail fade" value={config.trailFade ? 'on' : 'off'} options={[{ value: 'on', label: 'on' }, { value: 'off', label: 'off' }]} onChange={v => setParam('trailFade', v === 'on')} />
        <CheckboxRow label="Show leader" checked={config.showLeader} onChange={v => setParam('showLeader', v)} />
        <CheckboxRow label="Show follower" checked={config.showFollower} onChange={v => setParam('showFollower', v)} />
      </div>
    </>
  )
}
