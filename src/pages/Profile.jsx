import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import FocusedLayout from '../components/common/FocusedLayout'
import { useAuth } from '../router/AuthContext'
import { mockUser } from '../data/mockData'
import { useQuests } from '../context/QuestsContext'
import { useCurrency } from '../context/CurrencyContext'
import { getRepresentativeCharacterImage, getRepresentativeCharacterStageLabel, GROWTH_MAX } from '../data/representativeCharacter'
import GrowthGauge from '../components/common/GrowthGauge'
import { readMusicVolume, readSfxVolume, writeMusicVolume, writeSfxVolume } from '../utils/sound'
import { fetchUserState, saveUserState } from '../api/userState'

const BIO_KEY = 'bio'
const EQUIPPED_BADGES_KEY = 'equippedBadges'
const EQUIPPED_TITLES_KEY = 'equippedTitles'
// Ranch.jsx의 목장 프로필 팝업이 읽는 것과 같은 키 — 여기서 정해도 그쪽 "칭호 선택"/"배지 선택"에 그대로 반영된다.
const PRIMARY_TITLE_KEY = 'primaryTitleId'
const PRIMARY_BADGE_KEY = 'primaryBadgeId'
const DEFAULT_BIO = '자연을 사랑하고, 작은 생명도 소중히 여기는 자연 탐험가예요!'
const MAX_EQUIPPED = 5
const BIO_MAX_LEN = 60

// profile.md: 닉네임/레벨/경험치, 도감·업적 달성도, 총 접속 일수, 대표 배지·칭호 선택, 자기소개 길이제한+금칙어.
// /profile/edit로 들어오면 "프로필 수정"/"시스템 설정" 탭을 갖는 편집 모드가 된다 (AppHeader·목장 상단 설정 버튼 진입점).
export default function Profile() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const isEditMode = location.pathname.endsWith('/edit')
  const [activeEditTab, setActiveEditTab] = useState('profile')
  const { quests, fieldGuideCount, representativeCharacter, featuredCharacterImage, isLoaded: isQuestsLoaded } = useQuests()
  const { growthPoints, growthStage } = useCurrency()

  const [bio, setBio] = useState(DEFAULT_BIO)
  const [musicVolume, setMusicVolume] = useState(readMusicVolume)
  const [sfxVolume, setSfxVolume] = useState(readSfxVolume)
  const [equippedBadgeIds, setEquippedBadgeIds] = useState([])
  const [equippedTitleIds, setEquippedTitleIds] = useState([])
  const [primaryTitleId, setPrimaryTitleId] = useState(null)
  const [primaryBadgeId, setPrimaryBadgeId] = useState(null)
  const [isProfileStateLoaded, setIsProfileStateLoaded] = useState(false)
  // 대표 배지/대표 칭호는 더 이상 클릭할 때마다 바로 서버에 저장하지 않는다 — "저장하기" 버튼을
  // 눌러야 반영되고, 안 누르면 화면(이 값들)만 바뀐 채 서버 값은 그대로 남는다. 마지막으로 저장된
  // 값을 따로 들고 있다가 지금 화면 값과 비교해서 "저장 안 한 변경사항" 여부를 판단한다.
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState({ badges: [], titles: [], primaryTitleId: null, primaryBadgeId: null })
  const [showSavedToast, setShowSavedToast] = useState(false)

  // bio/대표 배지·칭호는 계정별 진행도라 로그인한 uid 기준으로 서버(user_state)에서 불러온다.
  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    fetchUserState(user.uid).then((state) => {
      if (cancelled) return
      const loadedBadges = Array.isArray(state[EQUIPPED_BADGES_KEY]) ? state[EQUIPPED_BADGES_KEY] : []
      const loadedTitles = Array.isArray(state[EQUIPPED_TITLES_KEY]) ? state[EQUIPPED_TITLES_KEY] : []
      const loadedPrimaryTitleId = typeof state[PRIMARY_TITLE_KEY] === 'string' ? state[PRIMARY_TITLE_KEY] : null
      const loadedPrimaryBadgeId = typeof state[PRIMARY_BADGE_KEY] === 'string' ? state[PRIMARY_BADGE_KEY] : null
      setBio(typeof state[BIO_KEY] === 'string' ? state[BIO_KEY] : DEFAULT_BIO)
      setEquippedBadgeIds(loadedBadges)
      setEquippedTitleIds(loadedTitles)
      setPrimaryTitleId(loadedPrimaryTitleId)
      setPrimaryBadgeId(loadedPrimaryBadgeId)
      setSavedProfileSnapshot({ badges: loadedBadges, titles: loadedTitles, primaryTitleId: loadedPrimaryTitleId, primaryBadgeId: loadedPrimaryBadgeId })
      setIsProfileStateLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  useEffect(() => {
    if (!isProfileStateLoaded || !user?.uid) return
    saveUserState(user.uid, BIO_KEY, bio)
  }, [bio, isProfileStateLoaded, user?.uid])

  useEffect(() => {
    if (!showSavedToast) return undefined
    const timer = window.setTimeout(() => setShowSavedToast(false), 2500)
    return () => window.clearTimeout(timer)
  }, [showSavedToast])

  useEffect(() => {
    writeMusicVolume(musicVolume)
  }, [musicVolume])

  useEffect(() => {
    writeSfxVolume(sfxVolume)
  }, [sfxVolume])

  const earnedBadges = useMemo(() => quests.achievement.filter((quest) => quest.claimed), [quests.achievement])
  const earnedTitles = useMemo(() => quests.title.filter((quest) => quest.claimed), [quests.title])
  const earnedBadgeIds = useMemo(() => new Set(earnedBadges.map((quest) => quest.id)), [earnedBadges])
  const earnedTitleIds = useMemo(() => new Set(earnedTitles.map((quest) => quest.id)), [earnedTitles])

  const sanitizedEquippedBadgeIds = useMemo(
    () => equippedBadgeIds.filter((id) => earnedBadgeIds.has(id)).slice(0, MAX_EQUIPPED),
    [equippedBadgeIds, earnedBadgeIds],
  )
  const sanitizedEquippedTitleIds = useMemo(
    () => equippedTitleIds.filter((id) => earnedTitleIds.has(id)).slice(0, MAX_EQUIPPED),
    [equippedTitleIds, earnedTitleIds],
  )
  // Ranch.jsx의 목장 프로필 팝업과 같은 방식으로 대표 칭호/대표 배지를 정한다 — 지정한 게 더 이상
  // 장착 목록에 없으면(해제 등) 장착된 첫 번째 것으로 자연스럽게 대체한다.
  const effectivePrimaryTitleId = sanitizedEquippedTitleIds.includes(primaryTitleId)
    ? primaryTitleId
    : sanitizedEquippedTitleIds[0] ?? null
  const effectivePrimaryBadgeId = sanitizedEquippedBadgeIds.includes(primaryBadgeId)
    ? primaryBadgeId
    : sanitizedEquippedBadgeIds[0] ?? null

  // 지금 화면에 적용된 값과 마지막으로 저장된 값이 다르면 "저장하지 않은 변경사항"이 있는 것이다.
  const hasUnsavedProfileChanges = isProfileStateLoaded && (
    JSON.stringify(sanitizedEquippedBadgeIds) !== JSON.stringify(savedProfileSnapshot.badges)
    || JSON.stringify(sanitizedEquippedTitleIds) !== JSON.stringify(savedProfileSnapshot.titles)
    || effectivePrimaryTitleId !== savedProfileSnapshot.primaryTitleId
    || effectivePrimaryBadgeId !== savedProfileSnapshot.primaryBadgeId
  )

  // "저장하기" 버튼을 눌러야만 대표 배지/대표 칭호(와 그중 대표로 지정한 것)를 서버에 반영한다.
  function handleSaveProfileEdits() {
    if (!user?.uid || !isProfileStateLoaded || !isQuestsLoaded) return
    saveUserState(user.uid, EQUIPPED_BADGES_KEY, sanitizedEquippedBadgeIds)
    saveUserState(user.uid, EQUIPPED_TITLES_KEY, sanitizedEquippedTitleIds)
    saveUserState(user.uid, PRIMARY_TITLE_KEY, effectivePrimaryTitleId)
    saveUserState(user.uid, PRIMARY_BADGE_KEY, effectivePrimaryBadgeId)
    setSavedProfileSnapshot({
      badges: sanitizedEquippedBadgeIds,
      titles: sanitizedEquippedTitleIds,
      primaryTitleId: effectivePrimaryTitleId,
      primaryBadgeId: effectivePrimaryBadgeId,
    })
    setShowSavedToast(true)
  }

  function toggleEquippedBadge(id) {
    if (!earnedBadgeIds.has(id)) return
    // 대표 배지로 지정해둔 배지를 해제하면 대표 지정도 같이 풀어준다 — 대표 칭호와 동일한 이유.
    if (equippedBadgeIds.includes(id) && primaryBadgeId === id) {
      setPrimaryBadgeId(null)
    }
    setEquippedBadgeIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= MAX_EQUIPPED) return current
      return [...current, id]
    })
  }

  function toggleEquippedTitle(id) {
    if (!earnedTitleIds.has(id)) return
    // 대표 칭호로 지정해둔 칭호를 해제하면 대표 지정도 같이 풀어준다 — 안 그러면 더 이상 장착돼
    // 있지도 않은 칭호 id가 화면상 대표로 남아 있게 된다. 이것도 "저장하기"를 눌러야 서버에 반영된다.
    if (equippedTitleIds.includes(id) && primaryTitleId === id) {
      setPrimaryTitleId(null)
    }
    setEquippedTitleIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      if (current.length >= MAX_EQUIPPED) return current
      return [...current, id]
    })
  }

  // "보유 칭호" 목록 전용 클릭 동작 — 처음 누르면 장착되고, 이미 장착된 칭호를 한 번 더 누르면
  // 그 칭호가 대표 칭호로 지정된다. 이미 대표로 지정된 칭호를 또 누르면 장착 해제된다. 여기서는
  // 화면 상태만 바뀌고, "저장하기"를 눌러야 서버(및 목장 프로필 팝업의 "칭호 선택")에 반영된다.
  function handleOwnedTitleClick(id) {
    if (!sanitizedEquippedTitleIds.includes(id)) {
      toggleEquippedTitle(id)
      return
    }
    if (effectivePrimaryTitleId === id) {
      toggleEquippedTitle(id)
      return
    }
    setPrimaryTitleId(id)
  }

  // "보유 배지" 목록 전용 클릭 동작 — 대표 칭호와 완전히 같은 3단계 순환(장착 → 대표 지정 → 해제).
  function handleOwnedBadgeClick(id) {
    if (!sanitizedEquippedBadgeIds.includes(id)) {
      toggleEquippedBadge(id)
      return
    }
    if (effectivePrimaryBadgeId === id) {
      toggleEquippedBadge(id)
      return
    }
    setPrimaryBadgeId(id)
  }

  const completedAchievementCount = useMemo(
    () => quests.achievement.filter((quest) => quest.done).length,
    [quests.achievement],
  )
  const achievementPercent = useMemo(() => {
    if (!quests.achievement.length) return 0
    return Math.round((completedAchievementCount / quests.achievement.length) * 100)
  }, [completedAchievementCount, quests.achievement.length])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const editActions = isEditMode ? (
    <div className="inline-flex rounded-full bg-ivory-100 p-1">
      <button
        type="button"
        onClick={() => setActiveEditTab('profile')}
        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          activeEditTab === 'profile' ? 'bg-white text-ink-900 shadow-card' : 'text-ink-700/60'
        }`}
      >
        프로필 수정
      </button>
      <button
        type="button"
        onClick={() => setActiveEditTab('system')}
        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
          activeEditTab === 'system' ? 'bg-white text-ink-900 shadow-card' : 'text-ink-700/60'
        }`}
      >
        시스템 설정
      </button>
    </div>
  ) : null

  const visibleEditTab = isEditMode ? activeEditTab : 'profile'

  return (
    <>
    <FocusedLayout title={isEditMode ? '프로필 수정' : '프로필'} icon="🙂" actions={editActions}>
      <div className={`grid gap-6 md:grid-cols-[220px_1fr] ${isEditMode && visibleEditTab === 'profile' ? 'pb-24' : ''}`}>
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center shadow-card">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-leaf-100 text-4xl" aria-hidden="true">
            {representativeCharacter ? (
              <img src={featuredCharacterImage ?? getRepresentativeCharacterImage(representativeCharacter, growthStage)} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              '🦋'
            )}
          </div>
          <p className="font-bold text-ink-900">{user?.nickname}</p>
          <p className="text-xs font-semibold text-ink-700/60">탐험가</p>
          <p className="text-xs font-semibold text-leaf-600">대표 캐릭터 · {getRepresentativeCharacterStageLabel(growthStage)}</p>
          <GrowthGauge current={growthPoints} max={GROWTH_MAX} compact />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-4 text-center shadow-card">
              <p className="text-xs text-ink-700/70">도감 달성도</p>
              <p className="mt-1 text-xl font-bold text-leaf-600">
                {Math.round((fieldGuideCount / mockUser.fieldGuideTotal) * 100)}%
              </p>
              <p className="text-xs text-ink-700/50 tabular-nums">
                {fieldGuideCount}/{mockUser.fieldGuideTotal}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 text-center shadow-card">
              <p className="text-xs text-ink-700/70">업적 달성도</p>
              <p className="mt-1 text-xl font-bold text-leaf-600">{achievementPercent}%</p>
              <p className="text-xs text-ink-700/50 tabular-nums">
                {completedAchievementCount}/{quests.achievement.length}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 text-center shadow-card">
              <p className="text-xs text-ink-700/70">총 접속 일수</p>
              <p className="mt-1 text-xl font-bold text-leaf-600">{user?.totalLoginDays ?? 0}일</p>
            </div>
          </div>

          {visibleEditTab === 'profile' ? (
            <>
              <div className="rounded-xl bg-white p-4 shadow-card">
                <label className="block">
                  <span className="mb-2 block font-semibold text-ink-900">자기소개</span>
                  <textarea
                    value={bio}
                    maxLength={BIO_MAX_LEN}
                    onChange={(event) => setBio(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-ivory-200 p-3 text-sm outline-none focus:border-leaf-500"
                  />
                  <span className="mt-1 block text-right text-xs text-ink-700/50 tabular-nums">
                    {bio.length}/{BIO_MAX_LEN}
                  </span>
                </label>
                {/* TODO(backend): 실제 금칙어 필터 서버 검증 필요 (profile.md) */}
              </div>

              <div className="rounded-xl bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">대표 배지</p>
                  <span className="text-xs font-semibold text-ink-700/60">
                    {sanitizedEquippedBadgeIds.length}/{MAX_EQUIPPED}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: MAX_EQUIPPED }, (_, index) => {
                    const badgeId = sanitizedEquippedBadgeIds[index] ?? null
                    const badge = badgeId ? earnedBadges.find((quest) => quest.id === badgeId) : null
                    const isPrimary = Boolean(badgeId) && badgeId === effectivePrimaryBadgeId
                    return (
                      <button
                        key={badgeId ?? `empty-badge-${index}`}
                        type="button"
                        disabled={!isEditMode || !badgeId}
                        onClick={() => badgeId && isEditMode && toggleEquippedBadge(badgeId)}
                        className={`grid h-14 w-14 place-items-center rounded-full border p-1 ${
                          badgeId
                            ? isPrimary
                              ? 'border-leaf-600 bg-leaf-100 ring-2 ring-leaf-400'
                              : 'border-leaf-200 bg-leaf-50'
                            : 'border-dashed border-ivory-200 bg-ivory-50 text-ink-700/35'
                        }`}
                        aria-label={badge ? `${badge.badgeName} 배지${isPrimary ? ' (대표 배지)' : ''}` : '빈 배지 칸'}
                      >
                        {badge ? (
                          <img src={badge.badgeImage} alt="" aria-hidden="true" className="h-full w-full object-contain" />
                        ) : (
                          '◌'
                        )}
                      </button>
                    )
                  })}
                </div>
                {isEditMode && <p className="mt-3 text-xs text-ink-700/60">아래 보유 배지에서 선택해 대표 칸에 등록할 수 있습니다.</p>}
              </div>

              <div className="rounded-xl bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">보유 배지</p>
                  <span className="text-xs font-semibold text-ink-700/60">보유 {earnedBadges.length}개</span>
                </div>
                {earnedBadges.length === 0 ? (
                  <p className="text-sm text-ink-700/60">획득한 배지가 아직 없어요. 미션의 업적 미션을 완료해보세요!</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto pr-1">
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                      {earnedBadges.map((badge) => {
                        const equipped = sanitizedEquippedBadgeIds.includes(badge.id)
                        const isPrimary = equipped && effectivePrimaryBadgeId === badge.id
                        return (
                          <button
                            key={badge.id}
                            type="button"
                            onClick={() => handleOwnedBadgeClick(badge.id)}
                            className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
                              isPrimary
                                ? 'border-leaf-600 bg-leaf-100 shadow-card ring-2 ring-leaf-400'
                                : equipped
                                  ? 'border-leaf-500 bg-leaf-50 shadow-card'
                                  : 'border-ivory-200 bg-white hover:border-leaf-300'
                            }`}
                            aria-pressed={equipped}
                            aria-label={`${badge.badgeName} 배지${isPrimary ? ' (대표 배지)' : ''}`}
                          >
                            <img src={badge.badgeImage} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-14 w-14 object-contain" />
                            <span className="text-xs font-bold text-ink-900">{badge.title}</span>
                            <span className="text-[11px] text-ink-700/60">
                              {isPrimary ? '★ 대표 배지 · 탭하여 해제' : equipped ? '등록됨 · 탭하여 대표로 설정' : '탭하여 등록'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">대표 칭호</p>
                  <span className="text-xs font-semibold text-ink-700/60">
                    {sanitizedEquippedTitleIds.length}/{MAX_EQUIPPED}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {Array.from({ length: MAX_EQUIPPED }, (_, index) => {
                    const titleId = sanitizedEquippedTitleIds[index] ?? null
                    const titleQuest = titleId ? earnedTitles.find((quest) => quest.id === titleId) : null
                    const isPrimary = Boolean(titleId) && titleId === effectivePrimaryTitleId
                    return (
                      <button
                        key={titleId ?? `empty-title-${index}`}
                        type="button"
                        disabled={!isEditMode || !titleId}
                        onClick={() => titleId && isEditMode && toggleEquippedTitle(titleId)}
                        className={`min-h-16 rounded-2xl border px-3 py-2 text-center text-[11px] font-bold leading-tight ${
                          titleId
                            ? isPrimary
                              ? 'border-leaf-600 bg-leaf-100 text-ink-900 ring-2 ring-leaf-400'
                              : 'border-leaf-200 bg-leaf-50 text-ink-900'
                            : 'border-dashed border-ivory-200 bg-ivory-50 text-ink-700/35'
                        }`}
                        aria-label={titleQuest ? `${titleQuest.title} 칭호${isPrimary ? ' (대표 칭호)' : ''}` : '빈 칭호 칸'}
                      >
                        {isPrimary && <span aria-hidden="true">★ </span>}
                        {titleQuest ? titleQuest.title : '◌'}
                      </button>
                    )
                  })}
                </div>
                {isEditMode && <p className="mt-3 text-xs text-ink-700/60">아래 보유 칭호에서 선택해 대표 칸에 등록할 수 있습니다.</p>}
              </div>

              <div className="rounded-xl bg-white p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-ink-900">보유 칭호</p>
                  <span className="text-xs font-semibold text-ink-700/60">보유 {earnedTitles.length}개</span>
                </div>
                {earnedTitles.length === 0 ? (
                  <p className="text-sm text-ink-700/60">획득한 칭호가 아직 없어요. 미션의 칭호 미션을 완료해보세요!</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {earnedTitles.map((titleQuest) => {
                        const equipped = sanitizedEquippedTitleIds.includes(titleQuest.id)
                        const isPrimary = equipped && effectivePrimaryTitleId === titleQuest.id
                        return (
                          <button
                            key={titleQuest.id}
                            type="button"
                            onClick={() => handleOwnedTitleClick(titleQuest.id)}
                            className={`flex min-h-20 flex-col justify-center rounded-2xl border px-3 py-3 text-left transition ${
                              isPrimary
                                ? 'border-leaf-600 bg-leaf-100 shadow-card ring-2 ring-leaf-400'
                                : equipped
                                  ? 'border-leaf-500 bg-leaf-50 shadow-card'
                                  : 'border-ivory-200 bg-white hover:border-leaf-300'
                            }`}
                            aria-pressed={equipped}
                            aria-label={`${titleQuest.title} 칭호${isPrimary ? ' (대표 칭호)' : ''}`}
                          >
                            <span className="text-sm font-bold text-ink-900">{titleQuest.title}</span>
                            <span className="mt-1 text-[11px] text-ink-700/60">
                              {isPrimary ? '★ 대표 칭호 · 탭하여 해제' : equipped ? '등록됨 · 탭하여 대표로 설정' : '탭하여 등록'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

            </>
          ) : (
            <div className="rounded-xl bg-white p-4 shadow-card">
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink-900">배경음악(BGM)</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={musicVolume}
                    onChange={(event) => setMusicVolume(Number(event.target.value))}
                    className="w-full accent-leaf-500"
                    aria-label="배경음악 음량 조절"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-700/60">
                    <span>음소거</span>
                    <span className="tabular-nums font-semibold text-ink-900">{musicVolume}%</span>
                    <span>최대</span>
                  </div>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-ink-900">효과음</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={sfxVolume}
                    onChange={(event) => setSfxVolume(Number(event.target.value))}
                    className="w-full accent-leaf-500"
                    aria-label="효과음 음량 조절"
                  />
                  <div className="mt-1 flex items-center justify-between text-xs text-ink-700/60">
                    <span>음소거</span>
                    <span className="tabular-nums font-semibold text-ink-900">{sfxVolume}%</span>
                    <span>최대</span>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-xl bg-ink-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink-800"
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </FocusedLayout>
    {isEditMode && visibleEditTab === 'profile' && (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ivory-200 bg-white/95 px-4 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.1)] backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <span className="text-xs font-semibold text-ink-700/60">
            {hasUnsavedProfileChanges ? '저장하지 않은 변경사항이 있어요.' : showSavedToast ? '저장했어요.' : '변경사항 없음'}
          </span>
          <button
            type="button"
            onClick={handleSaveProfileEdits}
            disabled={!hasUnsavedProfileChanges}
            className="shrink-0 rounded-xl bg-leaf-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-leaf-600 disabled:cursor-not-allowed disabled:bg-ivory-200 disabled:text-ink-700/40"
          >
            저장하기
          </button>
        </div>
      </div>
    )}
    </>
  )
}
