import { useEffect, useRef, useState } from 'react'
import FocusedLayout from '../components/common/FocusedLayout'
import CharacterDialogue from '../components/common/CharacterDialogue'
import EmptyState from '../components/common/EmptyState'
import ResultModal from '../components/common/ResultModal'
import { useQuests } from '../context/QuestsContext'
import { useCurrency } from '../context/CurrencyContext'
import { playSfx } from '../utils/sound'
import { SFX } from '../utils/sfx'

// 보상 획득 시 화면 위쪽 성장 포인트 게이지(Ranch.jsx가 data-reward-target="growth-points"로
// 표시해둔 자리)를 향해 반짝임이 날아가는 연출. 그 요소를 찾을 수 없는 화면(예: 여기)에서는
// 화면 위쪽 기본 위치로 대신 날아가게 한다.
function MissionRewardBurst({ onComplete }) {
  const [target, setTarget] = useState(null)

  useEffect(() => {
    const element = document.querySelector('[data-reward-target="growth-points"]')
    if (element) {
      const rect = element.getBoundingClientRect()
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 보상 타겟의 실제 DOM 위치를 읽은 뒤 효과의 시작점을 계산한다.
      setTarget({ x: rect.left + rect.width / 2 - window.innerWidth / 2, y: rect.top + rect.height / 2 - window.innerHeight / 2 })
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 헤더가 없는 환경에서도 효과가 보이도록 기본 위치를 사용한다.
      setTarget({ x: 0, y: -window.innerHeight / 2 + 50 })
    }
    const timer = window.setTimeout(onComplete, 1000)
    return () => window.clearTimeout(timer)
  }, [onComplete])

  if (!target) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => (
        <span
          key={index}
          className="quiz-reward-spark"
          style={{
            '--tx': `${target.x + ((index * 29) % 50) - 25}px`,
            '--ty': `${target.y + ((index * 17) % 36) - 18}px`,
            '--delay': `${(index % 6) * 45}ms`,
          }}
        >
          {index % 3 === 0 ? '✦' : '✧'}
        </span>
      ))}
    </div>
  )
}

// screen-requirements.md §6: 중앙에 일일·주간·업적·칭호·이벤트 탭을 둔다.
// 오른쪽 주간 미션 박스, 연속 달성, 퀘스트 포인트는 제거한다 (AGENTS.md §11).
const TABS = [
  { id: 'daily', label: '일일' },
  { id: 'weekly', label: '주간' },
  { id: 'achievement', label: '업적' },
  { id: 'title', label: '칭호' },
  { id: 'event', label: '이벤트' },
]
const MISSIONS_PER_PAGE = 4

export default function Quests() {
  const [tab, setTab] = useState('daily')
  const [page, setPage] = useState(0)
  const { quests, claim, featuredCharacterImage, missionGrowthReward } = useQuests()
  const { holdStageUp, releaseStageUp } = useCurrency()
  const [claimedReward, setClaimedReward] = useState(null)
  const [showRewardBurst, setShowRewardBurst] = useState(false)
  // holdStageUp()을 부른 채로 확인 팝업을 안 닫고 다른 화면으로 나가버리면 부화/진화 연출이
  // 영영 안 뜨게 되므로, 언마운트 시 안전하게 풀어준다.
  const isHoldingStageUpRef = useRef(false)

  useEffect(() => {
    return () => {
      if (isHoldingStageUpRef.current) releaseStageUp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 언마운트 시 한 번만 정리한다.
  }, [])

  const list = quests[tab]
  const totalPages = Math.max(1, Math.ceil(list.length / MISSIONS_PER_PAGE))
  const visibleMissions = list.slice(page * MISSIONS_PER_PAGE, (page + 1) * MISSIONS_PER_PAGE)

  function changeTab(nextTab) {
    setTab(nextTab)
    setPage(0)
  }

  function handleClaim(id) {
    const quest = list.find((item) => item.id === id)
    if (!quest || !quest.done) return
    if (quest.claimed) {
      setShowRewardBurst(false)
      setClaimedReward({ ...quest, alreadyClaimed: true })
      return
    }
    // 보상 확인 팝업이 떠 있는 동안엔 부화/진화 연출이 그 위를 덮지 않게 잡아뒀다가,
    // 팝업을 닫을 때(ResultModal의 onConfirm)에야 풀어준다.
    holdStageUp()
    isHoldingStageUpRef.current = true
    claim(tab, id)
    playSfx(tab === 'title' ? SFX.titleReward : SFX.missionReward)
    setClaimedReward({ ...quest, alreadyClaimed: false })
    setShowRewardBurst(true)
  }

  return (
    <FocusedLayout title="미션" iconSrc="/ui/mission.png">
      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="mb-4 flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => changeTab(t.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  tab === t.id ? 'bg-leaf-500 text-white' : 'bg-white text-ink-900 shadow-card'
                }`}
              >
                {t.label} 미션
              </button>
            ))}
          </div>

          {list.length === 0 ? (
            <EmptyState title="진행 중인 미션이 없어요" description="다른 탭을 확인해보세요." />
          ) : (
            <ul className="flex flex-col gap-3">
              {visibleMissions.map((q) => (
                <li key={q.id} className="rounded-xl bg-white p-4 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-ink-900">{q.title}</p>
                      <p className="text-sm text-ink-700/70">{q.desc}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!q.done}
                      onClick={() => handleClaim(q.id)}
                      data-click-sfx="none"
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${
                        q.claimed
                          ? 'bg-leaf-50 text-leaf-600'
                          : 'bg-leaf-500 text-white hover:bg-leaf-600 disabled:bg-ivory-200 disabled:text-ink-700/50'
                      }`}
                    >
                      {q.claimed ? '✓ 수령 완료' : '보상 받기'}
                    </button>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ivory-200">
                    <div
                      className="h-full bg-leaf-500"
                      style={{ width: `${Math.min(100, (q.progress / q.total) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-700/70">
                    <span>{q.progress}/{q.total}</span>
                    <span>{q.titleReward ? '칭호' : q.badgeName ? '배지' : `나뭇잎 ${q.rewardLeaf}`}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {list.length > MISSIONS_PER_PAGE && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-card disabled:opacity-40"
              >
                ← 이전
              </button>
              <span className="text-sm font-semibold text-ink-700/70">{page + 1} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page === totalPages - 1}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-card disabled:opacity-40"
              >
                다음 →
              </button>
            </div>
          )}
        </div>

        <aside>
          <CharacterDialogue
            speakerImage={featuredCharacterImage}
            speakerAlt="대표 캐릭터"
          >
            <p className="font-semibold">오늘도 힘내봐요!</p>
            <p className="mt-1 text-ink-700/80">미션을 완료하면 저도 함께 성장해요.</p>
          </CharacterDialogue>
        </aside>
      </div>

      <ResultModal
        open={Boolean(claimedReward)}
        imageSrc="/ui/mission-success-check.svg"
        title={
          claimedReward?.alreadyClaimed
            ? '이미 수령한 미션이에요'
            : claimedReward?.titleReward
              ? '칭호를 획득했어요!'
              : claimedReward?.badgeName
                ? '배지를 획득했어요!'
                : '보상을 받았어요!'
        }
        description={
          claimedReward?.alreadyClaimed
            ? '이 미션의 보상은 이미 계정에 지급되었어요.'
            : claimedReward?.titleReward
              ? `나뭇잎 ${claimedReward.rewardLeaf}개와 알 성장 포인트 ${missionGrowthReward}, "${claimedReward.title}" 칭호를 획득했어요.`
              : claimedReward?.badgeName
                ? `${claimedReward.badgeName}와 알 성장 포인트 ${missionGrowthReward}을 획득했어요.`
                : claimedReward
                  ? `나뭇잎 ${claimedReward.rewardLeaf}개와 알 성장 포인트 ${missionGrowthReward}을 획득했어요.`
                  : ''
        }
        onConfirm={() => {
          if (claimedReward && !claimedReward.alreadyClaimed) {
            releaseStageUp()
            isHoldingStageUpRef.current = false
          }
          setClaimedReward(null)
        }}
      />
      {showRewardBurst && <MissionRewardBurst onComplete={() => setShowRewardBurst(false)} />}
    </FocusedLayout>
  )
}
