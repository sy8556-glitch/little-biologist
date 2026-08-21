import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import forestImage from '../../IMAGE/forest.png'
import pondImage from '../../IMAGE/pond.png'
import soilImage from '../../IMAGE/soil.png'
import streetImage from '../../IMAGE/street.png'
import fieldFlowerImage from '../../IMAGE/field_flower.png'
import fieldTreeImage from '../../IMAGE/field_tree.png'
import ZoneBannerOverlay from '../components/features/ZoneBannerOverlay'
import RanchCamera from '../components/common/RanchCamera'
import { getHabitatById, getSpeciesByHabitat } from '../data/insectSpecies'
import { apiUrl } from '../api/apiBase'

const HABITAT_SCENES = {
  forest: {
    id: 'forest',
    name: '숲',
    images: [forestImage],
    description: '나무 그늘 아래 숨은 곤충들을 가까이서 관찰할 수 있어요.',
    accent: 'from-emerald-950/90 via-emerald-900/35 to-ink-950/90',
  },
  pond: {
    id: 'pond',
    name: '연못·습지',
    images: [pondImage],
    description: '물가와 갈대 사이를 따라 이동하는 곤충들을 살펴볼 수 있어요.',
    accent: 'from-cyan-950/90 via-sky-900/35 to-ink-950/90',
  },
  soil: {
    id: 'soil',
    name: '흙 속',
    images: [soilImage],
    description: '땅 위와 흙 속에 숨어 지내는 곤충들을 발견할 수 있어요.',
    accent: 'from-amber-950/90 via-stone-900/35 to-ink-950/90',
  },
  'street-trees': {
    id: 'street-trees',
    name: '가로수',
    images: [streetImage],
    description: '가로수 주변을 오가는 곤충들을 도심 풍경 속에서 만나보세요.',
    accent: 'from-lime-950/90 via-green-900/35 to-ink-950/90',
  },
  grass: {
    id: 'grass',
    name: '풀밭',
    images: [fieldFlowerImage, fieldTreeImage],
    descriptions: [
      '꽃이 많은 풀밭에서는 꽃을 찾는 곤충들을 먼저 관찰할 수 있어요.',
      '나무가 섞인 풀밭에서는 가지와 줄기 주변 곤충들까지 이어서 볼 수 있어요.',
    ],
    accent: 'from-emerald-950/90 via-lime-900/35 to-ink-950/90',
  },
}

// RanchHabitat.jsx와 같은 배치 좌표를 그대로 쓴다 — 화면 구성(어디에 어떤 크기로 놓이는지)은
// 누구의 목장이든 동일해야 하고, 실제로 다른 건 "어떤 종이 채워지는가" 뿐이다.
const HABITAT_PLACEMENTS = {
  forest: [
    { x: 50, y: 55, size: 4.6, rotate: -4 },
    { x: 28, y: 62, size: 4.8, rotate: 10 },
    { x: 70, y: 58, size: 4.4, rotate: -12 },
    { x: 18, y: 78, size: 4.9, rotate: 14 },
    { x: 82, y: 74, size: 4.3, rotate: -8 },
    { x: 40, y: 82, size: 4.7, rotate: 8 },
    { x: 60, y: 88, size: 4.5, rotate: -12 },
  ],
  pond: [
    { x: 32, y: 52, size: 4.4, rotate: -8 },
    { x: 52, y: 28, size: 4.7, rotate: 12 },
    { x: 70, y: 52, size: 4.5, rotate: -10 },
  ],
  soil: [
    { x: 18, y: 32, size: 4.5, rotate: -8 },
    { x: 82, y: 30, size: 4.4, rotate: 9 },
    { x: 50, y: 52, size: 4.6, rotate: -12 },
  ],
  'street-trees': [
    { x: 28, y: 48, size: 4.3, rotate: -12 },
    { x: 52, y: 33, size: 4.7, rotate: 8 },
    { x: 76, y: 50, size: 4.4, rotate: -6 },
  ],
  'grass-0': [
    { x: 50, y: 40, size: 4.5, rotate: -4 },
    { x: 22, y: 30, size: 4.4, rotate: 10 },
    { x: 75, y: 32, size: 4.6, rotate: -10 },
    { x: 14, y: 55, size: 4.3, rotate: 8 },
    { x: 86, y: 52, size: 4.5, rotate: -8 },
    { x: 35, y: 60, size: 4.2, rotate: 12 },
    { x: 64, y: 62, size: 4.6, rotate: -9 },
    { x: 12, y: 82, size: 4.7, rotate: -12 },
    { x: 44, y: 85, size: 4.5, rotate: 8 },
    { x: 70, y: 84, size: 4.6, rotate: -7 },
    { x: 90, y: 78, size: 4.4, rotate: 11 },
  ],
  'grass-1': [
    { x: 50, y: 45, size: 4.4, rotate: -4 },
    { x: 24, y: 35, size: 4.3, rotate: 11 },
    { x: 74, y: 36, size: 4.5, rotate: -8 },
    { x: 15, y: 58, size: 4.4, rotate: 13 },
    { x: 85, y: 56, size: 4.6, rotate: -11 },
    { x: 38, y: 63, size: 4.2, rotate: 8 },
    { x: 62, y: 65, size: 4.5, rotate: -6 },
    { x: 16, y: 82, size: 4.7, rotate: -10 },
    { x: 46, y: 85, size: 4.5, rotate: 9 },
    { x: 73, y: 83, size: 4.6, rotate: -8 },
    { x: 90, y: 75, size: 4.3, rotate: 12 },
  ],
}

function getPlacementKey(habitatId, stage) {
  return habitatId === 'grass' ? `grass-${stage}` : habitatId
}

function getStageZoneName(scene, stage) {
  if (scene.id !== 'grass') return scene.name
  return stage === 0 ? '꽃밭' : '나무'
}

// 풀밭은 배경(stage)마다 등장하는 종이 갈린다 — RanchHabitat.jsx와 동일한 규칙.
const GRASS_ZONE_BY_STAGE = ['flower', 'tree']

const INSECT_SIZE_SCALE = 0.75

function InsectSpot({ species, placement, selected, onClick }) {
  const { x, y, size, rotate } = placement

  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
      <div style={{ transform: `rotate(${rotate}deg)` }}>
        <button
          type="button"
          onClick={onClick}
          className={`group relative flex flex-col items-center gap-1 rounded-full outline-none transition duration-200 ${
            selected ? 'z-20 scale-110' : 'z-10 hover:scale-105'
          }`}
          style={{ width: `${size * INSECT_SIZE_SCALE}rem` }}
          aria-label={`${species.name} 관찰`}
        >
          <span
            className="relative block aspect-square w-full transition duration-200"
            style={{
              filter: selected
                ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.45)) drop-shadow(0 0 14px rgba(255,255,255,0.85))'
                : 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
            }}
          >
            <img src={species.image} alt="" aria-hidden="true" className="h-full w-full object-contain" />
          </span>
          <span className="max-w-[7rem] rounded-full bg-black/40 px-2 py-1 text-[11px] font-semibold tracking-tight text-white/90 opacity-0 shadow-lg transition group-hover:opacity-100">
            {species.name}
          </span>
        </button>
      </div>
    </div>
  )
}

// friends.md: 친구 목장에서 대객체를 눌러 들어가는 읽기 전용 내부 화면 — RanchHabitat.jsx와
// 같은 배경/배치를 쓰되, 데이터는 내 RegisteredPhotosContext가 아니라 서버의
// /api/field-guide/:uid(친구의 등록 현황)에서 가져온다. 편집·튜토리얼·미션 반영은 없다.
export default function FriendRanchHabitat() {
  const { uid, habitatId } = useParams()
  const navigate = useNavigate()
  const [nickname, setNickname] = useState('')
  const [speciesList, setSpeciesList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const scene = HABITAT_SCENES[habitatId] ?? HABITAT_SCENES.forest
  const habitat = getHabitatById(scene.id)
  const zoneName = habitat?.name ?? scene.name
  const isSequence = scene.images.length > 1
  const [stage, setStage] = useState(0)
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null)
  const [isZoneBannerOpen, setIsZoneBannerOpen] = useState(false)
  const [bannerZoneName, setBannerZoneName] = useState(zoneName)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/uid 변경 시 1회 서버에서 불러오는 표준 패턴
    setIsLoading(true)
    fetch(apiUrl(`/api/field-guide/${encodeURIComponent(uid)}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        setNickname(data.nickname)
        setSpeciesList(data.species || [])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  // habitatId는 이 화면에서 다른 값으로 바뀌지 않는다(대객체 사이 이동은 항상 목장 개요로
  // 돌아갔다가 다시 들어오는 방식이라 매번 새로 마운트됨) — 그래서 stage/selectedSpeciesId/
  // entered/배너 이름은 초기값으로만 설정하고, 마운트 시 1회 재생되는 등장 애니메이션과
  // 배너 노출 타이밍만 이펙트로 다룬다.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => setIsZoneBannerOpen(true), 80)
    return () => window.clearTimeout(id)
  }, [])

  const currentImage = scene.images[stage] ?? scene.images[0]
  const currentDescription = scene.descriptions?.[stage] ?? scene.description
  const progressLabel = isSequence ? `${stage + 1} / ${scene.images.length}` : '1 / 1'
  const registeredSpecies = useMemo(
    () =>
      getSpeciesByHabitat(scene.id, speciesList)
        .filter((species) => species.registered)
        .filter((species) => scene.id !== 'grass' || species.grassZone === GRASS_ZONE_BY_STAGE[stage]),
    [scene.id, speciesList, stage],
  )
  const habitatStats = {
    registered: registeredSpecies.length,
    total: getSpeciesByHabitat(scene.id, speciesList).filter(
      (species) => scene.id !== 'grass' || species.grassZone === GRASS_ZONE_BY_STAGE[stage],
    ).length,
  }
  const placementKey = getPlacementKey(scene.id, stage)
  const placements = HABITAT_PLACEMENTS[placementKey] ?? []
  const selectedSpecies = registeredSpecies.find((species) => species.id === selectedSpeciesId) ?? null

  const moveStage = (nextStage) => {
    setStage(nextStage)
    setSelectedSpeciesId(null)
    setBannerZoneName(getStageZoneName(scene, nextStage))
    setIsZoneBannerOpen(false)
    window.setTimeout(() => setIsZoneBannerOpen(true), 20)
  }

  const topButtonClass =
    'rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20'

  const goBack = () => navigate(`/friends/ranch/${uid}`)
  const openFieldGuide = (speciesId = selectedSpecies?.id ?? null) => {
    navigate(`/friends/field-guide/${uid}`, {
      state: {
        habitatId: scene.id,
        habitatName: zoneName,
        selectedSpeciesId: speciesId,
      },
    })
  }

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink-950 text-sm text-white/70">불러오는 중...</div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-white">
      <ZoneBannerOverlay
        zoneName={bannerZoneName}
        isOpen={isZoneBannerOpen}
        onClose={() => setIsZoneBannerOpen(false)}
      />

      <div
        className={`absolute inset-0 origin-center transition-all duration-500 ease-out ${
          entered ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        }`}
      >
        <RanchCamera>
          <div className={`absolute inset-0 bg-gradient-to-b ${scene.accent}`} />
          <img
            key={currentImage}
            src={currentImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-95 transition-opacity duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/35 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_42%)]" />

          <div className="absolute inset-0">
            {registeredSpecies.map((species, index) => {
              const placement = placements[index % placements.length]
              if (!placement) return null
              return (
                <InsectSpot
                  key={species.id}
                  species={species}
                  placement={placement}
                  selected={selectedSpeciesId === species.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedSpeciesId(species.id)
                  }}
                />
              )
            })}
          </div>
        </RanchCamera>

        <div className="pointer-events-none relative z-10 flex min-h-screen flex-col">
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                goBack()
              }}
              className={topButtonClass}
            >
              {nickname ? `${nickname}님의 목장으로 돌아가기` : '목장으로 돌아가기'}
            </button>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => openFieldGuide()} className={topButtonClass}>
                친구 도감으로 이동
              </button>
              {isSequence && stage === 0 ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    moveStage(1)
                  }}
                  className={topButtonClass}
                >
                  나무 관찰하기
                </button>
              ) : null}
              {isSequence && stage === 1 ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    moveStage(0)
                  }}
                  className={topButtonClass}
                >
                  꽃밭으로 돌아가기
                </button>
              ) : null}
              <div className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-xs font-semibold tracking-wide text-white/90 backdrop-blur-sm">
                {zoneName} · {progressLabel}
              </div>
            </div>
          </div>

          <div className="relative flex flex-1 flex-col justify-end px-4 pb-6">
            <div
              className="pointer-events-auto max-h-[62vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/12 bg-black/35 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md"
              style={{ transform: 'scale(min(1, calc(100vh / 700px)))', transformOrigin: 'bottom left' }}
            >
              <div className="flex flex-col gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">Habitat view</p>
                  <h1 className="mt-1 text-lg font-bold">
                    {nickname ? `${nickname}님의 ${zoneName}` : zoneName}
                  </h1>
                  <p className="mt-1 text-xs leading-5 text-white/82">{currentDescription}</p>
                  <p className="mt-2 text-[11px] text-white/60">
                    등록된 곤충 {habitatStats.registered}/{habitatStats.total}종이 이 서식지에 연결되어 있어요.
                  </p>
                </div>

                <div className="flex flex-row gap-1.5">
                  <button
                    type="button"
                    onClick={() => selectedSpecies && openFieldGuide(selectedSpecies.id)}
                    disabled={!selectedSpecies}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    선택한 곤충 도감에서 보기
                  </button>
                </div>
              </div>

              <div className="mt-2 grid gap-2">
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
                  {selectedSpecies ? (
                    <div className="flex h-full flex-col justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">Selected</p>
                        <h2 className="mt-1 text-base font-bold text-white">{selectedSpecies.name}</h2>
                        <p className="mt-1 text-xs leading-5 text-white/72">
                          이 곤충은 {zoneName}에서 관찰할 수 있는 종이에요.
                        </p>
                      </div>
                      <div className="overflow-hidden rounded-2xl bg-black/20 p-2">
                        <img src={selectedSpecies.image} alt={selectedSpecies.name} className="h-16 w-full object-contain" />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">Observation</p>
                      <h2 className="mt-1 text-base font-bold text-white">곤충을 선택해 주세요</h2>
                      <p className="mt-1 text-xs leading-5 text-white/72">
                        서식지 위의 곤충을 누르면 관찰 카드를 볼 수 있어요.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
