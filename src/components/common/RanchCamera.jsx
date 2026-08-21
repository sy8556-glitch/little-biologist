// ranch.md: 목장 화면 전체를 지도처럼 드래그(팬)하고 확대/축소(줌)할 수 있게 하는 카메라 래퍼.
// children(배경+대객체+배치된 인테리어)의 상대 위치는 절대 바뀌지 않는다 — 이 컴포넌트는
// children 전체를 하나의 "세계"로 두고 그 위를 CSS transform으로만 움직인다.
// 확대해도 목장 밖(빈 공간)이 보이지 않도록, 그리고 드래그로 끝까지 이동해도 울타리 밖으로
// 못 나가도록 pan 값을 항상 clamp한다. 자세한 수식은 아래 clampPan 참고.
import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 2.5
const DRAG_THRESHOLD_PX = 6

function clampPan(pan, zoom, size) {
  if (!size.width || !size.height) return pan
  const minX = size.width * (1 - zoom)
  const minY = size.height * (1 - zoom)
  return {
    x: Math.min(0, Math.max(minX, pan.x)),
    y: Math.min(0, Math.max(minY, pan.y)),
  }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export default function RanchCamera({ children, resetSignal }) {
  const viewportRef = useRef(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, zoom: 1 })
  const transformRef = useRef(transform)

  // resetSignal이 바뀌면(예: 튜토리얼이 '이 곤충을 눌러보세요' 단계로 들어설 때) 카메라를 원점으로
  // 되돌린다 — 팬/줌 상태가 남아있으면 그 값이 identity가 아니어서 transform 속성이 다시 붙고,
  // 그러면 튜토리얼 타깃의 z-index가 튜토리얼 오버레이를 다시 못 이기게(스태킹 컨텍스트에 갇히게)
  // 된다. 아래 style 계산은 이 값이 정확히 {0,0,1}일 때만 transform을 생략한다.
  useEffect(() => {
    if (resetSignal === undefined) return
    transformRef.current = { x: 0, y: 0, zoom: 1 }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetSignal이 바뀌는 순간에만 외부 신호로 카메라를 되돌린다.
    setTransform({ x: 0, y: 0, zoom: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetSignal이 바뀔 때만 리셋한다.
  }, [resetSignal])

  const pointersRef = useRef(new Map())
  const gestureRef = useRef(null)
  const draggedRef = useRef(false)

  function getViewportSize() {
    const rect = viewportRef.current?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : { width: 0, height: 0 }
  }

  const zoomAtScreenPoint = useCallback((screenX, screenY, rawZoom, basePan, baseZoom) => {
    const size = getViewportSize()
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawZoom))
    const rect = viewportRef.current.getBoundingClientRect()
    const localX = screenX - rect.left
    const localY = screenY - rect.top
    const worldX = (localX - basePan.x) / baseZoom
    const worldY = (localY - basePan.y) / baseZoom
    const nextPan = clampPan(
      { x: localX - worldX * nextZoom, y: localY - worldY * nextZoom },
      nextZoom,
      size,
    )
    const next = { x: nextPan.x, y: nextPan.y, zoom: nextZoom }
    transformRef.current = next
    setTransform(next)
  }, [])

  // 데스크톱 휠 줌 — React onWheel은 기본 passive라 preventDefault가 안 먹어서 네이티브로 등록.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (event) => {
      event.preventDefault()
      const factor = Math.exp(-event.deltaY * 0.001)
      const current = transformRef.current
      zoomAtScreenPoint(event.clientX, event.clientY, current.zoom * factor, current, current.zoom)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAtScreenPoint])

  // 탭인지 드래그인지 구분해야 해서, pointerdown 시점엔 캡처하지 않는다 — 캡처를 걸면 Chromium이
  // 이후 click의 타깃까지 캡처한 엘리먼트(이 뷰포트)로 리다이렉트해버려서, 살짝만 움직여도
  // 대객체 버튼의 onClick(서식지 이동)이 아예 안 먹는다. 그래서 실제로 드래그 임계값을
  // 넘었을 때(handlePointerMove)만 캡처한다 — 그전까지는 평범한 탭으로 통과시킨다.
  function handlePointerDown(event) {
    // 기본 동작(텍스트/이미지 드래그 선택)을 막지 않으면 데스크톱에서 드래그할 때 파란
    // 선택 하이라이트가 생긴다.
    event.preventDefault()
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 1) {
      const p = pointersRef.current.get(event.pointerId)
      gestureRef.current = { mode: 'pan', lastX: p.x, lastY: p.y, startX: p.x, startY: p.y, pointerId: event.pointerId }
      draggedRef.current = false
    } else if (pointersRef.current.size === 2) {
      viewportRef.current?.setPointerCapture(event.pointerId)
      const pts = [...pointersRef.current.values()]
      gestureRef.current = {
        mode: 'pinch',
        startDistance: distance(pts[0], pts[1]),
        startZoom: transformRef.current.zoom,
        startPan: { x: transformRef.current.x, y: transformRef.current.y },
        startMid: midpoint(pts[0], pts[1]),
      }
    }
  }

  function handlePointerMove(event) {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = gestureRef.current
    if (!gesture) return

    if (gesture.mode === 'pan' && pointersRef.current.size === 1) {
      const dx = event.clientX - gesture.lastX
      const dy = event.clientY - gesture.lastY
      gesture.lastX = event.clientX
      gesture.lastY = event.clientY
      const totalMove = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
      if (totalMove > DRAG_THRESHOLD_PX && !draggedRef.current) {
        draggedRef.current = true
        viewportRef.current?.setPointerCapture(gesture.pointerId)
      }
      if (!draggedRef.current) return

      const { x, y, zoom } = transformRef.current
      const size = getViewportSize()
      const clamped = clampPan({ x: x + dx, y: y + dy }, zoom, size)
      const next = { x: clamped.x, y: clamped.y, zoom }
      transformRef.current = next
      setTransform(next)
    } else if (gesture.mode === 'pinch' && pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()]
      const scaleFactor = distance(pts[0], pts[1]) / gesture.startDistance
      zoomAtScreenPoint(
        gesture.startMid.x,
        gesture.startMid.y,
        gesture.startZoom * scaleFactor,
        gesture.startPan,
        gesture.startZoom,
      )
      draggedRef.current = true
    }
  }

  function endPointer(event) {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 0) {
      gestureRef.current = null
    } else if (pointersRef.current.size === 1) {
      const [[remainingId, remaining]] = pointersRef.current.entries()
      gestureRef.current = {
        mode: 'pan',
        lastX: remaining.x,
        lastY: remaining.y,
        startX: remaining.x,
        startY: remaining.y,
        pointerId: remainingId,
      }
    }
  }

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onClickCapture={(event) => {
        if (draggedRef.current) {
          event.preventDefault()
          event.stopPropagation()
          draggedRef.current = false
        }
      }}
      className="absolute inset-0 touch-none select-none overflow-hidden"
    >
      <div
        className="absolute inset-0"
        // transform은 값이 identity(0,0,1)여도 새 stacking context를 만든다 — 그러면 이 안의
        // 튜토리얼 타깃(반짝이는 곤충 등, z-[110])이 아무리 z-index를 올려도 밖에 있는 튜토리얼
        // 오버레이(z-[100])보다 위로 못 올라가 클릭이 막힌다. 카메라를 안 움직인 기본 상태에서는
        // transform 속성 자체를 아예 안 넣어서 그 문제를 피한다.
        style={
          transform.x !== 0 || transform.y !== 0 || transform.zoom !== 1
            ? { transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`, transformOrigin: '0 0' }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  )
}
