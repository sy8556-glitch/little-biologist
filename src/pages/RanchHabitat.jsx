import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'

import forestImage from '../../IMAGE/forest.png'
import pondImage from '../../IMAGE/pond.png'
import soilImage from '../../IMAGE/soil.png'
import streetImage from '../../IMAGE/street.png'
import fieldFlowerImage from '../../IMAGE/field_flower.png'
import fieldTreeImage from '../../IMAGE/field_tree.png'
import ZoneBannerOverlay from '../components/features/ZoneBannerOverlay'
import RanchCamera from '../components/common/RanchCamera'
import { getHabitatById, getSpeciesByHabitat, getInsectSpecies, DEMO_ACCOUNT_USERNAME } from '../data/insectSpecies'
import { useTutorial } from '../context/TutorialContext'
import { useRegisteredPhotos } from '../context/RegisteredPhotosContext'
import { useAuth } from '../router/AuthContext'
import { reportMissionEvent } from '../utils/missionEvents'
import { getRanchHabitatSoundSrc, getGrassStageSoundSrc } from '../utils/habitatSound'
import { useSceneBackgroundMusic } from '../components/common/BackgroundMusicController'

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

// 각 서식지 배경 그림(IMAGE/*.png)을 실제로 보고, 빈 하늘·나무 우듬지·바위 뭉치처럼 곤충이
// 어색하게 떠 보이는 자리를 피해서 다시 잡은 좌표다 — 숲/가로수는 그늘진 길·둥치 주변, 연못은
// 수련이 떠 있는 물 위, 흙 속은 그림에 뚫린 네 개의 굴(위 2개+아래 2개) 전체를 골고루 쓰도록,
// 풀밭 두 배경은 꽃/트인 잔디를 번갈아 쓰도록 배치했다.
const HABITAT_PLACEMENTS = {
  // 첫 번째 자리(index 0)는 튜토리얼 'insect' 단계에서 포인터·클릭 대상으로 쓰인다
  // (RanchHabitat 컴포넌트의 registeredSpecies[0] 참고) — 화면 좌상단에 뜨는 튜토리얼
  // 대사창과 겹치지 않는 자리여야 한다.
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

// 탐험(사진/그림)이나 목장 랜덤곤충 이펙트로 얻은 등록 상태(photos/sketches/bronzeUnlocks)까지
// 반영해서, 도감에 등록된 종만 대객체 안에 보이게 한다 — 정적 데이터의 registered만 보면
// 새로 등록한 곤충이 목장에 나타나지 않는다.
// 풀밭은 배경이 꽃밭(stage 0)/나무(stage 1) 두 종류라, 곤충도 종별로 어울리는 배경에서만
// 나타나게 grassZone(flower/tree)으로 한 번 더 걸러낸다 — 다른 서식지는 배경이 하나뿐이라 무관.
const GRASS_ZONE_BY_STAGE = ['flower', 'tree']

function getHydratedSpecies(habitatId, speciesList, { photos, sketches, bronzeUnlocks }, stage = 0) {
  return getSpeciesByHabitat(habitatId, speciesList)
    .filter((species) => species.registered || Boolean(photos[species.id]) || Boolean(sketches[species.id]) || Boolean(bronzeUnlocks[species.id]))
    .filter((species) => habitatId !== 'grass' || species.grassZone === GRASS_ZONE_BY_STAGE[stage])
}

function getStageZoneName(scene, stage) {
  if (scene.id !== 'grass') return scene.name
  return stage === 0 ? '꽃밭' : '나무'
}

// 서식지 위 곤충 아이콘 크기 배율 — HABITAT_PLACEMENTS의 size(rem) 값에 곱해서 쓴다.
const INSECT_SIZE_SCALE = 0.75

function InsectSpot({ species, placement, selected, isEditing, onClick, onPointerDown, showTutorialPointer }) {
  const { x, y, size, rotate } = placement

  return (
    // 이 div의 transform이 새 stacking context를 만들어서, 두 단계 아래 버튼에만 z-[110]을 줘도
    // 이 wrapper 자체는 여전히 z-index:auto로 취급돼 튜토리얼 오버레이(z-[100])에 가려진다 —
    // wrapper에도 같이 z-index를 줘야 실제로 위로 올라온다.
    <div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', ...(showTutorialPointer ? { zIndex: 110 } : {}) }}
    >
      <div style={{ transform: `rotate(${rotate}deg)` }}>
        <button
          type="button"
          onClick={onClick}
          onPointerDown={onPointerDown}
          className={`group relative pointer-events-auto flex flex-col items-center gap-1 rounded-full outline-none transition duration-200 ${
            selected ? 'z-20 scale-110' : 'z-10 hover:scale-105'
          } ${showTutorialPointer ? 'z-[110]' : ''} ${isEditing ? 'cursor-grab touch-none active:cursor-grabbing' : ''}`}
          style={{ width: `${size * INSECT_SIZE_SCALE}rem` }}
          aria-label={`${species.name} 관찰`}
        >
          {showTutorialPointer && (
            <span className="tutorial-target-guide pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
              <span className="tutorial-target-ring tutorial-target-ring--small" aria-hidden="true" />
              <span className="tutorial-target-arrow" aria-hidden="true">👇</span>
              <span className="tutorial-target-label">여기를 눌러보세요</span>
            </span>
          )}
          <span
            className={`relative block aspect-square w-full transition duration-200 ${
              isEditing ? 'rounded-full outline outline-2 outline-dashed outline-white/70' : ''
            }`}
            style={{
              filter: selected
                ? 'drop-shadow(0 4px 10px rgba(0,0,0,0.45)) drop-shadow(0 0 14px rgba(255,255,255,0.85))'
                : 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
            }}
          >
            <img
              src={species.image}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="max-w-[7rem] rounded-full bg-black/40 px-2 py-1 text-[11px] font-semibold tracking-tight text-white/90 opacity-0 shadow-lg transition group-hover:opacity-100">
            {species.name}
          </span>
        </button>
      </div>
    </div>
  )
}

const INSECT_POSITIONS_KEY = 'little-biologist-ranch-habitat-insect-positions'

function loadInsectPositionOverrides() {
  try {
    return JSON.parse(localStorage.getItem(INSECT_POSITIONS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function RanchHabitat() {
  const { habitatId } = useParams()
  const navigate = useNavigate()
  const { step, advance, targetSpeciesId } = useTutorial()
  const { user } = useAuth()
  const isDemoAccount = user?.username === DEMO_ACCOUNT_USERNAME
  const { photos, sketches, bronzeUnlocks } = useRegisteredPhotos()
  const scene = HABITAT_SCENES[habitatId] ?? HABITAT_SCENES.forest
  const habitat = getHabitatById(scene.id)
  const zoneName = habitat?.name ?? scene.name
  const isSequence = scene.images.length > 1
  const [stage, setStage] = useState(0)
  // 서식지에 있는 동안 그 서식지 전용 효과음을 튼다 — 풀밭은 꽃밭/나무 단계에 따라 다른
  // 트랙으로 끊김 없이 전환된다(useSceneBackgroundMusic이 src 변경을 감지해서 처리). 상점과 달리
  // 이 효과음은 공용 목장 배경음악을 대체하지 않고 그 위에 같이 겹쳐서 들려준다
  // (suppressGlobalMusic: false). 다만 공용 배경음악이 그대로 크면 서식지 효과음이 묻히므로,
  // 여기 있는 동안만 공용 배경음악을 줄이고(duckGlobalMusic) 효과음 자체 볼륨은 키운다.
  const habitatMusicSrc = scene.id === 'grass' ? getGrassStageSoundSrc(stage) : getRanchHabitatSoundSrc(scene.id)
  useSceneBackgroundMusic(habitatMusicSrc, { suppressGlobalMusic: false, duckGlobalMusic: 0.35, volume: 0.55 })
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  // 정보 패널이 기본으로 열려 있어서(화면 하단을 크게 덮음) 튜토리얼이 눌러야 할 곤충을 그대로
  // 가려버리는 경우가 있었다 — '곤충을 관찰해요' 단계에 들어서면 자동으로 접어준다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 튜토리얼 단계가 바뀌는 순간에만 패널을 접는다.
    if (step?.id === 'insect') setIsPanelOpen(false)
  }, [step?.id])
  const [isZoneBannerOpen, setIsZoneBannerOpen] = useState(false)
  const [bannerZoneName, setBannerZoneName] = useState(zoneName)
  const [positionOverrides, setPositionOverrides] = useState(loadInsectPositionOverrides)
  const [entered, setEntered] = useState(false)
  const layerRef = useRef(null)
  const draggingRef = useRef(null)
  const stageToggleButtonRef = useRef(null)
  const [stageToggleRect, setStageToggleRect] = useState(null)

  useEffect(() => {
    setStage(0)
    setSelectedSpeciesId(null)
    setIsEditing(false)
    draggingRef.current = null

    // 대객체 입장 시 확대되며 나타나는 전환 효과. 초기 프레임을 축소 상태로 렌더한 뒤
    // 다음 프레임에 확대 상태로 바꿔야 브라우저가 전환을 실제로 애니메이션한다.
    setEntered(false)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    return () => cancelAnimationFrame(id)
  }, [scene.id])

  // 대객체 입장 시 존 이름을 알려주는 배너 효과 (파티클 + 확대되는 이름).
  useEffect(() => {
    setBannerZoneName(zoneName)
    setIsZoneBannerOpen(false)
    const id = window.setTimeout(() => setIsZoneBannerOpen(true), 80)
    return () => window.clearTimeout(id)
  }, [scene.id, zoneName])

  const currentImage = scene.images[stage] ?? scene.images[0]
  const currentDescription = scene.descriptions?.[stage] ?? scene.description
  const progressLabel = isSequence ? `${stage + 1} / ${scene.images.length}` : '1 / 1'
  // getHabitatStats에 정적 종 목록만 넘기면(하이드레이션 전) 실제 등록 상태가 아니라 항상
  // 고정된 registered 플래그만 세어서, 새로 등록해도 이 서식지의 진행도 표시가 갱신되지 않는다.
  // 풀밭은 배경(stage)마다 등장하는 종이 갈리니, 전체 종수가 아니라 현재 배경에 해당하는
  // 종수만 분모로 써야 "등록된 곤충 X/Y종" 표시가 그 배경 기준으로 맞게 나온다.
  const habitatSpeciesTotal = getSpeciesByHabitat(scene.id, getInsectSpecies(isDemoAccount)).filter(
    (species) => scene.id !== 'grass' || species.grassZone === GRASS_ZONE_BY_STAGE[stage],
  ).length
  const registeredSpecies = useMemo(
    () => getHydratedSpecies(scene.id, getInsectSpecies(isDemoAccount), { photos, sketches, bronzeUnlocks }, stage),
    [scene.id, isDemoAccount, photos, sketches, bronzeUnlocks, stage],
  )
  const habitatStats = { registered: registeredSpecies.length, total: habitatSpeciesTotal }
  const placementKey = getPlacementKey(scene.id, stage)
  const placements = HABITAT_PLACEMENTS[placementKey] ?? []
  const selectedSpecies = registeredSpecies.find((species) => species.id === selectedSpeciesId) ?? null

  // 풀밭은 꽃밭(stage 0)/나무(stage 1)에 따라 보이는 곤충이 갈리는데, 튜토리얼이 눌러야 할
  // 곤충이 지금 안 보이는 쪽(예: stage 0인데 나무 곤충)에 있으면 화면에 표시조차 안 돼서
  // 아무것도 못 누른다 — 이때는 대신 반대쪽 배경으로 넘어가는 버튼을 눌러보도록 유도한다.
  const targetSpeciesRequiresOtherStage =
    step?.id === 'insect' &&
    scene.id === 'grass' &&
    targetSpeciesId != null &&
    !registeredSpecies.some((species) => species.id === targetSpeciesId)

  // 이 버튼을 감싼 상단 바(z-10, position:relative)가 그 자체로 stacking context라, 안에서
  // z-index를 아무리 올려도 튜토리얼 전역 락(z-100, 'insect' 단계에서 켜져 있음)을 못 이긴다 —
  // RanchBackButton과 같은 이유라 같은 방식(body에 직접 붙는 portal)으로 빠져나온다.
  useEffect(() => {
    if (!targetSpeciesRequiresOtherStage) return
    const updateRect = () => {
      if (stageToggleButtonRef.current) setStageToggleRect(stageToggleButtonRef.current.getBoundingClientRect())
    }
    updateRect()
    window.addEventListener('resize', updateRect)
    return () => window.removeEventListener('resize', updateRect)
  }, [targetSpeciesRequiresOtherStage, stage])

  useEffect(() => {
    reportMissionEvent({ type: 'habitat_population', value: registeredSpecies.length })
  }, [scene.id, registeredSpecies.length])

  const replayZoneBanner = (nextZoneName = zoneName) => {
    setBannerZoneName(nextZoneName)
    setIsZoneBannerOpen(false)
    window.setTimeout(() => setIsZoneBannerOpen(true), 20)
  }

  const moveStage = (nextStage) => {
    setStage(nextStage)
    setSelectedSpeciesId(null)
    draggingRef.current = null
    replayZoneBanner(getStageZoneName(scene, nextStage))
  }

  const updateInsectPosition = (speciesId, position) => {
    setPositionOverrides((current) => {
      const next = {
        ...current,
        [placementKey]: { ...current[placementKey], [speciesId]: position },
      }
      localStorage.setItem(INSECT_POSITIONS_KEY, JSON.stringify(next))
      return next
    })
  }

  const handleLayerPointerMove = (event) => {
    const speciesId = draggingRef.current
    const layer = layerRef.current
    if (!speciesId || !layer) return

    const rect = layer.getBoundingClientRect()
    const x = Math.max(2, Math.min(98, ((event.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(2, Math.min(98, ((event.clientY - rect.top) / rect.height) * 100))
    updateInsectPosition(speciesId, { x, y })
  }

  const endDrag = () => {
    draggingRef.current = null
  }

  const topButtonClass =
    'rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20'

  const goBack = () => navigate('/ranch')

  const openFieldGuide = (speciesId = selectedSpecies?.id ?? null) => {
    navigate('/field-guide', {
      state: {
        habitatId: scene.id,
        habitatName: zoneName,
        selectedSpeciesId: speciesId,
      },
    })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-white">
      <ZoneBannerOverlay
        zoneName={bannerZoneName}
        isOpen={isZoneBannerOpen}
        onClose={() => setIsZoneBannerOpen(false)}
      />

      <div
        // scale-100은 값이 identity여도 transform 속성 자체가 남아있어서 새 stacking context를
        // 만든다 — 입장 애니메이션이 끝난 뒤에도 이 상태가 계속 유지되면, 이 안의 튜토리얼
        // 타깃(관찰할 곤충)이 아무리 z-index를 올려도 튜토리얼 오버레이보다 위로 못 올라가
        // 클릭이 막힌다. 다 들어온 뒤에는 scale 유틸리티 자체를 빼서 transform을 없앤다.
        className={`absolute inset-0 origin-center transition-all duration-500 ease-out ${
          entered ? 'opacity-100' : 'scale-90 opacity-0'
        }`}
      >
      {/* 배경+곤충 배치는 하나의 "세계"로 묶어서 RanchCamera로 드래그(팬)/줌 할 수 있게 한다.
          상단 버튼줄과 정보 패널은 화면에 고정되어야 해서 RanchCamera 밖(형제)에 둔다. */}
      <RanchCamera resetSignal={step?.id === 'insect'}>
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

        <div
          ref={layerRef}
          className={`absolute inset-0 ${isEditing ? '' : 'pointer-events-none'}`}
          onPointerMove={handleLayerPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {registeredSpecies.map((species, index) => {
            const basePlacement = placements[index % placements.length]
            if (!basePlacement) return null
            const override = positionOverrides[placementKey]?.[species.id]
            const placement = override ? { ...basePlacement, x: override.x, y: override.y } : basePlacement

            return (
              <InsectSpot
                key={species.id}
                species={species}
                placement={placement}
                selected={selectedSpeciesId === species.id}
                isEditing={isEditing}
                showTutorialPointer={step?.id === 'insect' && (targetSpeciesId ? species.id === targetSpeciesId : index === 0)}
                onClick={(event) => {
                  event.stopPropagation()
                  if (step?.id === 'insect' && targetSpeciesId && species.id !== targetSpeciesId) return
                  if (!isEditing) {
                    setSelectedSpeciesId(species.id)
                    reportMissionEvent({ type: 'ranch_insect_found', entityId: species.id })
                    if (step?.id === 'insect') {
                      advance()
                      navigate('/field-guide')
                    }
                  }
                }}
                onPointerDown={(event) => {
                  if (!isEditing) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  draggingRef.current = species.id
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
            목장으로 돌아가기
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => openFieldGuide()}
              className={topButtonClass}
            >
              도감으로 이동
            </button>
            <button
              type="button"
              onClick={() => {
                draggingRef.current = null
                setIsEditing((editing) => !editing)
              }}
              className={
                isEditing
                  ? 'rounded-full border border-leaf-300 bg-leaf-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-leaf-600'
                  : topButtonClass
              }
            >
              {isEditing ? '편집 완료' : '곤충 위치 편집'}
            </button>
            <button
              type="button"
              onClick={() => setIsPanelOpen((open) => !open)}
              className={topButtonClass}
            >
              {isPanelOpen ? '정보 패널 숨기기' : '정보 패널 보기'}
            </button>
            {isSequence && stage === 0 ? (
              <button
                type="button"
                ref={stageToggleButtonRef}
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
                ref={stageToggleButtonRef}
                onClick={(event) => {
                  event.stopPropagation()
                  moveStage(0)
                }}
                className={topButtonClass}
              >
                꽃밭으로 돌아가기
              </button>
            ) : null}
            {targetSpeciesRequiresOtherStage &&
              stageToggleRect &&
              createPortal(
                <button
                  type="button"
                  onClick={() => moveStage(stage === 0 ? 1 : 0)}
                  className={`${topButtonClass} pointer-events-auto`}
                  style={{
                    position: 'fixed',
                    left: stageToggleRect.left,
                    top: stageToggleRect.top,
                    width: stageToggleRect.width,
                    height: stageToggleRect.height,
                    zIndex: 110,
                  }}
                >
                  {stage === 0 ? '나무 관찰하기' : '꽃밭으로 돌아가기'}
                  <span className="tutorial-target-guide pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
                    <span className="tutorial-target-ring tutorial-target-ring--small" aria-hidden="true" />
                    <span className="tutorial-target-arrow" aria-hidden="true">👇</span>
                    <span className="tutorial-target-label">여기를 눌러 다른 배경도 살펴보세요</span>
                  </span>
                </button>,
                document.body,
              )}
            <div className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-xs font-semibold tracking-wide text-white/90 backdrop-blur-sm">
              {zoneName} · {progressLabel}
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col justify-end px-4 pb-6">
          {isPanelOpen && (
          <div
            className="pointer-events-auto max-h-[62vh] max-w-3xl overflow-y-auto rounded-2xl border border-white/12 bg-black/35 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md"
            style={{ transform: 'scale(min(1, calc(100vh / 700px)))', transformOrigin: 'bottom left' }}
          >
            <div className="flex flex-col gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">Habitat view</p>
                <h1 className="mt-1 text-lg font-bold">{zoneName}</h1>
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
                      <img
                        src={selectedSpecies.image}
                        alt={selectedSpecies.name}
                        className="h-16 w-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">Observation</p>
                    <h2 className="mt-1 text-base font-bold text-white">곤충을 선택해 주세요</h2>
                    <p className="mt-1 text-xs leading-5 text-white/72">
                      서식지 위의 곤충을 누르면 관찰 카드를 띄워 도감으로 이어갈 수 있어요.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
