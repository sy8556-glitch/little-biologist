import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTutorial } from '../../context/TutorialContext'

// AGENTS.md §11: 집중형 화면에서 전체 사이드바를 임의로 복원하지 않는다.
// screen-requirements.md: 도감/퀘스트 등은 '목장으로 돌아가기' 중심의 집중형 내비게이션을 사용한다.
// to/label을 넘기면 다른 목적지로도 쓸 수 있다 — 예: 친구 도감(FriendFieldGuide.jsx)에서는
// 내 목장이 아니라 방금 보던 친구 목장으로 돌아가야 한다.
export default function RanchBackButton({ to = '/ranch', label = '목장으로 돌아가기' }) {
  const navigate = useNavigate()
  const { step, advance } = useTutorial()
  const buttonRef = useRef(null)
  const [decoyRect, setDecoyRect] = useState(null)
  // 튜토리얼 3단계(랜덤 곤충)에서 도감으로 넘어간 뒤엔, 4단계(서식지 누르기)로 가려면 먼저
  // 목장으로 돌아와야 한다 — 그 사이를 잇는 전용 단계라 이 버튼을 누르는 게 곧 다음 단계로
  // 넘어가는 액션이다. 친구 목장으로 돌아가는 경우(to가 기본값이 아님)는 해당 없다.
  const isTutorialReturnStep = step?.id === 'return-to-ranch' && to === '/ranch'

  // 이 버튼을 감싼 FocusedLayout 루트가 isolation:isolate이고, 그 위 <header>도
  // backdrop-blur(backdrop-filter)라 각각 새 stacking context를 만든다 — 겹겹이 쌓인 이 트랩들
  // 때문에 버튼에 아무리 z-index를 줘도 바깥 튜토리얼 락을 못 이긴다. body에 직접 붙는 portal로
  // 완전히 빠져나와서, 화면을 막는 레이어와 실제로 눌리는 버튼(진짜 버튼과 같은 자리)을 같이 그린다.
  useEffect(() => {
    if (!isTutorialReturnStep) return
    const updateRect = () => {
      if (buttonRef.current) setDecoyRect(buttonRef.current.getBoundingClientRect())
    }
    updateRect()
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [isTutorialReturnStep])

  function handleClick() {
    if (isTutorialReturnStep) advance()
    navigate(to)
  }

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={handleClick}
        className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-card hover:bg-ivory-100"
      >
        <span aria-hidden="true">←</span>
        {label}
      </button>

      {isTutorialReturnStep &&
        decoyRect &&
        createPortal(
          <div className="pointer-events-auto fixed inset-0 z-[95]" aria-hidden="true">
            <button
              type="button"
              onClick={handleClick}
              className="relative flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-card hover:bg-ivory-100"
              style={{
                position: 'fixed',
                left: decoyRect.left,
                top: decoyRect.top,
                width: decoyRect.width,
                height: decoyRect.height,
              }}
            >
              <span aria-hidden="true">←</span>
              {label}
              <span className="tutorial-target-guide pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
                <span className="tutorial-target-ring tutorial-target-ring--small" aria-hidden="true" />
                <span className="tutorial-target-arrow" aria-hidden="true">👇</span>
                <span className="tutorial-target-label">여기를 눌러보세요</span>
              </span>
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
