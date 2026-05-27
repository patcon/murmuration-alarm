import * as d3 from 'd3'
import type { TrailPoint } from '../types'

export function trimTrail(buf: TrailPoint[], maxAge: number, now: number) {
  const cutoff = now - maxAge
  let i = 0
  while (i < buf.length && buf[i].t < cutoff) i++
  if (i > 0) buf.splice(0, i)
}

export function renderTrail(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  buf: TrailPoint[],
  radius: number,
  color: string,
  strokeWidth: number,
  maxAge: number,
  now: number,
  trailType: 'outline' | 'path',
  trailFade: boolean,
) {
  if (maxAge === 0 || buf.length === 0) {
    group.selectAll('circle').remove()
    group.selectAll('polyline').remove()
    group.selectAll('line').remove()
    return
  }
  if (trailType === 'outline') {
    group.selectAll('polyline').remove()
    group.selectAll('line').remove()
    group.selectAll<SVGCircleElement, TrailPoint>('circle')
      .data(buf, d => String(d.t))
      .join('circle')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('opacity', d => trailFade ? Math.max(0, (1 - (now - d.t) / maxAge) * 0.5) : 0.5)
  } else {
    group.selectAll('circle').remove()
    if (trailFade && buf.length >= 2) {
      group.selectAll('polyline').remove()
      const pairs = d3.pairs(buf)
      group.selectAll<SVGLineElement, [TrailPoint, TrailPoint]>('line')
        .data(pairs, d => String(d[0].t))
        .join('line')
        .attr('x1', d => d[0].x).attr('y1', d => d[0].y)
        .attr('x2', d => d[1].x).attr('y2', d => d[1].y)
        .attr('stroke', color)
        .attr('stroke-width', strokeWidth)
        .attr('opacity', d => Math.max(0, (1 - (now - (d[0].t + d[1].t) / 2) / maxAge) * 0.5))
    } else {
      group.selectAll('line').remove()
      const pts = buf.map(d => `${d.x},${d.y}`).join(' ')
      group.selectAll<SVGPolylineElement, string>('polyline')
        .data([pts])
        .join('polyline')
        .attr('points', d => d)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', strokeWidth)
        .attr('opacity', 0.5)
    }
  }
}
