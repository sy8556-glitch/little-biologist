import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getInsectSpecies, DEMO_ACCOUNT_USERNAME } from '../../data/insectSpecies'
import { useRegisteredPhotos } from '../../context/RegisteredPhotosContext'
import { useAuth } from '../../router/AuthContext'
import { useTutorial } from '../../context/TutorialContext'
import { useCurrency } from '../../context/CurrencyContext'
import { reportMissionEvent } from '../../utils/missionEvents'
import { playSfx } from '../../utils/sound'
import { SFX } from '../../utils/sfx'
import { preloadImage } from '../../utils/preloadImages'
import ResultModal from './ResultModal'

const EFFECT_SRC = '/effects/랜덤곤충 흰이펙트-2.png'
// 대객체(서식지) 아이콘과 겹치지 않도록 목장 배경 안에서 돌아다닐 범위를 넉넉히 안쪽으로 잡는다.
const BOUNDS = { minX: 8, maxX: 88, minY: 14, maxY: 78 }
const MOVE_INTERVAL_MS = 5500
const SPAWN_INTERVAL_MS = 60 * 60 * 1000 // 클릭 후 다음 출몰까지 대기 시간: 1시간
const REVEAL_FADE_MS = 700 // 큰 사진이 나타나고/사라지는 페이드 시간
const REVEAL_HOLD_MS = 2000 // 큰 사진을 완전히 보여준 채로 유지하는 시간

// 곤충 이름 마지막 글자 받침 유무에 따라 "이/가" 조사를 고른다 (예: 장수풍뎅이가, 호박벌이).
function withIGa(name) {
  if (!name) return ''
  const lastChar = name.charCodeAt(name.length - 1)
  const hasBatchim = (lastChar - 0xac00) % 28 !== 0
  return `${name}${hasBatchim ? '이' : '가'}`
}

function randomPoint() {
  return {
    x: BOUNDS.minX + Math.random() * (BOUNDS.maxX - BOUNDS.minX),
    y: BOUNDS.minY + Math.random() * (BOUNDS.maxY - BOUNDS.minY),
  }
}

// 목장 배경(RanchMapScene) 위를 떠돌아다니는 반짝이 이펙트. 일단은(서버 재시작·새로고침 등
// 앱이 새로 켜질 때마다) 대기 없이 무조건 곧바로 출몰한다. 눌리면 아직 도감에 등록되지 않은
// 동(기본) 등급 곤충 중 하나를 무작위로 등록하고 사라지며, 그 뒤부터는 (다시 켜지 않는 한)
// 1시간 동안 재출몰하지 않는다.
export default function RandomInsectEffect() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { step, advance, setTutorialTarget } = useTutorial()
  const { holdStageUp, releaseStageUp } = useCurrency()
  const isDemoAccount = user?.username === DEMO_ACCOUNT_USERNAME
  const { photos, sketches, bronzeUnlocks, registerBronze } = useRegisteredPhotos()
  const [point, setPoint] = useState(randomPoint)
  // 앱이 새로 켜질 때(첫 마운트)마다 등록할 곤충이 남아 있으면 대기 없이 곧바로 출몰시킨다.
  const [isVisible, setIsVisible] = useState(
    () => getInsectSpecies(isDemoAccount).some((s) => !s.registered && !photos[s.id] && !sketches[s.id] && !bronzeUnlocks[s.id]),
  )
  const [caughtSpecies, setCaughtSpecies] = useState(null)
  const [caughtDuringTutorial, setCaughtDuringTutorial] = useState(false)
  // 등록은 클릭 즉시 끝나지만, 등록으로 받은 성장 포인트가 대표 캐릭터를 성장시키는 순간에는
  // GrowthStageModal이 먼저 화면 전체를 차지해야 한다. 그동안은 이 곤충 등장 연출을 미뤄뒀다가,
  // 성장 모달이 닫히고 나서(stageUp이 사라지면) 시작한다 — 두 전면 이벤트가 겹쳐 보이지 않게.
  const [pendingCatch, setPendingCatch] = useState(null)
  const [revealSpecies, setRevealSpecies] = useState(null)
  const [isRevealVisible, setIsRevealVisible] = useState(false)
  const respawnTimerRef = useRef(null)
  const revealTimersRef = useRef([])
  // setIsVisible(false)는 다음 렌더에서야 버튼을 없애기 때문에, 그 사이(같은 틱 안에서
  // 연타·더블클릭 등으로) handleClick이 또 실행되면 곤충을 여러 마리 얻어버린다. state가 아니라
  // ref로 즉시(동기적으로) 막아야 두 번째 클릭이 바로 걸러진다.
  const isCatchingRef = useRef(false)
  // holdStageUp()을 부른 채로 컴포넌트가 언마운트되면(예: 확인을 누르기 전에 다른 화면으로
  // 나가버림) 카운트가 영영 안 풀려서 이후로 부화/진화 연출이 다시는 안 뜨는 문제가 생긴다.
  const isHoldingStageUpRef = useRef(false)

  const unregisteredPool = useMemo(
    () => getInsectSpecies(isDemoAccount).filter((s) => !s.registered && !photos[s.id] && !sketches[s.id] && !bronzeUnlocks[s.id]),
    [isDemoAccount, photos, sketches, bronzeUnlocks],
  )
  const isTutorialStep = step?.id === 'random-insect'

  useEffect(() => {
    return () => {
      window.clearTimeout(respawnTimerRef.current)
      revealTimersRef.current.forEach((id) => window.clearTimeout(id))
      if (isHoldingStageUpRef.current) releaseStageUp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 언마운트 시 한 번만 정리한다.
  }, [])

  // 튜토리얼이 '첫 곤충을 만나봐요' 단계에 들어서면, 재출몰 대기 시간과 무관하게 곧바로 다시 보여준다.
  // 이 단계는 이제(advance를 확인 버튼까지 미루면서) 등장 연출·팝업을 다 보고 확인할 때까지 계속
  // 유지되는데, 잡을 때마다 unregisteredPool.length가 줄어들며 이 effect가 다시 실행돼 버려서
  // isCatchingRef를 무시하고 반짝이가 곧바로 다시 나타나 여러 마리를 연달아 잡을 수 있었다.
  // 이미 한 마리를 잡아 확인을 기다리는 중(isCatchingRef)이면 다시 보여주지 않는다.
  useEffect(() => {
    if (isTutorialStep && unregisteredPool.length > 0 && !isCatchingRef.current) setIsVisible(true)
  }, [isTutorialStep, unregisteredPool.length])

  useEffect(() => {
    if (!isVisible) return
    isCatchingRef.current = false
    const timer = window.setInterval(() => setPoint(randomPoint()), MOVE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isVisible])

  function handleClick() {
    if (unregisteredPool.length === 0 || isCatchingRef.current) return
    isCatchingRef.current = true
    const target = unregisteredPool[Math.floor(Math.random() * unregisteredPool.length)]
    const isTutorialCatch = isTutorialStep
    // 곤충 등장 연출과 등록 완료 팝업을 다 보고 확인을 누를 때까지, 성장 단계가 올라도
    // 부화/진화 연출이 그 위를 덮지 않게 잡아둔다 — 도감으로 넘어간 뒤에 풀어준다.
    holdStageUp()
    isHoldingStageUpRef.current = true
    registerBronze(target.id)
    reportMissionEvent({ type: 'ranch_insect_found', entityId: target.id })
    playSfx(SFX.registerBronze)
    setCaughtDuringTutorial(isTutorialCatch)
    // 튜토리얼 다음 단계(서식지로 가기)로 넘어갈 대상은 미리 정해두되, 실제로 단계를
    // 넘기는 건(advance) 등장 연출 + "도감에서 확인하기"까지 다 보고 누른 뒤로 미룬다 —
    // 그래야 어떤 곤충을 잡았는지 보기도 전에 튜토리얼이 먼저 다음 단계로 넘어가지 않는다.
    if (isTutorialCatch) {
      setTutorialTarget(target.habitatId, target.id)
    }
    setIsVisible(false)
    window.clearTimeout(respawnTimerRef.current)
    respawnTimerRef.current = window.setTimeout(() => setIsVisible(true), SPAWN_INTERVAL_MS)

    // 곤충 등장 연출은 바로 시작하지 않고 pendingCatch로만 넘긴다 — 실제 시작은 아래
    // useEffect가 stageUp(성장 모달)이 없을 때만 골라서 한다.
    setPendingCatch(target)
  }

  // 동 등급 사진을 목장 위에 크게 띄워 페이드인 → 2초 유지 → 페이드아웃한 뒤,
  // 다 사라지고 나서야 도감 등록 성공 팝업을 띄운다.
  useEffect(() => {
    if (!pendingCatch) return
    const target = pendingCatch
    let cancelled = false

    revealTimersRef.current.forEach((id) => window.clearTimeout(id))
    revealTimersRef.current = []

    // 사진이 다 로드된 뒤에야 페이드인 타이머를 시작한다 — 안 그러면 용량 큰 사진이 아직
    // 안 떠 있는 채로 REVEAL_HOLD_MS가 흘러가 버려 연출이 안 보이고 넘어가는 문제가 생긴다.
    preloadImage(target.defaultUrl ?? target.image).then(() => {
      if (cancelled) return
      setRevealSpecies(target)
      setIsRevealVisible(false)
      const fadeInTimer = window.setTimeout(() => setIsRevealVisible(true), 20)
      const fadeOutTimer = window.setTimeout(() => setIsRevealVisible(false), 20 + REVEAL_HOLD_MS)
      const finishTimer = window.setTimeout(() => {
        setRevealSpecies(null)
        setCaughtSpecies(target)
        setPendingCatch(null)
      }, 20 + REVEAL_HOLD_MS + REVEAL_FADE_MS)
      revealTimersRef.current = [fadeInTimer, fadeOutTimer, finishTimer]
    })

    return () => {
      cancelled = true
    }
  }, [pendingCatch])

  return (
    <>
      {isVisible && unregisteredPool.length > 0 && (
        <button
          type="button"
          onClick={handleClick}
          aria-label="반짝이는 곤충 흔적 — 눌러서 도감에 등록하기"
          className="ranch-random-insect-effect"
          // .ranch-random-insect-effect가 z-index:6을 고정으로 갖고 있어서 Tailwind의 z-[110]
          // 클래스로는 못 이긴다(같은 우선순위인데 index.css가 유틸리티보다 뒤에 로드됨) — 튜토리얼
          // 중엔 인라인 스타일로 확실히 튜토리얼 오버레이(z-100)보다 위로 올린다.
          style={{ left: `${point.x}%`, top: `${point.y}%`, ...(isTutorialStep ? { zIndex: 110 } : {}) }}
        >
          <img src={EFFECT_SRC} alt="" aria-hidden="true" />
          {isTutorialStep && (
            <span className="tutorial-target-guide pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
              <span className="tutorial-target-ring tutorial-target-ring--small" aria-hidden="true" />
              <span className="tutorial-target-arrow" aria-hidden="true">👇</span>
              <span className="tutorial-target-label">여기를 눌러보세요</span>
            </span>
          )}
        </button>
      )}

      {pendingCatch && (
        // pendingCatch가 잡히는 즉시(사진이 아직 로드 중이라 revealSpecies가 비어 있을 때부터)
        // 이 레이어를 깔아서, 팝업이 뜨기 전까지 뒤쪽 목장 UI(하단 내비 등)가 눌려서
        // 다른 화면으로 넘어가는 일이 없게 한다.
        <div className={`ranch-catch-reveal ${isRevealVisible ? 'is-visible' : ''}`} aria-hidden="true">
          {revealSpecies && (
            <img
              src={revealSpecies.defaultUrl ?? revealSpecies.image}
              alt=""
              className="ranch-catch-reveal__image"
            />
          )}
        </div>
      )}

      <ResultModal
        open={Boolean(caughtSpecies)}
        imageSrc={caughtSpecies ? (caughtSpecies.defaultUrl ?? caughtSpecies.image) : undefined}
        title={caughtSpecies ? `${withIGa(caughtSpecies.name)} 나타났어요! 도감에 등록했습니다!` : ''}
        confirmLabel="도감에서 확인하기"
        onConfirm={() => {
          // 방금 잡은 곤충의 상세 정보가 도감에서 바로 보이도록 selectedSpeciesId를 함께 넘긴다
          // (RanchHabitat.jsx의 "선택한 곤충 도감에서 보기"와 같은 방식).
          const speciesId = caughtSpecies?.id
          setCaughtSpecies(null)
          isHoldingStageUpRef.current = false
          navigate('/field-guide', { state: { selectedSpeciesId: speciesId } })
          releaseStageUp()
          if (caughtDuringTutorial) {
            setCaughtDuringTutorial(false)
            advance()
          }
        }}
      />
    </>
  )
}
