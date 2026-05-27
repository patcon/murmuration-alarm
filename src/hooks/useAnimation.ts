import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { Config, TrailPoint, RecordedPoint, Recording, MetricSample, MetricIndex } from '../types'
import { LEADER_RADIUS, FOLLOWER_RADIUS, DOUBLE_TAP_MS, DEFAULT_CONFIG, SYNC_THRESHOLD_PX } from '../constants'
import { trimTrail, renderTrail } from '../utils/trail'
import { interpolateRecording, computeReturnDuration } from '../utils/recording'

const METRIC_LABELS = ['dist', 'sync %', 'speed Δ'] as const

export function useAnimation(
  svgRef: React.RefObject<SVGSVGElement | null>,
  config: Config,
  setIsRecording: (v: boolean) => void,
  setStartMarker: (v: { x: number; y: number } | null) => void,
  chipRef: React.RefObject<HTMLDivElement | null>,
  metricIndexRef: React.RefObject<MetricIndex>,
  timerRef: React.RefObject<HTMLDivElement | null>,
) {
  const configRef = useRef(config)
  configRef.current = config

  const physics = useRef({ x: -999, y: -999, vx: 0, vy: 0 })
  const leader = useRef({ x: -999, y: -999, visible: false })
  const rafRef = useRef<number>(0)

  const leaderTrailRef = useRef<TrailPoint[]>([])
  const followerTrailRef = useRef<TrailPoint[]>([])
  const ghostLeaderTrailRef = useRef<TrailPoint[]>([])
  const ghostFollowerTrailRef = useRef<TrailPoint[]>([])

  const lastTapTime = useRef(0)
  const recordingRef = useRef<{ active: boolean; startTime: number; points: RecordedPoint[]; config: Config }>({
    active: false, startTime: 0, points: [], config: DEFAULT_CONFIG,
  })
  const loopRef = useRef<Recording | null>(null)
  const loopStartTime = useRef(0)
  const ghostPhysics = useRef({ x: -999, y: -999, vx: 0, vy: 0 })
  const metricSamplesRef = useRef<MetricSample[]>([])
  const lastLoopCycle = useRef(-1)

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

    function onMouseMove(event: MouseEvent) {
      show(event.clientX, event.clientY)
      if (recordingRef.current.active) {
        const t = Date.now() - recordingRef.current.startTime
        recordingRef.current.points.push({ x: event.clientX, y: event.clientY, t })
      }
    }
    function onMouseLeave(event: MouseEvent) {
      if (chipRef.current?.contains(event.relatedTarget as Node)) return
      if (recordingRef.current.active) onMouseUp()
      hide()
    }

    function onMouseDown(event: MouseEvent) {
      const now = Date.now()
      recordingRef.current = { active: true, startTime: now, points: [], config: { ...configRef.current } }
      loopRef.current = null
      ghostPhysics.current = { x: -999, y: -999, vx: 0, vy: 0 }
      ghostLeaderTrailRef.current.length = 0
      ghostFollowerTrailRef.current.length = 0
      ghostLeaderDot.attr('opacity', 0)
      ghostFollowerDot.attr('opacity', 0)
      setIsRecording(true)
      setStartMarker({ x: event.clientX, y: event.clientY })
    }

    function onMouseUp() {
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
    }

    function onTouchStart(event: TouchEvent) {
      const now = Date.now()
      if (now - lastTapTime.current < DOUBLE_TAP_MS) {
        lastTapTime.current = 0
        const touch = event.touches[0]
        recordingRef.current = { active: true, startTime: now, points: [], config: { ...configRef.current } }
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
    }

    const el = svgRef.current!
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('mouseup', onMouseUp)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    function tick() {
      const now = Date.now()
      const { showLeader, showFollower, leaderTrail, followerTrail, stiffness, damping, mass, trailType, trailFade } = configRef.current

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

        if (leaderTrail > 0) {
          leaderTrailRef.current.push({ x: leader.current.x, y: leader.current.y, t: now })
          trimTrail(leaderTrailRef.current, leaderTrail, now)
        } else {
          leaderTrailRef.current.length = 0
        }
        if (followerTrail > 0) {
          followerTrailRef.current.push({ x: p.x, y: p.y, t: now })
          trimTrail(followerTrailRef.current, followerTrail, now)
        } else {
          followerTrailRef.current.length = 0
        }
      }

      renderTrail(leaderTrailGroup, leaderTrailRef.current, LEADER_RADIUS, 'dodgerblue', 3, leaderTrail, now, trailType, trailFade)
      renderTrail(followerTrailGroup, followerTrailRef.current, FOLLOWER_RADIUS, 'tomato', 2, followerTrail, now, trailType, trailFade)

      const loop = loopRef.current
      let ghostActive = false
      if (loop && loop.duration > 0) {
        const elapsed = now - loopStartTime.current
        const totalDuration = loop.duration + loop.returnDuration
        const cycle = Math.floor(elapsed / totalDuration)
        const t = elapsed % totalDuration
        if (t <= loop.duration) {
          ghostActive = true
          const ghostLeaderPos = interpolateRecording(loop.points, t)
          const gp = ghostPhysics.current
          const dx = ghostLeaderPos.x - gp.x
          const dy = ghostLeaderPos.y - gp.y
          gp.vx = gp.vx * loop.config.damping + (dx * loop.config.stiffness) / loop.config.mass
          gp.vy = gp.vy * loop.config.damping + (dy * loop.config.stiffness) / loop.config.mass
          gp.x += gp.vx
          gp.y += gp.vy

          ghostLeaderDot.attr('cx', ghostLeaderPos.x).attr('cy', ghostLeaderPos.y).attr('opacity', loop.config.showLeader ? 0.4 : 0)
          ghostFollowerDot.attr('cx', gp.x).attr('cy', gp.y).attr('opacity', loop.config.showFollower ? 0.4 : 0)

          if (loop.config.leaderTrail > 0) {
            ghostLeaderTrailRef.current.push({ x: ghostLeaderPos.x, y: ghostLeaderPos.y, t: now })
            trimTrail(ghostLeaderTrailRef.current, loop.config.leaderTrail, now)
          } else {
            ghostLeaderTrailRef.current.length = 0
          }
          if (loop.config.followerTrail > 0) {
            ghostFollowerTrailRef.current.push({ x: gp.x, y: gp.y, t: now })
            trimTrail(ghostFollowerTrailRef.current, loop.config.followerTrail, now)
          } else {
            ghostFollowerTrailRef.current.length = 0
          }

          if (liveVisible) {
            if (cycle !== lastLoopCycle.current) {
              metricSamplesRef.current.length = 0
              lastLoopCycle.current = cycle
            }
            const p = physics.current
            const distVal = Math.sqrt((p.x - gp.x) ** 2 + (p.y - gp.y) ** 2)
            const vLive = Math.sqrt(p.vx ** 2 + p.vy ** 2)
            const vGhost = Math.sqrt(gp.vx ** 2 + gp.vy ** 2)
            metricSamplesRef.current.push({ dist: distVal, vDiff: Math.abs(vLive - vGhost) })

            const chip = chipRef.current
            if (chip) {
              const samples = metricSamplesRef.current
              const n = samples.length
              const idx = metricIndexRef.current
              let value: string
              if (idx === 0) {
                const mean = samples.reduce((s, x) => s + x.dist, 0) / n
                value = mean.toFixed(1) + ' px'
              } else if (idx === 1) {
                const hits = samples.filter(x => x.dist < SYNC_THRESHOLD_PX).length
                value = ((hits / n) * 100).toFixed(0) + '%'
              } else {
                const mean = samples.reduce((s, x) => s + x.vDiff, 0) / n
                value = mean.toFixed(2) + ' px/f'
              }
              const label = chip.querySelector('.chip-label') as HTMLElement | null
              const val = chip.querySelector('.chip-value') as HTMLElement | null
              if (label) label.textContent = METRIC_LABELS[idx]
              if (val) val.textContent = value
              chip.style.opacity = '1'
            }
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

      if (!ghostActive) {
        const chip = chipRef.current
        if (chip) chip.style.opacity = '0'
      }

      const timer = timerRef.current
      if (timer) {
        if (loop && loop.duration > 0) {
          const elapsed = now - loopStartTime.current
          const t = elapsed % (loop.duration + loop.returnDuration)
          if (t <= loop.duration) {
            timer.style.width = ((t / loop.duration) * 100) + '%'
          } else {
            timer.style.width = '0%'
          }
        } else {
          timer.style.width = '0%'
        }
      }

      renderTrail(ghostLeaderTrailGroup, ghostLeaderTrailRef.current, LEADER_RADIUS, 'dodgerblue', 3, loop?.config.leaderTrail ?? 0, now, loop?.config.trailType ?? trailType, loop?.config.trailFade ?? trailFade)
      renderTrail(ghostFollowerTrailGroup, ghostFollowerTrailRef.current, FOLLOWER_RADIUS, 'tomato', 2, loop?.config.followerTrail ?? 0, now, loop?.config.trailType ?? trailType, loop?.config.trailFade ?? trailFade)

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('mouseup', onMouseUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
      cancelAnimationFrame(rafRef.current!)
    }
  }, [])
}
