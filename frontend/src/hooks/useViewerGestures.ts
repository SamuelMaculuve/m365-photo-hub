import { useCallback, useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'

export const MIN_SCALE = 1
export const MAX_SCALE = 5
const SWIPE_THRESHOLD = 60
const DOUBLE_TAP_MS = 300

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

interface Options {
  resetKey: unknown
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

/** Zoom, rotação, pan, swipe, pinch e duplo toque via Pointer Events. */
export function useViewerGestures({ resetKey, onSwipeLeft, onSwipeRight }: Options) {
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [swipeDx, setSwipeDx] = useState(0)

  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    startOffset: { x: 0, y: 0 },
    pinchDist: 0,
    pinchScale: 1,
    multi: false,
    lastTap: 0,
  })

  const reset = useCallback(() => {
    setScale(1)
    setRotation(0)
    setOffset({ x: 0, y: 0 })
    setSwipeDx(0)
  }, [])

  useEffect(() => {
    reset()
  }, [resetKey, reset])

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => {
      const next = clamp(s * factor, MIN_SCALE, MAX_SCALE)
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])
  const zoomIn = useCallback(() => zoomBy(1.5), [zoomBy])
  const zoomOut = useCallback(() => zoomBy(1 / 1.5), [zoomBy])
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), [])

  const distance = () => {
    const [a, b] = [...pointers.current.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (pointers.current.size === 2) {
      g.multi = true
      g.pinchDist = distance()
      g.pinchScale = scale
      setSwipeDx(0)
    } else if (pointers.current.size === 1) {
      g.multi = false
      g.startX = e.clientX
      g.startY = e.clientY
      g.startTime = Date.now()
      g.startOffset = offset
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (pointers.current.size >= 2 && g.pinchDist > 0) {
      setScale(clamp((g.pinchScale * distance()) / g.pinchDist, MIN_SCALE, MAX_SCALE))
      return
    }
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (scale > 1) setOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy })
    else if (!g.multi && e.pointerType !== 'mouse') setSwipeDx(dx)
  }

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size > 0) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    setSwipeDx(0)
    if (g.multi) {
      g.multi = false
      if (scale <= 1.02) reset()
      return
    }
    const moved = Math.hypot(dx, dy)
    const elapsed = Date.now() - g.startTime
    if (scale <= 1 && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) onSwipeLeft?.()
      else onSwipeRight?.()
      return
    }
    if (moved < 10 && elapsed < 250) {
      const now = Date.now()
      if (now - g.lastTap < DOUBLE_TAP_MS) {
        g.lastTap = 0
        if (scale > 1) {
          setScale(1)
          setOffset({ x: 0, y: 0 })
        } else setScale(2.5)
      } else g.lastTap = now
    }
  }

  const onWheel = (e: WheelEvent<HTMLElement>) => {
    if (e.deltaY === 0) return
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)
  }

  const transform = `translate(${offset.x + swipeDx}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`

  return {
    scale,
    rotation,
    transform,
    swiping: swipeDx !== 0,
    zoomIn,
    zoomOut,
    rotate,
    reset,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onWheel,
    },
  }
}
