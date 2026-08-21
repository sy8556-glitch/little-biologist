import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../router/AuthContext'
import { useQuests } from './QuestsContext'
import { EGG_GRANT_CLOSED_EVENT } from '../components/common/EggFirstRevealEffect'
import { playSfx } from '../utils/sound'
import { SFX } from '../utils/sfx'

const STORAGE_KEY = 'hasCompletedTutorial'
const LEGACY_STORAGE_KEY = 'little-biologist-tutorial-completed'
const PROGRESS_STORAGE_PREFIX = 'little-biologist-tutorial-progress'
const TARGET_HABITAT_STORAGE_PREFIX = 'little-biologist-tutorial-target-habitat'
const TARGET_SPECIES_STORAGE_PREFIX = 'little-biologist-tutorial-target-species'
const FALLBACK_EGG_IMAGE = '/ui/egg-clean.png'

// 계정마다 배정된 대표 캐릭터가 튜토리얼을 진행한다 — 가방에서 "선택하기"로 고른 캐릭터가
// 있으면 그걸(QuestsContext.featuredCharacterImage), 없으면 지금 자라고 있는 캐릭터를 보여준다.
const STEPS = [
  { id: 'welcome', title: '신비한 알 기르기 안내', description: '반가워요! 귀여운 첫 알을 얻었네요. 이 알이 어떻게 멋진 생물 친구가 되는지 알려줄게요!' },
  { id: 'ranch', title: '목장을 둘러봐요', description: '나와 발견한 생물들이 모이는 나만의 자연 목장이에요.' },
  { id: 'random-insect', title: '첫 생물을 만나봐요', description: '목장 위에 반짝이는 생물 흔적이 나타나면 눌러서 첫 생물을 등록해 보세요.', actionLabel: '반짝이는 생물을 눌러 보세요' },
  { id: 'return-to-ranch', title: '다시 목장으로 가요', description: '도감을 확인했으니 이제 다시 목장으로 돌아가 볼까요?', actionLabel: '목장으로 돌아가기 버튼을 눌러 보세요' },
  { id: 'habitat', title: '서식지로 가 볼까요?', description: '반짝이는 표시가 있는 서식지를 눌러 관찰을 시작해 보세요.', actionLabel: '반짝이는 서식지를 눌러 보세요' },
  { id: 'insect', title: '곤충을 관찰해요', description: '통통 튀는 표시가 있는 곤충을 눌러 자세한 특징을 확인해 보세요.', actionLabel: '표시된 곤충을 눌러 보세요' },
  { id: 'field-guide', title: '도감에 기록해요', description: '발견한 곤충은 도감에서 다시 확인하고 특징을 살펴볼 수 있어요.' },
  { id: 'exploration', title: '탐험으로 발견해요', description: '사진이나 그림을 올리면 AI가 어떤 곤충인지 후보를 찾아줘요.' },
  { id: 'quests', title: '미션 보상을 받아요', description: '관찰과 기록을 이어가며 미션을 완료하고 나뭇잎을 모아 보세요.' },
  { id: 'bag', title: '목장을 꾸며요', description: '가방의 아이템을 목장에 배치해서 나만의 자연 공간을 만들어 보세요.' },
]

// 튜토리얼 1번째 화면(welcome)에서 알-유충-번데기-성체 성장 흐름을 3단계 카드로 미리 보여준다.
const EGG_GROWTH_CARDS = [
  ['Step 1', '신나게 탐험하기', "게임을 재미있게 플레이하면 '쑥쑥 성장포인트'가 차곡차곡 모여요."],
  ['Step 2', '알에서 깨어나기', '성장포인트가 가득 차면 알을 깨고 멋진 성체 친구가 돼요.'],
  ['Step 3', '가방에 보관하기', '완성된 친구는 가방에 보관되고, 새로운 곤충 알을 또 선물받아요.'],
]

// insect 단계는 targetHabitatId(3단계에서 잡은 곤충의 서식지)에 맞는 서식지로 가야 한다 —
// 예전엔 '/ranch/forest'로 고정돼 있어서, 숲이 아닌 서식지(가로수 등)의 곤충을 잡은 계정은
// '돌아가기'를 누르면 엉뚱한(숲) 서식지로 돌려보내져 관찰할 곤충이 없는 채로 튜토리얼이 막혔다.
const STEP_ROUTES = {
  'field-guide': '/field-guide',
  exploration: '/exploration',
  quests: '/quests',
  bag: '/bag',
}

// 탐험도우미(도움말) 버튼으로 튜토리얼을 다시 볼 때는 이 두 단계를 건너뛴다 — 둘 다 최초 1회용
// 액션(반짝이 곤충 강제 출몰, 도감→목장 이동 유도)이라 이미 곤충을 잡아본 계정이 다시 겪으면
// 어색하고, random-insect 단계는 재출몰 대기시간과 무관하게 반짝이를 강제로 띄워버린다.
const SKIP_ON_HELP_RESTART = new Set(['random-insect', 'return-to-ranch'])

const TutorialContext = createContext(null)

function scopedKey(key, uid) {
  return `${key}:${uid ?? 'guest'}`
}

function hasCompletedTutorial(uid) {
  if (uid) return localStorage.getItem(scopedKey(STORAGE_KEY, uid)) === 'true'
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

function readTutorialProgress(uid) {
  const raw = localStorage.getItem(scopedKey(PROGRESS_STORAGE_PREFIX, uid))
  const index = Number(raw)
  return Number.isInteger(index) && index >= 0 && index < STEPS.length ? index : 0
}

function saveTutorialProgress(uid, index) {
  localStorage.setItem(scopedKey(PROGRESS_STORAGE_PREFIX, uid), String(index))
}

function clearTutorialProgress(uid) {
  localStorage.removeItem(scopedKey(PROGRESS_STORAGE_PREFIX, uid))
  localStorage.removeItem(scopedKey(TARGET_HABITAT_STORAGE_PREFIX, uid))
  localStorage.removeItem(scopedKey(TARGET_SPECIES_STORAGE_PREFIX, uid))
}

function readTargetHabitatId(uid) {
  return localStorage.getItem(scopedKey(TARGET_HABITAT_STORAGE_PREFIX, uid)) || null
}

function saveTargetHabitatId(uid, habitatId) {
  if (!habitatId) return
  localStorage.setItem(scopedKey(TARGET_HABITAT_STORAGE_PREFIX, uid), habitatId)
}

function readTargetSpeciesId(uid) {
  const value = Number(localStorage.getItem(scopedKey(TARGET_SPECIES_STORAGE_PREFIX, uid)))
  return Number.isFinite(value) ? value : null
}

function saveTargetSpeciesId(uid, speciesId) {
  if (speciesId == null) return
  localStorage.setItem(scopedKey(TARGET_SPECIES_STORAGE_PREFIX, uid), String(speciesId))
}

function markTutorialCompleted(uid) {
  localStorage.setItem(scopedKey(STORAGE_KEY, uid), 'true')
  if (!uid) localStorage.setItem(STORAGE_KEY, 'true')
  localStorage.setItem(LEGACY_STORAGE_KEY, 'true')
  clearTutorialProgress(uid)
}

export function TutorialProvider({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stepIndex, setStepIndex] = useState(null)
  // 첫 로그인 때는 EggFirstRevealEffect.jsx의 "알을 얻었습니다" 안내 모달이 먼저 뜨고, 그걸 닫아야
  // (EGG_GRANT_CLOSED_EVENT) 튜토리얼이 시작된다 — 둘이 동시에 겹쳐 뜨는 걸 막기 위함.
  const [eggGrantReady, setEggGrantReady] = useState(!location.state?.firstLogin)
  const [targetHabitatId, setTargetHabitatId] = useState(() => readTargetHabitatId(user?.uid))
  const [targetSpeciesId, setTargetSpeciesId] = useState(() => readTargetSpeciesId(user?.uid))
  // 탐험도우미 버튼으로 다시 보는 중인지 여부 — 이 동안만 advance()가 SKIP_ON_HELP_RESTART
  // 단계를 건너뛴다. 최초 로그인 튜토리얼은 이 값이 항상 false라 전체 단계를 그대로 다 본다.
  const [isHelpRestart, setIsHelpRestart] = useState(false)

  useEffect(() => {
    if (!location.state?.firstLogin) {
      setEggGrantReady(true)
      return undefined
    }
    setStepIndex(null)
    setEggGrantReady(false)
    setIsHelpRestart(false)
    const handleEggGrantClosed = () => setEggGrantReady(true)
    window.addEventListener(EGG_GRANT_CLOSED_EVENT, handleEggGrantClosed)
    return () => window.removeEventListener(EGG_GRANT_CLOSED_EVENT, handleEggGrantClosed)
  }, [location.state?.firstLogin])

  useEffect(() => {
    if (location.pathname !== '/ranch' || location.state?.editPlacementId) return
    if (location.state?.firstLogin && !eggGrantReady) return
    if (!hasCompletedTutorial(user?.uid) || location.state?.firstLogin) {
      const savedIndex = location.state?.firstLogin ? 0 : readTutorialProgress(user?.uid)
      saveTutorialProgress(user?.uid, savedIndex)
      setStepIndex((current) => current ?? savedIndex)
    }
  }, [eggGrantReady, location.pathname, location.state, user?.uid])

  useEffect(() => {
    setTargetHabitatId(readTargetHabitatId(user?.uid))
    setTargetSpeciesId(readTargetSpeciesId(user?.uid))
  }, [user?.uid])

  // TutorialProvider는 Routes 바깥(App.jsx)에 있어서 로그인/회원가입 화면으로 이동해도 마운트
  // 상태가 유지된다 — 로그아웃·세션 만료 등으로 로그인 화면에 돌아왔을 때 이전 stepIndex가 남아
  // 있으면 로그인 화면 위로 튜토리얼이 계속 떠 있게 된다. 로그인/회원가입 화면에 도착하면 즉시
  // 초기화해서 이 화면에서는 튜토리얼이 절대 안 보이게 하고, 다른 계정이 로그인했을 때도 이전
  // 계정의 진행 단계가 새 계정에 잘못 이어지지 않게 한다.
  useEffect(() => {
    if (location.pathname === '/login' || location.pathname === '/signup') {
      setStepIndex(null)
    }
  }, [location.pathname])

  useEffect(() => {
    if (stepIndex === null) return
    const step = STEPS[stepIndex]
    if (location.pathname !== '/ranch') return
    // bag 단계에서 가방 아이템의 "목장에 배치"를 누르면 editPlacementId를 들고 /ranch로
    // 온다 — 이때 이 효과가 곧바로 /bag로 되돌려버리면 배치를 끝까지 해볼 수가 없다.
    if (location.state?.editPlacementId) return
    if (step?.id === 'insect') {
      navigate(`/ranch/${targetHabitatId ?? 'forest'}`, { replace: true })
      return
    }
    const route = STEP_ROUTES[step?.id]
    if (route) navigate(route, { replace: true })
  }, [location.pathname, location.state?.editPlacementId, navigate, stepIndex, targetHabitatId])

  const isWaitingForEggGrant = Boolean(location.state?.firstLogin && !eggGrantReady)
  const isAuthScreen = location.pathname === '/login' || location.pathname === '/signup'

  // 탐험도우미로 다시 볼 때는 SKIP_ON_HELP_RESTART 2단계가 실제로 안 보이니, 안내 문구의
  // "n/전체"도 STEPS.length(10)가 아니라 실제로 보게 될 단계 수(8) 기준으로 맞춘다.
  const totalSteps = isHelpRestart ? STEPS.length - SKIP_ON_HELP_RESTART.size : STEPS.length
  const stepNumber = stepIndex === null
    ? null
    : isHelpRestart
      ? STEPS.slice(0, stepIndex + 1).filter((s) => !SKIP_ON_HELP_RESTART.has(s.id)).length
      : stepIndex + 1

  const value = useMemo(() => ({
    step: isAuthScreen || isWaitingForEggGrant || stepIndex === null ? null : STEPS[stepIndex],
    stepIndex,
    stepNumber,
    totalSteps,
    advance() {
      setStepIndex((current) => {
        if (current === null) return current
        let next = current + 1
        if (isHelpRestart) {
          while (next < STEPS.length && SKIP_ON_HELP_RESTART.has(STEPS[next]?.id)) next += 1
        }
        next = Math.min(next, STEPS.length - 1)
        saveTutorialProgress(user?.uid, next)
        return next
      })
    },
    openIfNeeded() {
      if (location.state?.firstLogin && !eggGrantReady) return
      if (!hasCompletedTutorial(user?.uid)) setStepIndex((current) => current ?? readTutorialProgress(user?.uid))
    },
    targetHabitatId,
    targetSpeciesId,
    setTutorialTarget(habitatId, speciesId) {
      saveTargetHabitatId(user?.uid, habitatId)
      saveTargetSpeciesId(user?.uid, speciesId)
      setTargetHabitatId(habitatId)
      setTargetSpeciesId(speciesId ?? null)
    },
    close() {
      markTutorialCompleted(user?.uid)
      setIsHelpRestart(false)
      setStepIndex(null)
    },
    // 탐험도우미 버튼 — 완료 여부와 무관하게 튜토리얼을 처음부터 다시 보여주되, 최초 1회용
    // 액션 단계(SKIP_ON_HELP_RESTART)는 건너뛴다.
    restart() {
      localStorage.removeItem(scopedKey(STORAGE_KEY, user?.uid))
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(LEGACY_STORAGE_KEY)
      localStorage.removeItem(scopedKey(TARGET_HABITAT_STORAGE_PREFIX, user?.uid))
      localStorage.removeItem(scopedKey(TARGET_SPECIES_STORAGE_PREFIX, user?.uid))
      saveTutorialProgress(user?.uid, 0)
      setTargetHabitatId(null)
      setTargetSpeciesId(null)
      setEggGrantReady(true)
      setIsHelpRestart(true)
      setStepIndex(0)
      navigate('/ranch')
    },
  }), [eggGrantReady, isAuthScreen, isHelpRestart, isWaitingForEggGrant, location.state?.firstLogin, navigate, stepIndex, stepNumber, targetHabitatId, targetSpeciesId, totalSteps, user?.uid])

  return <TutorialContext.Provider value={value}>{children}<TutorialOverlay /></TutorialContext.Provider>
}

export function useTutorial() {
  const context = useContext(TutorialContext)
  if (!context) throw new Error('useTutorial must be used within TutorialProvider')
  return context
}

function TutorialOverlay() {
  const { step, stepNumber, totalSteps, advance, close } = useTutorial()
  const { featuredCharacterImage } = useQuests()
  const navigate = useNavigate()
  const [isClosing, setIsClosing] = useState(false)
  const [bounceKey, setBounceKey] = useState(0)

  useEffect(() => {
    if (step) setIsClosing(false)
  }, [step])

  if (!step) return null

  const eggImage = featuredCharacterImage ?? FALLBACK_EGG_IMAGE

  const nextRoute = {
    'field-guide': '/exploration',
    exploration: '/quests',
    quests: '/bag',
  }[step.id]
  const needsAction =
    step.id === 'random-insect' || step.id === 'return-to-ranch' || step.id === 'habitat' || step.id === 'insect'
  // field-guide/exploration/quests/bag는 액션 없이 그냥 페이지를 보여주는 안내라, 화면 가운데를
  // 블러로 덮으면 지금 어느 화면인지 알아보기 어렵다는 피드백이 있었다 — needsAction 단계와 같은
  // 구석 배치(+블러 없음)로 통일한다.
  const isPageStep = step.id === 'field-guide' || step.id === 'exploration' || step.id === 'quests' || step.id === 'bag'
  const isCompact = needsAction || isPageStep
  const isRightSide = step.id === 'insect' || isPageStep
  const actionPositionClass = isRightSide
    ? 'right-3 bottom-4 w-[min(92vw,24rem)] items-end justify-end gap-1 sm:right-5 sm:bottom-5'
    : 'left-3 bottom-4 w-[min(92vw,24rem)] items-end justify-start gap-1 sm:left-5 sm:bottom-5'
  const isLastStep = step.id === 'bag'
  const isWelcomeStep = step.id === 'welcome'
  // bag 단계는 안내 문구대로 실제 가방 아이템의 "목장에 배치"까지 눌러볼 수 있어야 한다 — 특정
  // 타깃 하나만 z-index로 뚫어주는 needsAction 방식과 달리 어떤 아이템 버튼을 눌러도 되는
  // 상황이라, 이 단계만 배경 락을 걸지 않는다.
  // return-to-ranch 단계도 도감(FieldGuide) 화면의 "목장으로 돌아가기" 버튼을 눌러야 하는데,
  // 그 버튼을 감싸는 FocusedLayout 루트가 isolation:isolate라 z-index로는 락을 못 뚫는다
  // (RanchCamera의 transform과 같은 종류의 stacking context 트랩) — 그래서 이 단계도 락을 건다.
  const shouldLockBackground = step.id !== 'bag' && step.id !== 'return-to-ranch'

  function finish() {
    playSfx(SFX.buttonTutorial)
    setIsClosing(true)
    window.setTimeout(close, 300)
  }

  function next() {
    playSfx(SFX.buttonTutorial)
    setBounceKey((current) => current + 1)
    if (isLastStep) {
      finish()
      return
    }
    window.setTimeout(() => {
      advance()
      if (nextRoute) navigate(nextRoute)
    }, 130)
  }

  return (
    // pointer-events-auto로 바꿔서, 팝업/타깃(z-[110]으로 띄운 반짝이 곤충·서식지·곤충 카드)을
    // 제외한 나머지 화면(하단 내비 등)이 튜토리얼 중에 눌리지 않게 막는다. 이전엔 none이라
    // 배경이 그대로 클릭돼서 다른 화면으로 넘어가 버리는 문제가 있었다. bag 단계만 예외
    // (shouldLockBackground 주석 참고).
    <div
      className={`${shouldLockBackground ? 'pointer-events-auto' : 'pointer-events-none'} fixed inset-0 z-[100] overflow-hidden`}
      aria-live="polite"
    >
      {!isCompact && (
        <div
          className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}

      <div
        className={`tutorial-helper-stage absolute flex transition-all duration-300 ease-out ${
          isCompact
            ? actionPositionClass
            : 'left-1/2 top-1/2 w-[min(94vw,43rem)] -translate-x-1/2 -translate-y-1/2 flex-col-reverse items-center justify-center gap-0 sm:w-[min(90vw,45rem)] sm:flex-row'
        } ${isClosing ? 'scale-50 opacity-0' : 'scale-100 opacity-100'}`}
      >
        <div className={`pointer-events-none relative z-20 transition-transform duration-300 ease-out ${
          isCompact ? 'w-20 shrink-0 sm:w-24' : '-mt-2 sm:-mr-2 sm:mt-0 sm:scale-125'
        }`}>
          <div
            key={bounceKey}
            className={`tutorial-egg-character relative grid place-items-center animate-[tutorial-bounce_300ms_ease-out] ${
              isCompact ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-32 w-32 sm:h-36 sm:w-36'
            }`}
          >
            <img className="h-full w-full object-contain" src={eggImage} alt="탐험도우미" />
          </div>
        </div>

        <section
          role="dialog"
          aria-modal="true"
          aria-label="탐험도우미 튜토리얼"
          data-click-sfx="none"
          className={`tutorial-speech-bubble pointer-events-auto relative z-10 rounded-3xl bg-amber-50/95 shadow-xl ring-2 ring-amber-300/70 backdrop-blur ${
            isCompact ? 'w-[min(72vw,18rem)] px-4 py-3' : 'w-[min(88vw,27rem)] px-5 py-5 sm:w-[27rem] sm:px-6'
          }`}
        >
          <span
            className={`tutorial-speech-tail absolute h-6 w-6 rotate-45 bg-amber-50 ring-2 ring-amber-300/70 ${
              isCompact
                ? isRightSide ? '-right-2 bottom-7' : '-left-2 bottom-7'
                : '-bottom-3 left-1/2 -translate-x-1/2 sm:-left-3 sm:bottom-1/2 sm:translate-x-0 sm:translate-y-1/2'
            }`}
            aria-hidden="true"
          />
          <div className="relative">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-black text-leaf-700`}>튜토리얼 {stepNumber}/{totalSteps}</span>
              <button type="button" onClick={finish} className={`${isCompact ? 'text-xs' : 'text-sm'} rounded-full px-2 py-1 font-black text-ink-700/60 hover:bg-white/70 hover:text-ink-900`}>
                건너뛰기
              </button>
            </div>
            <h2 className={`${isCompact ? 'text-lg' : 'text-2xl'} font-black text-ink-900`}>{step.title}</h2>
            <p className={`${isCompact ? 'mt-1 text-sm leading-6' : 'mt-3 text-base leading-7'} font-bold text-ink-700/80`}>{step.description}</p>

            {isWelcomeStep && (
              <div className="mt-4 grid gap-2.5 text-left">
                {EGG_GROWTH_CARDS.map(([number, title, body]) => (
                  <article key={number} className="rounded-2xl border border-lime-200 bg-white/80 px-4 py-3 shadow-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-black text-leaf-600">{number}</span>
                      <h3 className="text-sm font-black text-ink-900">[{title}]</h3>
                    </div>
                    <p className="mt-1 text-xs font-bold leading-5 text-ink-700/75">{body}</p>
                  </article>
                ))}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              {needsAction ? (
                <span className="rounded-full bg-leaf-50 px-3 py-2 text-xs font-black text-leaf-700">{step.actionLabel}</span>
              ) : (
                <button type="button" onClick={next} className="rounded-full bg-leaf-500 px-6 py-3 text-base font-black text-white shadow-md transition hover:bg-leaf-600 active:scale-95">
                  {isLastStep ? '시작하기' : isWelcomeStep ? '다음으로 넘어가기' : '다음'}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
