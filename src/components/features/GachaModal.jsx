import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { mockShopItems } from '../../data/mockData'
import { useCurrency } from '../../context/CurrencyContext'
import { useBag } from '../../context/BagContext'
import ResultModal from '../common/ResultModal'
import { playSfx } from '../../utils/sound'
import { SFX } from '../../utils/sfx'
import './gacha.css'

// 아동 대상 앱이라 나이 구분 없이 하루 뽑기 횟수를 낮게 고정한다 (D-008 보호자·법적 검토 조건).
const MAX_DAILY_PULLS = 5

export default function GachaModal({ cost = 200 }) {
  const { leaves, addLeaves } = useCurrency()
  const { addItem } = useBag()
  const [stage, setStage] = useState('idle') // idle | shake | capsule | reveal
  const [result, setResult] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [popReady, setPopReady] = useState(false)
  const [confettiKey, setConfettiKey] = useState(0)
  const [sparkles, setSparkles] = useState([])
  const [pullsToday, setPullsToday] = useState(0)
  const [noticeModal, setNoticeModal] = useState(null)

  const POOL = mockShopItems.item.filter((i) => i.category === 'interior')

  // reveal 애니메이션이 끝난 뒤에만 결과 모달을 띄운다 (setState는 타이머 콜백 안에서만 실행).
  useEffect(() => {
    if (stage !== 'reveal' || !result) return
    const popTimer = setTimeout(() => setPopReady(true), 1000 + 120)
    const modalTimer = setTimeout(() => setShowModal(true), 2400)
    return () => {
      clearTimeout(popTimer)
      clearTimeout(modalTimer)
    }
  }, [stage, result])

  async function handlePull() {
    if (stage !== 'idle') return
    if (pullsToday >= MAX_DAILY_PULLS) {
      setNoticeModal({
        title: '오늘의 뽑기를 모두 사용했어요',
        description: `오늘은 ${MAX_DAILY_PULLS}회까지만 뽑을 수 있어요. 내일 다시 찾아와 주세요.`,
      })
      return
    }
    if (leaves < cost) {
      setNoticeModal({
        title: '나뭇잎이 부족합니다',
        description: `뽑기에는 나뭇잎 ${cost}개가 필요해요. 미션과 탐험으로 나뭇잎을 더 모아보세요.`,
      })
      return
    }

    playSfx(SFX.gachaResult)
    setStage('shake')
    await new Promise((r) => setTimeout(r, 700))

    setStage('capsule')
    await new Promise((r) => setTimeout(r, 500))

    const item = POOL[Math.floor(Math.random() * POOL.length)]
    addLeaves(-cost)
    addItem({ id: item.id, name: item.name, category: 'interior', image: item.image })
    setResult(item)
    setPullsToday((count) => count + 1)

    setConfettiKey((k) => k + 1)
    setSparkles(
      Array.from({ length: 48 }).map((_, i) => ({
        id: i,
        left: 12 + Math.random() * 76,
        top: 18 + Math.random() * 28,
        delay: Math.random() * 0.6,
        size: 6 + Math.random() * 18,
        hue: Math.floor(40 + Math.random() * 300),
      })),
    )
    setStage('reveal')
  }

  function exitReveal() {
    setStage('idle')
    setResult(null)
    setShowModal(false)
    setPopReady(false)
  }

  const pullDisabled = stage !== 'idle'

  return (
    <div className="gacha-panel rounded-xl border border-dashed border-ivory-200 p-6 text-center">
      <p className="mb-2 font-black text-ink-900">숲의 보물 상자</p>
      <p className="gacha-panel-copy mb-4 text-sm">
        게임 내 나뭇잎으로만 이용되는 안전한 뽑기예요. 모든 아이템은 동일한 확률로 뽑혀요.
        <br />
        오늘 {pullsToday}/{MAX_DAILY_PULLS}회 뽑았어요.
      </p>

      <div className="gacha-scene mb-4">
        <div className="chest-wrap">
          <motion.div
            className="chest-base"
            animate={stage === 'shake' ? { rotate: [0, -5, 5, -3, 3, 0], scale: [1, 1.02, 0.98, 1] } : { rotate: 0, scale: 1 }}
            transition={{ duration: 0.7 }}
          >
            <img src="/gacha/뽑기 기계-2-trimmed.png" alt="뽑기 기계" className="chest-img" />
          </motion.div>

          <AnimatePresence>
            {stage === 'capsule' && (
              <motion.div
                className="gacha-capsule"
                initial={{ y: -10, scale: 0.8, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: 30, opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                🌿
              </motion.div>
            )}

            {stage === 'reveal' && popReady && (
              <>
                <motion.div
                  className="reveal-pop"
                  initial={{ y: 40, scale: 0.6, opacity: 0 }}
                  animate={{ y: -100, scale: 1, opacity: 1 }}
                  transition={{ duration: 0.8 }}
                >
                  {result?.image ? (
                    <img src={result.image} alt={result.name} className="result-image" />
                  ) : (
                    <div className="text-3xl">🎁</div>
                  )}
                </motion.div>

                {result && (
                  <motion.div
                    className="gacha-result"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.15 }}
                  >
                    <div className="result-name text-ink-900">{result.name}</div>
                  </motion.div>
                )}
              </>
            )}
          </AnimatePresence>

          <div key={confettiKey} className="confetti-root" aria-hidden>
            {stage === 'reveal' &&
              Array.from({ length: 30 }).map((_, i) => <span key={i} className={`confetti c${(i % 6) + 1}`} />)}
          </div>
        </div>

        {stage === 'idle' && (
          <button
            type="button"
            onClick={handlePull}
            disabled={pullDisabled}
            data-click-sfx="none"
            className="chest-action-button"
            aria-label="뽑기 기계 돌리기"
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <img src="/ui/leaf.png" alt="" aria-hidden="true" className="gacha-leaf-icon" />
              {cost}개
            </span>
          </button>
        )}

        <div className="sparkle-root" aria-hidden>
          {stage === 'reveal' &&
            sparkles.map((s) => (
              <span
                key={`sp-${s.id}-${confettiKey}`}
                className="sparkle"
                style={{
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  animationDelay: `${s.delay}s`,
                  width: `${s.size}px`,
                  height: `${s.size}px`,
                  background: `hsl(${s.hue} 90% 60%)`,
                }}
              />
            ))}
        </div>
      </div>

      {stage === 'reveal' && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={exitReveal}
            className="rounded px-4 py-2 text-sm bg-ivory-100 text-ink-900 shadow-sm"
          >
            결과 종료
          </button>
        </div>
      )}

      <div aria-live="polite" className="sr-only" id="gacha-status">
        {stage}
      </div>

      <ResultModal
        open={showModal}
        imageSrc={result?.image}
        title={result ? `획득: ${result.name}` : ''}
        description={result ? `${result.name}이(가) 가방에 담겼어요.` : ''}
        onConfirm={exitReveal}
      />
      <ResultModal
        open={Boolean(noticeModal)}
        imageSrc="/ui/leaf.png"
        title={noticeModal?.title ?? ''}
        description={noticeModal?.description ?? ''}
        confirmLabel="확인"
        onConfirm={() => setNoticeModal(null)}
      />
    </div>
  )
}
