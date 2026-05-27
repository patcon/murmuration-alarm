import type { RecordedPoint } from '../types'

export function interpolateRecording(points: RecordedPoint[], t: number): { x: number; y: number } {
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

export function computeReturnDuration(points: RecordedPoint[]): number {
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
