import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusedLayout from '../components/common/FocusedLayout'
import { useBag } from '../context/BagContext'
import { useTutorial } from '../context/TutorialContext'
import { useQuests } from '../context/QuestsContext'
import { getOwnedRepresentativeCharacters } from '../data/representativeCharacter'

// bag.md: 카테고리는 인테리어/대표 캐릭터. 수량과 사용 가능 상태 표시.
const CATEGORIES = [
  { id: 'interior', label: '인테리어' },
  { id: 'egg', label: '대표 캐릭터' },
]
// 대표 캐릭터 탭은 상점에서 사고파는 아이템이 아니라 계정에 배정된 알/유충 하나를 보여주는
// 자리라, 인테리어 탭과 똑같이 칸 형태로 보여주되 총 79칸 중 실제로 채워지는 건 항상 1칸뿐이다.
const REPRESENTATIVE_SLOT_COUNT = 79

export default function Bag() {
  const navigate = useNavigate()
  const { bagItems, bagCapacity, placeItem, retrieveItem } = useBag()
  const { step } = useTutorial()
  const { representativeCharacter, adultHistory, profileCharacterId, selectProfileCharacter } = useQuests()
  const [cat, setCat] = useState('interior')
  const isInterior = cat === 'interior'
  const isRepresentative = cat === 'egg'
  const interiorItems = bagItems.filter((i) => i.category === 'interior')
  // 배치 칸은 목장에 놓인 개수가 아니라 가방에 보유한 인테리어 "종류" 수 기준이다. 기본 30개이며
  // 상점의 "가방 확장권"을 사면 늘어난다(BagContext.jsx의 bagCapacity).
  const slotsFull = interiorItems.length >= bagCapacity
  // 인테리어 탭은 보유 아이템 카드 뒤에 빈 칸을 채워 항상 bagCapacity칸을 보여준다.
  const interiorSlots = [
    ...interiorItems,
    ...Array.from({ length: Math.max(0, bagCapacity - interiorItems.length) }, () => null),
  ]
  const representativeItems = getOwnedRepresentativeCharacters(representativeCharacter, adultHistory)
  // 선택 안 했으면(null) 현재 자라고 있는 캐릭터가 기본으로 선택된 것으로 취급한다.
  const selectedCharacterId = profileCharacterId ?? 'representative-character-current'
  const representativeSlots = [
    ...representativeItems,
    ...Array.from({ length: Math.max(0, REPRESENTATIVE_SLOT_COUNT - representativeItems.length) }, () => null),
  ]
  const displayList = isInterior ? interiorSlots : representativeSlots

  return (
    <FocusedLayout title="가방" iconSrc="/ui/bag.png">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                cat === c.id ? 'bg-leaf-500 text-white' : 'bg-white text-ink-900 shadow-card'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {isInterior && (
          <p className="text-sm text-ink-700/70 tabular-nums">
            인테리어 배치 칸 {interiorItems.length}/{bagCapacity}
          </p>
        )}
        {isRepresentative && (
          <p className="text-sm text-ink-700/70 tabular-nums">
            대표 캐릭터 {representativeItems.length}/{REPRESENTATIVE_SLOT_COUNT}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {displayList.map((item, i) =>
            item ? (
              <div
                key={item.id}
                className="flex h-56 flex-col items-center justify-between gap-2 rounded-xl bg-white p-4 shadow-card"
              >
                <div className="grid h-24 w-24 place-items-center rounded-full bg-leaf-50 text-xl" aria-hidden="true">
                  {item.image ? (
                    <img src={item.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    '🪑'
                  )}
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-semibold text-ink-900">{item.name}</p>
                  {item.category !== 'egg' && (
                    <p className="text-xs text-ink-700/70">보유 {item.qty}개 · 배치 {item.placed}개</p>
                  )}
                </div>
                {item.category === 'interior' && (
                  <div className="flex w-full flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const instanceId = placeItem(item.id)
                        if (instanceId) navigate('/ranch', { state: { editPlacementId: instanceId } })
                      }}
                      disabled={item.qty - item.placed <= 0 || slotsFull}
                      title={slotsFull ? `인테리어 배치 칸은 최대 ${bagCapacity}개예요.` : undefined}
                      className="relative w-full rounded-full bg-leaf-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-leaf-600 disabled:bg-ivory-200 disabled:text-ink-700/50"
                    >
                      {step?.id === 'bag' && item.id === interiorItems[0]?.id && (
                        <span className="pointer-events-none absolute -top-16 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1 whitespace-nowrap">
                          <span className="text-4xl drop-shadow-md animate-bounce" aria-hidden="true">👇</span>
                          <span className="rounded-full bg-ink-900/85 px-2.5 py-1 text-[10px] font-bold text-white shadow-card">여기를 눌러보세요</span>
                        </span>
                      )}
                      목장에 배치
                    </button>
                    {item.placed > 0 && (
                      <button
                        type="button"
                        onClick={() => retrieveItem(item.id)}
                        className="w-full rounded-full bg-ivory-100 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-ivory-200"
                      >
                        가방에 넣기
                      </button>
                    )}
                  </div>
                )}
                {item.category === 'egg' && (
                  <div className="flex w-full flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => selectProfileCharacter(item.id)}
                      disabled={item.id === selectedCharacterId}
                      className="w-full rounded-full bg-leaf-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-leaf-600 disabled:bg-ivory-200 disabled:text-ink-700/50"
                    >
                      {item.id === selectedCharacterId ? '선택됨' : '선택하기'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                key={`empty-${i}`}
                className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl bg-white p-4 shadow-card"
              >
                <div
                  className="grid h-24 w-24 place-items-center rounded-full bg-ivory-100 text-xl text-ink-700/20"
                  aria-hidden="true"
                >
                  🪑
                </div>
                <p className="text-sm font-semibold text-ink-700/40">빈 칸</p>
              </div>
            )
          )}
      </div>
    </FocusedLayout>
  )
}
