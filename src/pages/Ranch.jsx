import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import MainLayout from '../components/common/MainLayout'
import RanchMapScene from '../components/common/RanchMapScene'
import PlacedItemsLayer from '../components/common/PlacedItemsLayer'
import RanchCamera from '../components/common/RanchCamera'
import RandomInsectEffect from '../components/common/RandomInsectEffect'
import EggFirstRevealEffect from '../components/common/EggFirstRevealEffect'
import AnnouncementBoard from '../components/common/AnnouncementBoard'
import { fetchRanchWeather, WEATHER_REFRESH_MS } from '../api/weather'
import { mockUser } from '../data/mockData'
import { HABITATS, getHabitatStats, getInsectSpecies, DEMO_ACCOUNT_USERNAME } from '../data/insectSpecies'
import { getRepresentativeCharacterImage, getOwnedRepresentativeCharacters, GROWTH_MAX } from '../data/representativeCharacter'
import { useAuth } from '../router/AuthContext'
import { useBag } from '../context/BagContext'
import { useCurrency } from '../context/CurrencyContext'
import { useQuests } from '../context/QuestsContext'
import { useRegisteredPhotos } from '../context/RegisteredPhotosContext'
import { useTutorial } from '../context/TutorialContext'
import { reportMissionEvent } from '../utils/missionEvents'
import { isQuizCompletedToday } from '../utils/quizAvailability'
import { fetchUserState, saveUserState } from '../api/userState'
import ResultModal from '../components/common/ResultModal'

// 위치 권한을 못 받거나 실패했을 때 쓰는 기본 좌표(서울 시청).
const DEFAULT_LOCATION = { latitude: 37.5665, longitude: 126.978 }

function WeatherBadge({ weather, visible, onToggle }) {
  const label = weather?.status === 'loading'
    ? '날씨 확인 중'
    : weather?.status === 'error'
      ? '날씨 불러오기 실패'
      : weather?.label || '날씨 확인 중'
  const icon = weather?.status === 'loading'
    ? '⏳'
    : weather?.status === 'error'
      ? '☁️'
      : weather?.icon || '☀️'
  const temperature = Number.isFinite(weather?.temperature) ? `${weather.temperature}°C` : '위치 반영 중'

  return (
    <div className={`ranch-weather-wrap pointer-events-auto ${visible ? '' : 'ranch-weather-wrap--collapsed'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="ranch-weather-toggle"
        aria-label={visible ? '날씨 정보 숨기기' : '날씨 정보 보기'}
        title={visible ? '날씨 정보 숨기기' : '날씨 정보 보기'}
      >
        <span aria-hidden="true">{visible ? '▸' : '◂'}</span>
      </button>
      <div className="ranch-weather-panel">
        <div className="ranch-weather-pill" aria-live="polite">
          <span className="ranch-weather-pill__icon" aria-hidden="true">{icon}</span>
          <span className="min-w-0">
            <strong className="block text-xs font-black text-ink-900">{label}</strong>
            <span className="block text-[11px] font-bold text-ink-700/70">{temperature} · 현재 위치</span>
          </span>
        </div>
      </div>
    </div>
  )
}

const RANCH_SIDE_NAV_ITEMS = [
  { to: '/exploration', label: '탐험', iconSrc: '/ui/explore-trimmed.png' },
  { to: '/field-guide', label: '도감', iconSrc: '/ui/guide-trimmed.png' },
  { to: '/friends', label: '소셜', iconSrc: '/ui/social-trimmed.png' },
  { to: '/bag', label: '가방', iconSrc: '/ui/bag-trimmed.png' },
  { to: '/quests', label: '미션', iconSrc: '/ui/mission-trimmed.png', hasBadge: true },
  { to: '/shop', label: '상점', iconSrc: '/ui/shop-trimmed.png' },
  { to: '/quiz', label: '퀴즈', iconSrc: '/ui/quiz-trimmed.png' },
]

// ranch.md: 최초 사용자 튜토리얼, 도움말로 재실행, 서식지별 등록 현황, 인테리어 배치 진입.
// 목장 배경이 카드 전체를 꽉 채우고(RanchMapScene), 캐릭터 대사·미션·버튼은 전부
// 그 위에 떠 있는 오버레이 패널로 배치한다 (참고 UI 이미지 레이아웃 반영).
const HABITAT_POSITIONS_KEY = 'habitatPositions'
const HABITAT_SCALES_KEY = 'habitatScales'
const PRIMARY_TITLE_KEY = 'primaryTitleId'
const PRIMARY_BADGE_KEY = 'primaryBadgeId'

export default function Ranch() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isDemoAccount = user?.username === DEMO_ACCOUNT_USERNAME
  const { bagItems, bagCapacity, placeItem, retrieveInstance, placements, updatePlacementPosition, updatePlacementScale } = useBag()
  const { photos, sketches, bronzeUnlocks } = useRegisteredPhotos()
  const { leaves, growthPoints } = useCurrency()
  const {
    quests,
    claim,
    pendingCount: pendingMissionCount,
    fieldGuideCount,
    representativeCharacter,
    adultHistory,
    profileCharacterId,
    selectProfileCharacter,
  } = useQuests()
  const { step, advance, restart, openIfNeeded, targetHabitatId } = useTutorial()
  const [isEditing, setIsEditing] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [equippedTitleIds, setEquippedTitleIds] = useState([])
  const [primaryTitleId, setPrimaryTitleId] = useState(null)
  const [equippedBadgeIds, setEquippedBadgeIds] = useState([])
  const [primaryBadgeId, setPrimaryBadgeId] = useState(null)
  const [isCharacterPickerOpen, setIsCharacterPickerOpen] = useState(false)
  const [isTitlePickerOpen, setIsTitlePickerOpen] = useState(false)
  const [isBadgePickerOpen, setIsBadgePickerOpen] = useState(false)
  const [isMissionModalOpen, setIsMissionModalOpen] = useState(false)
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false)
  const [isGuestbookModalOpen, setIsGuestbookModalOpen] = useState(false)
  const [guestbookEntries, setGuestbookEntries] = useState([])
  const [isGuestbookLoading, setIsGuestbookLoading] = useState(false)
  const [isQuizExhaustedModalOpen, setIsQuizExhaustedModalOpen] = useState(false)
  // 알 획득 연출(EggFirstRevealEffect)이 떠 있는 동안엔 튜토리얼/편집/방명록 버튼 등이 겹쳐
  // 뜨지 않도록 숨긴다 — EggFirstRevealEffect의 onActiveChange로 갱신된다.
  const [isEggGrantFlowActive, setIsEggGrantFlowActive] = useState(false)
  const [editTarget, setEditTarget] = useState('habitat')
  const [selectedHabitatId, setSelectedHabitatId] = useState(HABITATS[0].id)
  const [selectedPlacementId, setSelectedPlacementId] = useState(null)
  // true면 "목장에 배치"를 눌러 자동으로 들어온 편집 모드 — 이때만 좌측에 인테리어 꺼내기
  // 트레이를 보여준다. 대객체(서식지) 위치/크기는 고정이라 더 이상 편집 대상이 아니다.
  const [viaPlacementEntry, setViaPlacementEntry] = useState(false)
  const [isWeatherVisible, setIsWeatherVisible] = useState(true)
  const [weather, setWeather] = useState({
    status: 'loading',
    effect: 'clear',
    icon: '⏳',
    label: '날씨 확인 중',
    temperature: null,
  })
  const weatherCoordsRef = useRef(DEFAULT_LOCATION)

  function handleSideNavigation(item) {
    if (item.to === '/quiz' && isQuizCompletedToday(user?.uid)) {
      setIsQuizExhaustedModalOpen(true)
      return
    }
    navigate(item.to)
  }

  async function openGuestbook() {
    setIsGuestbookModalOpen(true)
    if (!user?.uid) return
    setIsGuestbookLoading(true)
    try {
      const response = await fetch(`/api/guestbook/${user.uid}`)
      const { entries } = await response.json()
      setGuestbookEntries(entries || [])
    } catch {
      setGuestbookEntries([])
    } finally {
      setIsGuestbookLoading(false)
    }
  }

  // 가방에서 "목장에 배치"를 누르고 넘어온 경우, 방금 배치한 아이템을 바로 편집 모드로 연다.
  useEffect(() => {
    const editPlacementId = location.state?.editPlacementId
    if (!editPlacementId) return
    setIsEditing(true)
    setViaPlacementEntry(true)
    setEditTarget('placement')
    setSelectedPlacementId(editPlacementId)
  }, [location.state])

  // 아직 튜토리얼을 안 끝낸 계정이 목장에 들어오면(배치 편집 진입이 아닌 경우) 잠깐 뒤에 띄운다 —
  // 다른 화면 상태가 먼저 자리 잡은 뒤에 나타나야 튜토리얼 카드가 덜컥거리지 않는다.
  useEffect(() => {
    if (location.state?.editPlacementId) return
    const id = window.setTimeout(() => {
      openIfNeeded()
    }, 300)
    return () => window.clearTimeout(id)
  }, [location.state?.editPlacementId, openIfNeeded])

  // 대객체(서식지) 위치/크기 편집값. ranch.md: 편집 모드에서 대객체를 드래그하면 위치가 바뀌고,
  // 길(RanchPaths)은 이 좌표를 그대로 읽어서 자동으로 따라간다 — 별도 동기화 로직이 없다.
  // 계정별 진행도라 로그인한 uid 기준으로 서버(user_state)에 저장한다 — 친구가 목장 방문 시
  // 이 값을 읽어서 실제 배치를 보여준다(Friends.jsx의 /api/ranch/:uid).
  const [habitatPositions, setHabitatPositions] = useState(() => (
    Object.fromEntries(HABITATS.map((habitat) => [habitat.id, { x: habitat.x, y: habitat.y }]))
  ))
  const [habitatScales, setHabitatScales] = useState(() => (
    Object.fromEntries(HABITATS.map((habitat) => [habitat.id, habitat.scale ?? 1]))
  ))

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    fetchUserState(user.uid).then((state) => {
      if (cancelled) return
      const defaultPositions = Object.fromEntries(HABITATS.map((habitat) => [habitat.id, { x: habitat.x, y: habitat.y }]))
      const defaultScales = Object.fromEntries(HABITATS.map((habitat) => [habitat.id, habitat.scale ?? 1]))
      if (state[HABITAT_POSITIONS_KEY]) setHabitatPositions({ ...defaultPositions, ...state[HABITAT_POSITIONS_KEY] })
      if (state[HABITAT_SCALES_KEY]) setHabitatScales({ ...defaultScales, ...state[HABITAT_SCALES_KEY] })
      setEquippedTitleIds(Array.isArray(state.equippedTitles) ? state.equippedTitles : [])
      setPrimaryTitleId(typeof state[PRIMARY_TITLE_KEY] === 'string' ? state[PRIMARY_TITLE_KEY] : null)
      setEquippedBadgeIds(Array.isArray(state.equippedBadges) ? state.equippedBadges : [])
      setPrimaryBadgeId(typeof state[PRIMARY_BADGE_KEY] === 'string' ? state[PRIMARY_BADGE_KEY] : null)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  // 현재 위치(브라우저 Geolocation) 기준 실제 날씨를 가져와 목장 배경에 반영한다. 위치 권한이
  // 없거나 실패하면 서울 시청 좌표로 대체하고, 1시간마다 조용히 갱신한다.
  useEffect(() => {
    let cancelled = false
    let refreshTimer = null

    const updateWeather = async (coords) => {
      const latitude = Number.isFinite(coords?.latitude) ? coords.latitude : DEFAULT_LOCATION.latitude
      const longitude = Number.isFinite(coords?.longitude) ? coords.longitude : DEFAULT_LOCATION.longitude
      weatherCoordsRef.current = { latitude, longitude }

      try {
        const nextWeather = await fetchRanchWeather({ latitude, longitude })
        if (!cancelled) setWeather({ status: 'ready', ...nextWeather })
      } catch (error) {
        if (!cancelled) {
          setWeather((current) => ({
            ...current,
            status: 'error',
            icon: '☁️',
            label: '날씨 불러오기 실패',
            temperature: null,
            error: error?.message || 'WEATHER_FETCH_FAILED',
          }))
        }
      }
    }

    const requestWeather = () => {
      if (!navigator.geolocation) {
        updateWeather(DEFAULT_LOCATION)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => updateWeather({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => updateWeather(DEFAULT_LOCATION),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: WEATHER_REFRESH_MS },
      )
    }

    requestWeather()
    refreshTimer = window.setInterval(() => updateWeather(weatherCoordsRef.current), WEATHER_REFRESH_MS)

    return () => {
      cancelled = true
      if (refreshTimer) window.clearInterval(refreshTimer)
    }
  }, [])

  const missionGroups = [
    { title: '일일 미션', tab: 'daily', quests: quests.daily },
    { title: '주간 미션', tab: 'weekly', quests: quests.weekly },
    { title: '업적 미션', tab: 'achievement', quests: quests.achievement },
  ]
  // FieldGuide.jsx와 동일하게, 정적 종 목록의 registered 플래그가 아니라 실제 등록 상태
  // (photos/sketches/bronzeUnlocks)를 반영해야 새로 등록한 곤충이 실시간으로 카운트에 잡힌다.
  const habitatStats = useMemo(() => {
    const speciesList = getInsectSpecies(isDemoAccount).map((species) => {
      const registered = species.registered || Boolean(photos[species.id]) || Boolean(sketches[species.id]) || Boolean(bronzeUnlocks[species.id])
      return registered === species.registered ? species : { ...species, registered }
    })
    const stats = {}
    for (const h of HABITATS) stats[h.id] = getHabitatStats(h.id, speciesList)
    return stats
  }, [isDemoAccount, photos, sketches, bronzeUnlocks])
  const selectedPlacement = placements.find((p) => p.id === selectedPlacementId) ?? null
  const selectedHabitat = HABITATS.find((habitat) => habitat.id === selectedHabitatId) ?? HABITATS[0]
  const interiorBagItems = bagItems.filter((item) => item.category === 'interior')
  // 배치 칸 30개는 목장에 놓인 개수가 아니라 가방에 보유한 인테리어 "종류" 수 기준이다.
  const interiorSlotsFull = interiorBagItems.length >= bagCapacity
  // 알 획득 연출 또는 튜토리얼이 떠 있는 동안엔 편집/방명록/랜덤곤충 이펙트 등 다른 오버레이를 숨긴다.
  // 단, 가방 "목장에 배치"로 들어온 편집 흐름(viaPlacementEntry)은 예외다 — 마지막(bag) 튜토리얼
  // 단계가 안내하는 행동 자체가 이 편집 UI(크기 조절·가방에 넣기·완료)를 만지는 것이라, 여기서
  // 숨겨버리면 정작 안내대로 따라 할 수가 없다.
  const isEntryModalActive = isEggGrantFlowActive || (Boolean(step) && !viaPlacementEntry)
  const shouldShowRandomInsectEffect = !isEggGrantFlowActive && (!step || step.id === 'random-insect')

  function handlePlaceFromTray(itemId) {
    const instanceId = placeItem(itemId)
    if (instanceId) {
      setEditTarget('placement')
      setSelectedPlacementId(instanceId)
    }
  }

  function updateHabitatPosition(id, position) {
    setHabitatPositions((current) => {
      const next = { ...current, [id]: position }
      if (user?.uid) saveUserState(user.uid, HABITAT_POSITIONS_KEY, next)
      return next
    })
  }

  function updateHabitatScale(id, scale) {
    setHabitatScales((current) => {
      const next = { ...current, [id]: scale }
      if (user?.uid) saveUserState(user.uid, HABITAT_SCALES_KEY, next)
      return next
    })
  }

  // 프로필 팝업/탐험도우미가 보여줄 캐릭터 사진 — 가방 '대표 캐릭터' 탭과 같은 목록(현재 캐릭터 +
  // 성체가 된 지난 캐릭터들)에서 고른다. QuestsContext가 선택 상태를 들고 있어서 가방에서
  // "선택하기"를 눌러도 여기 그대로 반영된다.
  const ownedCharacters = getOwnedRepresentativeCharacters(representativeCharacter, adultHistory)
  const selectedCharacter = ownedCharacters.find((c) => c.id === profileCharacterId) ?? ownedCharacters[0] ?? null
  const profileAvatarImage = selectedCharacter?.image ?? getRepresentativeCharacterImage(representativeCharacter) ?? '/ui/egg-clean.png'

  function handleSelectProfileCharacter(id) {
    selectProfileCharacter(id)
    setIsCharacterPickerOpen(false)
  }

  // 프로필 팝업의 대표 칭호 선택 — 프로필 페이지에서 이미 장착해 둔(최대 5개) 칭호 중 이 팝업에
  // 하나만 대표로 보여줄 걸 고른다. 장착 목록 자체(equippedTitles)는 여기서 안 건드린다.
  const equippedTitleOptions = quests.title.filter((quest) => equippedTitleIds.includes(quest.id))
  const selectedTitle = equippedTitleOptions.find((t) => t.id === primaryTitleId) ?? equippedTitleOptions[0] ?? null

  function selectPrimaryTitle(id) {
    setPrimaryTitleId(id)
    setIsTitlePickerOpen(false)
    if (user?.uid) saveUserState(user.uid, PRIMARY_TITLE_KEY, id)
  }

  // 대표 배지도 대표 칭호와 같은 방식 — 프로필에서 장착해 둔(최대 5개) 배지 중 하나를 여기서 대표로 고른다.
  const equippedBadgeOptions = quests.achievement.filter((quest) => quest.claimed && equippedBadgeIds.includes(quest.id))
  const selectedBadge = equippedBadgeOptions.find((b) => b.id === primaryBadgeId) ?? equippedBadgeOptions[0] ?? null

  function selectPrimaryBadge(id) {
    setPrimaryBadgeId(id)
    setIsBadgePickerOpen(false)
    if (user?.uid) saveUserState(user.uid, PRIMARY_BADGE_KEY, id)
  }

  return (
    <MainLayout showHeader={false} showBottomNav={false}>
      <div className="relative h-screen min-h-0 overflow-hidden bg-ink-950">
        <RanchCamera>
          <RanchMapScene
            habitats={HABITATS}
            stats={habitatStats}
            weather={weather}
            positions={habitatPositions}
            scales={habitatScales}
            selectedId={editTarget === 'habitat' ? selectedHabitatId : null}
            isEditing={isEditing && !viaPlacementEntry}
            onSelectEdit={(id) => {
              setEditTarget('habitat')
              setSelectedHabitatId(id)
            }}
            onPositionChange={updateHabitatPosition}
            onSelect={(h) => {
              if (step?.id === 'habitat' && targetHabitatId && h.id !== targetHabitatId) return
              if (step?.id === 'habitat') advance()
              reportMissionEvent({ type: 'habitat_visit', entityId: h.id })
              navigate(`/ranch/${h.id}`)
            }}
          />

          <PlacedItemsLayer
            placements={placements}
            isEditing={isEditing}
            selectedId={editTarget === 'placement' ? selectedPlacementId : null}
            onSelect={(id) => {
              setEditTarget('placement')
              setSelectedPlacementId(id)
            }}
            onPositionChange={updatePlacementPosition}
          />

          {!isEditing && shouldShowRandomInsectEffect && <RandomInsectEffect />}
          <EggFirstRevealEffect
            trigger={location.state?.firstLogin}
            representativeCharacter={representativeCharacter}
            onActiveChange={setIsEggGrantFlowActive}
          />
        </RanchCamera>

        {isEditing && !isEntryModalActive && editTarget === 'habitat' && !viaPlacementEntry && (
          <div className="absolute inset-x-3 bottom-20 z-10 flex justify-center">
            <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink-900/85 px-4 py-2 text-xs font-semibold text-white shadow-card backdrop-blur-sm">
              <span className="shrink-0">{selectedHabitat.name} 크기</span>
              <input
                type="range"
                min="0.6"
                max="1.6"
                step="0.05"
                value={habitatScales[selectedHabitat.id] ?? 1}
                onChange={(event) => updateHabitatScale(selectedHabitat.id, Number(event.target.value))}
                className="min-w-0 flex-1 accent-leaf-500"
                aria-label={`${selectedHabitat.name} 크기 조절`}
              />
              <span className="w-10 text-right tabular-nums">{Math.round((habitatScales[selectedHabitat.id] ?? 1) * 100)}%</span>
            </div>
          </div>
        )}

        {isEditing && !isEntryModalActive && editTarget === 'placement' && selectedPlacement && (
          <div className="absolute inset-x-3 bottom-20 z-10 flex justify-center">
            <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink-900/85 px-4 py-2 text-xs font-semibold text-white shadow-card backdrop-blur-sm">
              <span className="shrink-0">{selectedPlacement.name} 크기</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={selectedPlacement.scale ?? 1}
                onChange={(event) => updatePlacementScale(selectedPlacement.id, Number(event.target.value))}
                className="min-w-0 flex-1 accent-leaf-500"
                aria-label={`${selectedPlacement.name} 크기 조절`}
              />
              <span className="w-10 text-right tabular-nums">{Math.round((selectedPlacement.scale ?? 1) * 100)}%</span>
              <button
                type="button"
                onClick={() => {
                  retrieveInstance(selectedPlacement.id)
                  setSelectedPlacementId(null)
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25"
              >
                <img className="h-8 w-8 scale-125 object-contain" src="/ui/bag-trimmed.png" alt="" aria-hidden="true" />
                가방에 넣기
              </button>
            </div>
          </div>
        )}

        {isEditing && !isEntryModalActive && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(false)
              setViaPlacementEntry(false)
            }}
            className="ranch-edit-complete-button"
          >
            완료
          </button>
        )}

        {!isEditing && !isEntryModalActive && (
          <>
            {/* 상단: 탐험가 프로필(닉네임 옆에 대표 칭호·배지) + 알림/설정 (목장 이미지 위 오버레이) */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
              <div className="ranch-profile-cluster pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(true)}
                  className="ranch-profile-card"
                >
                  <img
                    className="ranch-profile-avatar"
                    src={profileAvatarImage}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="min-w-0 shrink truncate text-sm font-black text-ink-900">{user?.nickname}</span>
                      {selectedTitle && (
                        <span className="min-w-0 shrink truncate text-[10px] font-bold text-ink-700/60">{selectedTitle.title}</span>
                      )}
                      {selectedBadge && (
                        <img
                          src={selectedBadge.badgeImage}
                          alt=""
                          aria-hidden="true"
                          className="h-6 w-6 shrink-0 rounded-full bg-white object-contain p-0.5 ring-1 ring-leaf-200"
                        />
                      )}
                    </span>
                    <span className="flex items-center gap-1.5" aria-label={`성장 포인트 ${growthPoints}/${GROWTH_MAX}`}>
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-leaf-100">
                        <span
                          data-reward-target="growth-points"
                          className="block h-full rounded-full bg-leaf-500 transition-[width]"
                          style={{ width: `${Math.min(100, (growthPoints / GROWTH_MAX) * 100)}%` }}
                        />
                      </span>
                      <span className="shrink-0 text-[9px] font-bold tabular-nums text-ink-700/70">
                        {growthPoints}/{GROWTH_MAX}
                      </span>
                    </span>
                  </span>
                </button>
              </div>

              <div className="ranch-top-tools pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setIsAnnouncementOpen(true)}
                  className="ranch-top-icon-button"
                  aria-label="알림"
                >
                  <img src="/ui/alarm-icon-sq.png" alt="" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/profile/edit')}
                  className="ranch-top-icon-button"
                  aria-label="설정"
                >
                  <img src="/ui/settings-icon-v3.png" alt="" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* 현재 위치 기반 날씨 표시 — 편집 버튼(우측 상단) 바로 아래에 둔다. */}
            <div className="pointer-events-none absolute right-0 top-20 z-20 overflow-visible">
              <WeatherBadge
                weather={weather}
                visible={isWeatherVisible}
                onToggle={() => setIsWeatherVisible((current) => !current)}
              />
            </div>
          </>
        )}

        {/* 가방에서 "목장에 배치"로 들어온 경우: 가방 인테리어를 바로 꺼내 놓을 수 있는 트레이. */}
        {isEditing && !isEntryModalActive && viaPlacementEntry && (
          <div className="absolute left-3 top-3 flex w-64 max-w-[72vw] flex-col gap-2 rounded-xl bg-white/95 p-4 shadow-card backdrop-blur-sm">
            <div className="mb-1 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <img className="h-8 w-8 scale-125 object-contain" src="/ui/bag-trimmed.png" alt="" aria-hidden="true" />
                인테리어 꺼내기
              </p>
              <span className="text-xs text-ink-700/60 tabular-nums">
                {interiorBagItems.length}/{bagCapacity}
              </span>
            </div>
            {interiorBagItems.length === 0 ? (
              <p className="text-xs text-ink-700/60">가방에 인테리어 아이템이 없어요.</p>
            ) : (
              <ul className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto pr-1">
                {interiorBagItems.map((item) => {
                  const remaining = item.qty - item.placed
                  return (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg bg-ivory-50 p-2">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white">
                        {item.image ? (
                          <img src={item.image} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <span aria-hidden="true">🪑</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-ink-900">{item.name}</p>
                        <p className="text-[11px] text-ink-700/60">보유 {remaining}개</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePlaceFromTray(item.id)}
                        disabled={remaining <= 0 || interiorSlotsFull}
                        title={interiorSlotsFull ? `인테리어 배치 칸은 최대 ${bagCapacity}개예요.` : undefined}
                        className="shrink-0 rounded-full bg-leaf-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-leaf-600 disabled:bg-ivory-200 disabled:text-ink-700/40"
                      >
                        배치
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* 우측 상단: 편집 버튼 — 편집 중에도 계속 필요해서 항상 남긴다 */}
        <div className={`absolute right-1 top-[9rem] z-50 flex flex-col items-end gap-[-2.25rem] transition-opacity ${isEntryModalActive || isEditing ? 'pointer-events-none opacity-0' : ''}`}>
          <button
            type="button"
            onClick={() => {
              setViaPlacementEntry(false)
              setIsEditing((editing) => !editing)
            }}
            className={`ranch-edit-button ${isEditing ? 'ranch-edit-button--active' : ''}`}
          >
            <img className="ranch-action-button__image ranch-action-button__image--edit" src="/ui/edit-action.png" alt={isEditing ? '완료' : '편집'} />
          </button>
          <button
            type="button"
            onClick={openGuestbook}
            className="ranch-edit-button"
          >
            <img className="ranch-action-button__image ranch-action-button__image--guestbook" src="/ui/guestbook-action.png" alt="방명록 보기" />
          </button>
        </div>

        {!isEditing && !isEntryModalActive && (
          <>
            <button
              type="button"
              onClick={restart}
              className="ranch-egg-help"
              aria-label="도움말 보기"
              title="도움말"
              style={{ transform: 'translateY(-50%) scale(0.7)', transformOrigin: 'left center' }}
            >
              <img
                className="ranch-egg-help__face"
                src={profileAvatarImage}
                alt=""
                aria-hidden="true"
              />
              <img className="ranch-egg-help__label-image" src="/ui/explorer-helper-text.png" alt="탐험도우미" />
            </button>

            <div className="ranch-side-hud" aria-label="목장 바로가기">
              {RANCH_SIDE_NAV_ITEMS.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleSideNavigation(item)}
                  className={`ranch-hud-button ranch-hud-icon ranch-hud-icon--${item.to.slice(1).replace('/', '-')}`}
                  aria-label={item.label}
                  title={item.label}
                >
                  <span className="ranch-hud-icon-art">
                    <img src={item.iconSrc} alt="" aria-hidden="true" />
                    {item.hasBadge && pendingMissionCount > 0 ? (
                      <span className="ranch-alert-badge ranch-hud-alert-badge" aria-label="확인할 미션 있음">
                        <span aria-hidden="true">!</span>
                      </span>
                    ) : null}
                  </span>
                  <strong>{item.label}</strong>
                </button>
              ))}
            </div>
          </>
        )}

        {isProfileModalOpen && (
          <div
            className="ranch-modal-backdrop"
            role="presentation"
            onClick={() => {
              setIsProfileModalOpen(false)
              setIsCharacterPickerOpen(false)
              setIsTitlePickerOpen(false)
              setIsBadgePickerOpen(false)
            }}
          >
            <div className="ranch-modal ranch-profile-modal" role="dialog" aria-modal="true" aria-label="탐험가 정보" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ranch-modal-close" onClick={() => setIsProfileModalOpen(false)} aria-label="닫기">×</button>
              <div className="ranch-profile-modal-hero">
                <div className="relative">
                  <button
                    type="button"
                    className="ranch-profile-modal-avatar block"
                    aria-label="프로필 사진 선택"
                    onClick={() => {
                      setIsCharacterPickerOpen((open) => !open)
                      setIsTitlePickerOpen(false)
                      setIsBadgePickerOpen(false)
                    }}
                  >
                    <img src={profileAvatarImage} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                  {isCharacterPickerOpen && (
                    <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl bg-white p-2 shadow-soft">
                      <p className="mb-1 px-1 text-[11px] font-bold text-ink-700/60">대표 캐릭터 선택</p>
                      {ownedCharacters.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-ink-700/60">보유한 캐릭터가 없어요.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {ownedCharacters.map((character) => (
                            <button
                              key={character.id}
                              type="button"
                              onClick={() => handleSelectProfileCharacter(character.id)}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-ivory-100 ${
                                selectedCharacter?.id === character.id ? 'bg-leaf-50 text-leaf-700' : 'text-ink-900'
                              }`}
                            >
                              <img src={character.image} alt="" className="h-8 w-8 object-contain" />
                              {character.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="ranch-profile-modal-info">
                  <p className="ranch-profile-modal-rank">EXPLORER</p>
                  <div className="ranch-profile-modal-name-row">
                    <h2>{user?.nickname}</h2>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsTitlePickerOpen((open) => !open)
                          setIsCharacterPickerOpen(false)
                          setIsBadgePickerOpen(false)
                        }}
                        className="text-sm font-bold text-ink-700/70 underline decoration-dotted underline-offset-2 hover:text-ink-900"
                      >
                        {selectedTitle ? selectedTitle.title : '칭호 선택'}
                      </button>
                      {isTitlePickerOpen && (
                        <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl bg-white p-2 shadow-soft">
                          <p className="mb-1 px-1 text-[11px] font-bold text-ink-700/60">대표 칭호 선택</p>
                          {equippedTitleOptions.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-ink-700/60">프로필에서 먼저 칭호를 장착해 주세요.</p>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {equippedTitleOptions.map((titleQuest) => (
                                <button
                                  key={titleQuest.id}
                                  type="button"
                                  onClick={() => selectPrimaryTitle(titleQuest.id)}
                                  className={`rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-ivory-100 ${
                                    selectedTitle?.id === titleQuest.id ? 'bg-leaf-50 text-leaf-700' : 'text-ink-900'
                                  }`}
                                >
                                  {titleQuest.title}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="ranch-profile-modal-subtitle">자연 탐험가</p>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBadgePickerOpen((open) => !open)
                      setIsCharacterPickerOpen(false)
                      setIsTitlePickerOpen(false)
                    }}
                    className="ranch-profile-modal-badge"
                    aria-label="대표 배지 선택"
                  >
                    {selectedBadge ? (
                      <>
                        <img src={selectedBadge.badgeImage} alt="" aria-hidden="true" />
                        <span>{selectedBadge.badgeName}</span>
                      </>
                    ) : (
                      <span>배지 선택</span>
                    )}
                  </button>
                  {isBadgePickerOpen && (
                    <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl bg-white p-2 shadow-soft">
                      <p className="mb-1 px-1 text-[11px] font-bold text-ink-700/60">대표 배지 선택</p>
                      {equippedBadgeOptions.length === 0 ? (
                        <p className="px-1 py-1 text-xs text-ink-700/60">프로필에서 먼저 배지를 장착해 주세요.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {equippedBadgeOptions.map((badge) => (
                            <button
                              key={badge.id}
                              type="button"
                              onClick={() => selectPrimaryBadge(badge.id)}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-ivory-100 ${
                                selectedBadge?.id === badge.id ? 'bg-leaf-50 text-leaf-700' : 'text-ink-900'
                              }`}
                            >
                              <img src={badge.badgeImage} alt="" className="h-6 w-6 object-contain" />
                              {badge.badgeName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="ranch-profile-modal-stats">
                <div className="ranch-stat-tile"><span>도감</span><strong>{fieldGuideCount}/{mockUser.fieldGuideTotal}</strong></div>
                <div className="ranch-stat-tile"><span>성장 포인트</span><strong>{growthPoints}</strong></div>
                <div className="ranch-stat-tile"><span>출석</span><strong>{user?.totalLoginDays ?? 0}일</strong></div>
                <div className="ranch-stat-tile"><span>나뭇잎</span><strong>{leaves}</strong></div>
              </div>
            </div>
          </div>
        )}

        <ResultModal
          open={isQuizExhaustedModalOpen}
          imageSrc="/ui/quiz-exhausted.png"
          title="오늘의 퀴즈를 모두 풀었어요"
          description="오늘 가능한 퀴즈 횟수를 다 사용했어요. 내일 목장에서 다시 도전해 주세요!"
          confirmLabel="확인"
          onConfirm={() => setIsQuizExhaustedModalOpen(false)}
        />

        {isGuestbookModalOpen && (
          <div className="ranch-modal-backdrop" role="presentation" onClick={() => setIsGuestbookModalOpen(false)}>
            <div className="ranch-modal" role="dialog" aria-modal="true" aria-label="방명록" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ranch-modal-close" onClick={() => setIsGuestbookModalOpen(false)} aria-label="닫기">×</button>
              <div className="ranch-guestbook-modal-logo" aria-label={`${user?.nickname || user?.username || user?.uid || '사용자'}의 방명록`}>
                <span className="ranch-guestbook-modal-owner">
                  {user?.nickname || user?.username || user?.uid || '사용자'}의
                </span>
                <img src="/ui/guestbook-action.png" alt="방명록" />
              </div>
              {isGuestbookLoading ? (
                <p className="mt-4 text-sm text-ink-700/60">불러오는 중...</p>
              ) : guestbookEntries.length === 0 ? (
                <p className="mt-4 text-sm text-ink-700/60">아직 남겨진 방명록이 없어요.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {guestbookEntries.map((entry) => (
                    <li key={entry.id} className="rounded-lg bg-ivory-100 p-3 text-sm">
                      <p className="font-semibold text-ink-900">{entry.visitorNickname}</p>
                      <p className="text-ink-700/80">{entry.message}</p>
                      <p className="mt-1 text-xs text-ink-700/50">{entry.created_at}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {isMissionModalOpen && (
          <div className="ranch-modal-backdrop" role="presentation" onClick={() => setIsMissionModalOpen(false)}>
            <div className="ranch-modal ranch-mission-modal" role="dialog" aria-modal="true" aria-label="미션 목록" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ranch-modal-close" onClick={() => setIsMissionModalOpen(false)} aria-label="닫기">×</button>
              <div className="flex items-center gap-3">
                <span className="ranch-mission-modal-icon" aria-hidden="true">📜</span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-leaf-700">Mission</p>
                  <h2 className="text-2xl font-black text-ink-900">미션 목록</h2>
                </div>
              </div>
              <div className="mt-5 flex max-h-[58vh] flex-col gap-4 overflow-y-auto pr-1">
                {missionGroups.map((group) => (
                  <section key={group.title}>
                    <h3 className="mb-2 text-sm font-black text-ink-900">{group.title}</h3>
                    <div className="flex flex-col gap-2">
                      {group.quests.map((quest) => {
                        const percent = Math.min(100, (quest.progress / quest.total) * 100)
                        return (
                          <div key={quest.id} className="ranch-mission-row">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <p className="truncate text-sm font-black text-ink-900">{quest.title}</p>
                                <span className="shrink-0 text-xs font-bold text-ink-700/70">{quest.progress}/{quest.total}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-ink-700/70">{quest.desc}</p>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-leaf-100">
                                <div className="h-full rounded-full bg-leaf-500" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => claim(group.tab, quest.id)}
                              disabled={!quest.done || quest.claimed}
                              className="ranch-reward-button"
                            >
                              {quest.claimed ? '완료' : quest.done ? `수령 ${quest.rewardLeaf}` : `${quest.rewardLeaf}`}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <AnnouncementBoard open={isAnnouncementOpen} onClose={() => setIsAnnouncementOpen(false)} />
    </MainLayout>
  )
}
