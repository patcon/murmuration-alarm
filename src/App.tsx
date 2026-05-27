import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const DOT_RADIUS = 44

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    const dot = svg.select<SVGCircleElement>('circle')

    function show(x: number, y: number) {
      dot
        .attr('cx', x)
        .attr('cy', y)
        .attr('opacity', 1)
    }

    function hide() {
      dot.attr('opacity', 0)
    }

    function onMouseMove(event: MouseEvent) {
      show(event.clientX, event.clientY)
    }

    function onMouseLeave() {
      hide()
    }

    function onTouchMove(event: TouchEvent) {
      event.preventDefault()
      const touch = event.touches[0]
      show(touch.clientX, touch.clientY)
    }

    function onTouchEnd() {
      hide()
    }

    const el = svgRef.current!
    el.addEventListener('mousemove', onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
    >
      <circle r={DOT_RADIUS} fill="none" stroke="dodgerblue" strokeWidth={3} opacity={0} />
    </svg>
  )
}
