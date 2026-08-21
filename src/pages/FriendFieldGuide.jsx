import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import FocusedLayout from '../components/common/FocusedLayout'
import InsectCard from '../components/common/InsectCard'
import EmptyState from '../components/common/EmptyState'
import FoodPyramid from '../components/common/FoodPyramid'
import { INSECT_CATEGORIES, getSpeciesCategory, getCategoryStats, getHabitatById } from '../data/insectSpecies'
import { getInsectFeatureSummary } from '../data/insectSummaries'

const RANK_OPTIONS = [
  { id: 'gold', label: '금', desc: '직접 찍은 사진', field: 'photoUrl', className: 'bg-rank-gold text-white' },
  { id: 'silver', label: '은', desc: '직접 그린 그림', field: 'sketchUrl', className: 'bg-rank-silver text-ink-900' },
  { id: 'bronze', label: '기본', desc: '기본 등록 이미지', field: 'defaultUrl', className: 'bg-rank-bronze text-white' },
]

const HABITAT_TAG_META = {
  forest: { icon: '🌲', label: '숲' },
  grass: { icon: '🌿', label: '풀밭' },
  soil: { icon: '🪵', label: '흙 속' },
  pond: { icon: '🏞️', label: '연못·습지' },
  'street-trees': { icon: '🌳', label: '가로수' },
}

function getBestRank(species) {
  if (!species?.registered) return null
  return RANK_OPTIONS.find((rank) => species.registeredRanks?.[rank.id])?.id ?? null
}

function getRankImage(species, rankId) {
  const rank = RANK_OPTIONS.find((option) => option.id === rankId)
  if (!species || !rank || !species.registeredRanks?.[rank.id]) return null
  return species[rank.field] ?? null
}

// friends.md: 친구 목장에서 "친구 도감 구경하기"로 들어오는 읽기 전용 화면 — FieldGuide.jsx와
// 같은 레이아웃/등급 배지를 쓰되, 데이터는 내 RegisteredPhotosContext가 아니라 서버의
// /api/field-guide/:uid(친구 사진·그림 dataURL 포함)에서 가져온다. 등록 액션은 없다.
export default function FriendFieldGuide() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [nickname, setNickname] = useState('')
  const [speciesList, setSpeciesList] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const [activeCategory, setActiveCategory] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [activeRank, setActiveRank] = useState(null)
  const [isPyramidOpen, setIsPyramidOpen] = useState(false)
  // 종별로 마지막에 직접 고른 등급(금/은/기본)을 기억해뒀다가, 다른 곤충을 봤다가 돌아와도
  // 자동으로 "가장 높은 등급"으로 되돌리지 않고 그 선택을 그대로 유지한다.
  const [chosenRanks, setChosenRanks] = useState({})

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/uid 변경 시 1회 서버에서 불러오는 표준 패턴
    setIsLoading(true)
    fetch(`/api/field-guide/${encodeURIComponent(uid)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setNickname(data.nickname)
        setSpeciesList(data.species || [])
        // RanchHabitat.jsx의 "선택한 곤충 도감에서 보기"와 동일하게, navigate state로 넘어온
        // selectedSpeciesId를 최우선으로 연다 — 없으면 기존처럼 첫 번째로 등록된 종을 연다.
        const requestedSpeciesId = location.state?.selectedSpeciesId
        const requested = requestedSpeciesId != null ? (data.species || []).find((s) => s.id === requestedSpeciesId) : null
        const initialSelected = requested ?? (data.species || []).find((s) => s.registered) ?? null
        setSelected(initialSelected)
        setActiveRank(getBestRank(initialSelected) ?? 'bronze')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const visibleList = useMemo(() => {
    const trimmedQuery = query.trim()
    if (trimmedQuery) return speciesList.filter((s) => s.name.includes(trimmedQuery))
    if (!activeCategory) return speciesList
    return speciesList.filter((s) => getSpeciesCategory(s.id) === activeCategory)
  }, [speciesList, activeCategory, query])

  const registeredCount = speciesList.filter((s) => s.registered).length
  const registeredPercent = speciesList.length ? Math.round((registeredCount / speciesList.length) * 100) : 0
  const selectedImage = getRankImage(selected, activeRank)
  const selectedDisplayRank = selected?.registeredRanks?.[activeRank] ? activeRank : null
  const selectedSummary = selected ? getInsectFeatureSummary(selected.name) : null
  const selectedHabitats = (selected?.habitats ?? [selected?.habitatId]).filter(Boolean)

  const handleSelectSpecies = (species) => {
    setSelected(species)
    setActiveRank(chosenRanks[species.id] ?? getBestRank(species) ?? 'bronze')
  }

  if (isLoading) {
    return (
      <FocusedLayout title="도감" iconSrc="/ui/guide.png" backTo={`/friends/ranch/${uid}`} backLabel="목장으로 돌아가기">
        <p className="py-20 text-center text-sm text-ink-700/60">불러오는 중...</p>
      </FocusedLayout>
    )
  }

  return (
    <FocusedLayout
      title={`${nickname || '친구'}님의 도감`}
      iconSrc="/ui/guide.png"
      backTo={`/friends/ranch/${uid}`}
      backLabel="목장으로 돌아가기"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-ivory-200 pb-4">
        <div className="field-guide-progress-actions">
          <div className="w-52 rounded-xl border border-ivory-200 bg-white px-3 py-2 shadow-card">
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-ink-700">
              <span>도감 채우기</span>
              <span className="tabular-nums">{registeredPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ivory-200">
              <div className="h-full rounded-full bg-leaf-500 transition-all" style={{ width: `${registeredPercent}%` }} />
            </div>
            <p className="mt-1 text-center text-xs font-bold text-leaf-700 tabular-nums">
              {registeredCount}/{speciesList.length}종
            </p>
          </div>

        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">

          <label className="relative w-48 shrink-0">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-700/45" aria-hidden="true">
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="종 이름 검색"
              className="w-full rounded-full border border-ivory-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-leaf-500"
            />
          </label>

          <button
            type="button"
            onClick={() => setIsPyramidOpen(true)}
            className="field-guide-pyramid-button"
            aria-label="먹이사슬 피라미드 보기"
          >
            <img src="/ui/food-pyramid/title-cropped.png" alt="먹이사슬 피라미드 보기" />
          </button>
        </div>
      </div>

      {!query && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              !activeCategory ? 'bg-leaf-500 text-white' : 'bg-white text-ink-900 shadow-card'
            }`}
          >
            전체
            <span className={!activeCategory ? 'ml-1 text-white/80' : 'ml-1 text-ink-700/50'}>{speciesList.length}</span>
          </button>
          {INSECT_CATEGORIES.map((category) => {
            const stats = getCategoryStats(category.id, speciesList)
            const isActive = category.id === activeCategory
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(isActive ? null : category.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                  isActive ? 'bg-leaf-500 text-white' : 'bg-white text-ink-900 shadow-card'
                }`}
              >
                {category.name}
                <span className={isActive ? 'ml-1 text-white/80' : 'ml-1 text-ink-700/50'}>{stats.total}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="field-guide-layout grid h-[calc(100vh-250px)] min-h-[520px] gap-5 overflow-hidden">
        <div className="min-h-0 overflow-y-auto pr-1">
          {visibleList.length === 0 ? (
            query ? (
              <EmptyState title="검색 결과가 없어요" description="다른 이름으로 다시 검색해 보세요." />
            ) : (
              <EmptyState title="아직 분류가 채워지지 않았어요" description="이 분류에 속한 곤충은 곧 채워질 예정이에요." />
            )
          ) : (
            <div className="field-guide-card-grid grid grid-cols-2 gap-3 pb-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleList.map((species) => {
                const isOpenInDetail = selected?.id === species.id
                const rememberedRank = chosenRanks[species.id] ?? getBestRank(species)
                const rememberedImage = getRankImage(species, rememberedRank) ?? species.defaultUrl ?? species.image
                return (
                  <InsectCard
                    key={species.id}
                    name={species.name}
                    image={isOpenInDetail ? selectedImage ?? species.defaultUrl ?? species.image : rememberedImage}
                    rank={isOpenInDetail ? selectedDisplayRank : rememberedRank}
                    registered={species.registered}
                    onClick={() => handleSelectSpecies(species)}
                  />
                )
              })}
            </div>
          )}
        </div>

        <aside className="field-guide-detail min-h-0">
          <div className="sticky top-0 max-h-full overflow-y-auto rounded-xl bg-white p-4 shadow-card">
            {!selected ? (
              <EmptyState icon="🔍" title="카드를 선택해 보세요" description="곤충 카드를 누르면 상세 정보가 보여요." />
            ) : (
              <div>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-ink-900">{selected.registered ? selected.name : '미수집 곤충'}</h2>
                    <p className="mt-0.5 text-xs font-semibold text-ink-700/55">
                      {selected.registered ? '대표 이미지 등급을 선택해 보세요.' : `아직 ${nickname || '친구'}가 등록하지 않았어요.`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {RANK_OPTIONS.map((rank) => {
                      const isAvailable = Boolean(selected.registeredRanks?.[rank.id])
                      const isActive = activeRank === rank.id
                      return (
                        <button
                          key={rank.id}
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => {
                            if (!isAvailable) return
                            setActiveRank(rank.id)
                            setChosenRanks((prev) => ({ ...prev, [selected.id]: rank.id }))
                          }}
                          title={isAvailable ? rank.desc : `${rank.label} 등급 미등록`}
                          className={`h-8 min-w-8 rounded-full px-2 text-xs font-bold transition ${
                            isAvailable ? rank.className : 'bg-ivory-100 text-ink-700/35'
                          } ${isActive ? 'ring-2 ring-ink-900/20 ring-offset-2' : ''} ${!isAvailable ? 'cursor-not-allowed' : ''}`}
                        >
                          {rank.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="relative mb-4 overflow-hidden rounded-xl bg-ivory-50">
                  {selectedImage ? (
                    <img src={selectedImage} alt={selected.name} className="h-56 w-full object-contain p-3" />
                  ) : (
                    <>
                      <img
                        src={selected.defaultUrl ?? selected.image}
                        alt=""
                        aria-hidden="true"
                        className="h-56 w-full object-contain p-3 grayscale brightness-0 opacity-35"
                      />
                      <div className="absolute bottom-3 left-0 right-0 text-center">
                        <p className="text-sm font-semibold text-ink-700/55">아직 등록되지 않은 등급이에요.</p>
                      </div>
                    </>
                  )}
                </div>

                {selected.registered && (
                  <div>
                    <h3 className="text-sm font-bold text-ink-900">곤충 특징 요약</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-700/80">
                      {selectedSummary ?? '이 곤충의 특징 요약은 곧 채워질 예정이에요.'}
                    </p>
                  </div>
                )}

                {selected.registered && (
                  <div className="mt-5 border-t border-ivory-200 pt-4">
                    <h3 className="text-sm font-bold text-ink-900">서식지 정보</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedHabitats.map((habitatId) => {
                        const habitat = getHabitatById(habitatId)
                        const meta = HABITAT_TAG_META[habitatId] ?? { icon: '📍', label: habitat?.name ?? habitatId }
                        return (
                          <span
                            key={habitatId}
                            className="inline-flex items-center gap-1 rounded-full bg-leaf-50 px-3 py-1.5 text-xs font-bold text-leaf-700 ring-1 ring-leaf-200"
                          >
                            <span aria-hidden="true">{meta.icon}</span>
                            {meta.label}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {selected.registered && (
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/ai-companion?insectId=${selected.id}`)}
                      className="rounded-full bg-ivory-100 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ivory-200"
                    >
                      {`${selected.name}에 대해 알아보기`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {isPyramidOpen &&
        createPortal(
          // body에 직접 portal로 붙여야 한다 — FocusedLayout의 backdrop-blur 조상 안에서 렌더링되면
          // fixed의 기준이 뷰포트가 아니라 그 조상의 콘텐츠 박스 전체가 되어, X 버튼이 잘리는 문제가 생긴다.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="곤충 도감 80종 먹이사슬 피라미드"
            className="fixed inset-0 z-50 grid place-items-center bg-ink-900/55 p-3"
            onClick={() => setIsPyramidOpen(false)}
          >
            <div onClick={(event) => event.stopPropagation()}>
              <FoodPyramid onClose={() => setIsPyramidOpen(false)} speciesList={speciesList} />
            </div>
          </div>,
          document.body,
        )}
    </FocusedLayout>
  )
}
