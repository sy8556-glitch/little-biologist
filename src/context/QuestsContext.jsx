import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { mockQuests, mockFriends } from '../data/mockData'
import { INSECT_SPECIES } from '../data/insectSpecies'
import { createDailyMissions, getLocalDateKey, DAILY_MISSION_COUNT } from '../data/dailyMissions'
import { createWeeklyMissions, getWeekKey, isCollectionComplete, WEEKLY_MISSION_COUNT } from '../data/weeklyMissions'
import { ACHIEVEMENT_MISSIONS, INITIAL_ACHIEVEMENT_COUNTERS } from '../data/achievementMissions'
import { TITLE_MISSIONS } from '../data/titles'
import {
  createRepresentativeCharacter,
  normalizeRepresentativeCharacter,
  assignAdultSpecies,
  getOwnedRepresentativeCharacters,
  getRepresentativeCharacterImage,
} from '../data/representativeCharacter'
import { reportMissionEvent } from '../utils/missionEvents'
import { playSfx } from '../utils/sound'
import { SFX } from '../utils/sfx'
import { useAuth } from '../router/AuthContext'
import { useCurrency } from './CurrencyContext'
import { fetchUserState, saveUserState } from '../api/userState'

const QuestsContext = createContext(null)
const DAILY_KEY = 'dailyMissions'
const WEEKLY_KEY = 'weeklyMissions'
const ACHIEVEMENT_KEY = 'achievementProgress'
const TITLE_KEY = 'titleClaims'
const TITLE_MISSION_IDS_KEY = 'titleMissionIds'
const REPRESENTATIVE_CHARACTER_KEY = 'representativeCharacter'
const ADULT_HISTORY_KEY = 'representativeAdultHistory'
const PROFILE_CHARACTER_KEY = 'profileCharacterId'
const MISSION_GROUP_KEYS = ['daily', 'weekly', 'achievement']
const MISSION_GROWTH_REWARD = 10
// 예전엔 정적 목록이 너무 길다고(수십 개) 계정마다 12개만 무작위로 골라 보여줬는데, 그러면
// "achievementCount"(완료한 업적 수)를 요구하는 칭호가 표시된 12개 안에서만 세어져서 15개·30개를
// 요구하는 상위 칭호가 영원히 달성 불가능해지는 문제가 있었다. 이제 전체를 다 보여준다.
const RANDOM_ACHIEVEMENT_COUNT = ACHIEVEMENT_MISSIONS.length
const RANDOM_TITLE_COUNT = TITLE_MISSIONS.length

// 뽑을 개수가 전체 목록 길이와 같으면 사실상 전체를 순서만 섞어서 보여주는 셈이다 — 한 번 고르면
// 서버에 저장해 계속 같은 순서를 쓰고, 매번 다시 섞지 않는다.
function pickRandomMissionIds(missions, count) {
  return [...missions]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((mission) => mission.id)
}

function resolveDaily(saved) {
  const today = getLocalDateKey()
  if (saved?.date === today && Array.isArray(saved.missions) && saved.missions.length === DAILY_MISSION_COUNT) return saved
  return createDailyMissions(today)
}

function resolveWeekly(saved) {
  const week = getWeekKey()
  if (saved?.week === week && Array.isArray(saved.missions) && saved.missions.length === WEEKLY_MISSION_COUNT) return saved
  const excludedIds = new Set(saved?.permanentExcludedIds ?? [])
  if (isCollectionComplete()) excludedIds.add('weekly-guide-register')
  const currentPermanent = saved?.missions?.filter((mission) => mission.permanent).map((mission) => mission.id) ?? []
  return createWeeklyMissions(week, [...new Set([...excludedIds, ...currentPermanent])])
}

function resolveAchievementProgress(saved) {
  const next = { ...INITIAL_ACHIEVEMENT_COUNTERS, claimedIds: [], ...(saved || {}) }
  return {
    ...next,
    missionIds: Array.isArray(next.missionIds) && next.missionIds.length === RANDOM_ACHIEVEMENT_COUNT
      ? next.missionIds
      : pickRandomMissionIds(ACHIEVEMENT_MISSIONS, RANDOM_ACHIEVEMENT_COUNT),
  }
}

function resolveTitleClaims(saved) {
  return Array.isArray(saved) ? saved : []
}

function resolveTitleMissionIds(saved) {
  return Array.isArray(saved) && saved.length === RANDOM_TITLE_COUNT
    ? saved
    : pickRandomMissionIds(TITLE_MISSIONS, RANDOM_TITLE_COUNT)
}

function getEventValue(detail) {
  return detail?.value ?? 1
}

function buildAchievementQuests(progress) {
  return ACHIEVEMENT_MISSIONS.map((mission) => {
    const value = Array.isArray(progress[mission.counter]) ? progress[mission.counter].length : progress[mission.counter]
    return { ...mission, progress: Math.min(mission.goal, value ?? 0), total: mission.goal, done: value >= mission.goal, claimed: progress.claimedIds?.includes(mission.id) ?? false, rewardLeaf: 0 }
  }).filter((mission) => progress.missionIds.includes(mission.id))
}

// 칭호는 업적과 달리 별도 이벤트 카운터를 쌓지 않고, 이미 추적 중인 achievementProgress·정적 데이터에서
// 그때그때 파생시킨다.
function buildTitleCounters(progress, achievementDoneCount, loginCount) {
  const registeredSpecies = progress.registeredSpecies ?? []
  const registeredSet = new Set(registeredSpecies)
  const countByHabitat = (habitatId) =>
    INSECT_SPECIES.filter((species) => species.habitatId === habitatId && registeredSet.has(species.id)).length

  return {
    loginCount,
    explorationCount: progress.explorations ?? 0,
    registeredCount: registeredSpecies.length,
    fieldGuideCount: registeredSpecies.length,
    forestRegisteredCount: countByHabitat('forest'),
    pondRegisteredCount: countByHabitat('pond'),
    soilRegisteredCount: countByHabitat('soil'),
    eggGrowthCount: progress.eggGrowthActivities ?? 0,
    eggHatchCount: progress.hatchedEggs ?? 0,
    interiorPlacementCount: progress.interiorPlacements ?? 0,
    allRankCount: (progress.allRanksSpecies ?? []).length,
    achievementCount: achievementDoneCount,
    friendCount: mockFriends.filter((friend) => friend.status === 'accepted').length,
    friendVisitCount: progress.friendVisits ?? 0,
  }
}

function buildTitleQuests(counters, claimedIds, missionIds) {
  return TITLE_MISSIONS.map((mission) => {
    const value = counters[mission.counter] ?? 0
    return {
      ...mission,
      progress: Math.min(mission.goal, value),
      total: mission.goal,
      done: value >= mission.goal,
      claimed: claimedIds.includes(mission.id),
      titleReward: true,
    }
  }).filter((mission) => missionIds.includes(mission.id))
}

export function QuestsProvider({ children }) {
  const { user } = useAuth()
  const [daily, setDaily] = useState(() => createDailyMissions(getLocalDateKey()))
  const [weekly, setWeekly] = useState(() => createWeeklyMissions(getWeekKey(), isCollectionComplete() ? ['weekly-guide-register'] : []))
  const [achievementProgress, setAchievementProgress] = useState(() => resolveAchievementProgress(null))
  const [titleClaimedIds, setTitleClaimedIds] = useState([])
  const [titleMissionIds, setTitleMissionIds] = useState(() => resolveTitleMissionIds(null))
  const [representativeCharacter, setRepresentativeCharacter] = useState(() => createRepresentativeCharacter())
  const [adultHistory, setAdultHistory] = useState([])
  // 가방에서 "선택하기"로 고른, 목장 탐험도우미가 보여줄 대표 캐릭터 id. 지금 자라고 있는 캐릭터
  // ('representative-character-current')일 수도, 이미 성체가 된 지난 캐릭터일 수도 있다 — null이면
  // 항상 현재 캐릭터를 보여준다(기본값).
  const [profileCharacterId, setProfileCharacterId] = useState(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const { addLeaves, addGrowthPoints, growthStage, resetGrowthPoints } = useCurrency()

  // 계정(uid)이 바뀌면(로그인/로그아웃) 서버에 저장된 진행도를 새로 불러온다.
  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    fetchUserState(user.uid).then((state) => {
      if (cancelled) return
      const storedDaily = resolveDaily(state[DAILY_KEY])
      setDaily(storedDaily)
      if (!Array.isArray(state[DAILY_KEY]?.missions) || state[DAILY_KEY].missions.length !== DAILY_MISSION_COUNT) {
        saveUserState(user.uid, DAILY_KEY, storedDaily)
      }
      const storedWeekly = resolveWeekly(state[WEEKLY_KEY])
      setWeekly(storedWeekly)
      if (!Array.isArray(state[WEEKLY_KEY]?.missions) || state[WEEKLY_KEY].missions.length !== WEEKLY_MISSION_COUNT) {
        saveUserState(user.uid, WEEKLY_KEY, storedWeekly)
      }
      const storedAchievementProgress = resolveAchievementProgress(state[ACHIEVEMENT_KEY])
      setAchievementProgress(storedAchievementProgress)
      if (state[ACHIEVEMENT_KEY]?.missionIds?.length !== RANDOM_ACHIEVEMENT_COUNT) {
        saveUserState(user.uid, ACHIEVEMENT_KEY, storedAchievementProgress)
      }
      setTitleClaimedIds(resolveTitleClaims(state[TITLE_KEY]))
      const storedTitleMissionIds = resolveTitleMissionIds(state[TITLE_MISSION_IDS_KEY])
      setTitleMissionIds(storedTitleMissionIds)
      if (state[TITLE_MISSION_IDS_KEY]?.length !== RANDOM_TITLE_COUNT) {
        saveUserState(user.uid, TITLE_MISSION_IDS_KEY, storedTitleMissionIds)
      }
      const storedCharacter = normalizeRepresentativeCharacter(state[REPRESENTATIVE_CHARACTER_KEY])
      if (storedCharacter) {
        setRepresentativeCharacter(storedCharacter)
      } else {
        const nextCharacter = createRepresentativeCharacter()
        setRepresentativeCharacter(nextCharacter)
        saveUserState(user.uid, REPRESENTATIVE_CHARACTER_KEY, nextCharacter)
      }
      setAdultHistory(Array.isArray(state[ADULT_HISTORY_KEY]) ? state[ADULT_HISTORY_KEY] : [])
      setProfileCharacterId(typeof state[PROFILE_CHARACTER_KEY] === 'string' ? state[PROFILE_CHARACTER_KEY] : null)
      setIsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  // 대표 캐릭터의 성장 단계는 CurrencyContext의 growthPoints에서 파생되는 growthStage를 그대로
  // 따라간다 — growthPoints가 오를 때마다(퀘스트 보상·도감 등록 등) 여기서 알→유충→번데기→성충
  // 순으로 자동 반영된다. 알→유충으로 처음 넘어가는 순간에는 egg_hatched 미션 이벤트를 쏴서
  // 관련 업적/주간 미션(부화 배지 등)도 함께 진행되게 한다.
  useEffect(() => {
    if (!isLoaded || representativeCharacter.stage === growthStage) return
    if (representativeCharacter.stage === 'egg' && growthStage !== 'egg') {
      reportMissionEvent({ type: 'egg_hatched' })
    }
    setRepresentativeCharacter((current) => {
      // 성체로 처음 넘어가는 순간, 유충 종류(larvaCategory)에 맞는 실제 도감 종을 뽑아 고정한다.
      const next = growthStage === 'adult' ? assignAdultSpecies({ ...current, stage: growthStage }) : { ...current, stage: growthStage }
      if (user?.uid) saveUserState(user.uid, REPRESENTATIVE_CHARACTER_KEY, next)
      return next
    })
  }, [growthStage, isLoaded, representativeCharacter.stage, user?.uid])

  // 성체 성장 안내 팝업을 닫을 때(CurrencyContext.dismissStageUp) 쏘는 이벤트 — 성체까지 다 자란
  // 대표 캐릭터는 여기서 새로 뽑은 알로 교체되고, 성장포인트도 0으로 리셋돼서 다음 캐릭터가
  // 다시 알부터 자라기 시작한다.
  useEffect(() => {
    if (!isLoaded) return
    const onAdultReached = () => {
      // 방금 성체가 된 캐릭터는 사라지는 게 아니라 adultHistory에 남아서 가방에 계속 보인다 —
      // 새로 뽑은 알과 별개다.
      const grownAdult = { ...representativeCharacter, stage: 'adult' }
      const nextHistory = [grownAdult, ...adultHistory].slice(0, 20)
      setAdultHistory(nextHistory)
      if (user?.uid) saveUserState(user.uid, ADULT_HISTORY_KEY, nextHistory)

      const nextCharacter = createRepresentativeCharacter()
      setRepresentativeCharacter(nextCharacter)
      if (user?.uid) saveUserState(user.uid, REPRESENTATIVE_CHARACTER_KEY, nextCharacter)
      resetGrowthPoints()
      playSfx(SFX.newEgg)
    }
    window.addEventListener('little-biologist:adult-reached', onAdultReached)
    return () => window.removeEventListener('little-biologist:adult-reached', onAdultReached)
  }, [adultHistory, isLoaded, representativeCharacter, resetGrowthPoints, user?.uid])

  // quests는 daily/weekly/achievementProgress/titleClaimedIds로부터 매번 파생시킨다(별도 상태로 들고
  // 이중 관리하지 않음) — claim()/이벤트 핸들러는 저 원본 상태들만 갱신하면 된다.
  const achievementQuests = useMemo(() => buildAchievementQuests(achievementProgress), [achievementProgress])
  const titleCounters = useMemo(
    () => buildTitleCounters(achievementProgress, achievementQuests.filter((quest) => quest.done).length, user?.totalLoginDays ?? 0),
    [achievementProgress, achievementQuests, user?.totalLoginDays]
  )
  const titleQuests = useMemo(() => buildTitleQuests(titleCounters, titleClaimedIds, titleMissionIds), [titleCounters, titleClaimedIds, titleMissionIds])
  const quests = useMemo(
    () => ({ ...mockQuests, daily: daily.missions, weekly: weekly.missions, achievement: achievementQuests, title: titleQuests }),
    [daily.missions, weekly.missions, achievementQuests, titleQuests]
  )

  useEffect(() => {
    if (!isLoaded || !user?.uid) return
    saveUserState(user.uid, TITLE_KEY, titleClaimedIds)
  }, [titleClaimedIds, isLoaded, user?.uid])

  useEffect(() => {
    if (!isLoaded) return
    const refreshMissions = () => {
      const today = getLocalDateKey()
      const week = getWeekKey()
      if (daily.date !== today) {
        const nextDaily = createDailyMissions(today)
        setDaily(nextDaily)
        if (user?.uid) saveUserState(user.uid, DAILY_KEY, nextDaily)
      }
      if (weekly.week !== week) {
        const currentPermanent = weekly.missions?.filter((mission) => mission.permanent).map((mission) => mission.id) ?? []
        const nextWeekly = createWeeklyMissions(week, [...new Set([...(weekly.permanentExcludedIds ?? []), ...currentPermanent])])
        setWeekly(nextWeekly)
        if (user?.uid) saveUserState(user.uid, WEEKLY_KEY, nextWeekly)
      }
    }
    const timer = window.setInterval(refreshMissions, 60 * 1000)
    return () => window.clearInterval(timer)
  }, [daily.date, weekly.week, weekly.permanentExcludedIds, isLoaded, user?.uid])

  useEffect(() => {
    if (!isLoaded) return
    const handleMissionEvent = (event) => {
      const detail = event.detail ?? {}
      const eventName = detail.type ?? detail
      if (!eventName) return

      // addGrowthPoints는 CurrencyContext의 상태를 바꾸는 부수효과라, setAchievementProgress의
      // updater(순수해야 함, StrictMode에서 두 번 호출될 수 있음) 안이 아니라 여기서 한 번만 호출한다.
      if (eventName === 'field_guide_register') addGrowthPoints(5)

      setAchievementProgress((saved) => {
        const next = { ...saved, rankState: { ...(saved.rankState ?? {}) } }
        const addToSet = (key) => {
          if (detail.entityId == null) return
          next[key] = [...new Set([(Array.isArray(next[key]) ? next[key] : []), detail.entityId].flat())]
        }
        if (eventName === 'ranch_insect_found') next.ranchDiscoveries += getEventValue(detail)
        if (eventName === 'drawing_register') addToSet('drawings')
        if (eventName === 'exploration_complete') next.explorations += getEventValue(detail)
        if (eventName === 'photo_register') addToSet('photos')
        if (eventName === 'field_guide_register') addToSet('registeredSpecies')
        if (eventName === 'rank_up' && detail.entityId != null) {
          next.rankState[detail.entityId] = { ...(next.rankState[detail.entityId] ?? { bronze: true }), [detail.rank]: true }
          if (next.rankState[detail.entityId].bronze && next.rankState[detail.entityId].gold && next.rankState[detail.entityId].silver) {
            next.allRanksSpecies = [...new Set([...(next.allRanksSpecies ?? []), detail.entityId])]
          }
        }
        if (eventName === 'egg_hatched') next.hatchedEggs += getEventValue(detail)
        if (eventName === 'egg_growth_activity') next.eggGrowthActivities += getEventValue(detail)
        if (eventName === 'interior_place') next.interiorPlacements += getEventValue(detail)
        if (eventName === 'daily_mission_completed') next.dailyMissionsCompleted += getEventValue(detail)
        if (eventName === 'friend_add') next.friendsAdded += getEventValue(detail)
        if (eventName === 'friend_visit') next.friendVisits += getEventValue(detail)
        if (user?.uid) saveUserState(user.uid, ACHIEVEMENT_KEY, next)
        return next
      })

      setDaily((saved) => {
        const nextMissions = saved.missions.map((quest) => (
          quest.event === eventName && !quest.claimed
            ? { ...quest, progress: Math.min(quest.total, quest.progress + getEventValue(detail)), done: true }
            : quest
        ))
        const persisted = { ...saved, missions: nextMissions }
        if (user?.uid) saveUserState(user.uid, DAILY_KEY, persisted)
        return persisted
      })

      setWeekly((saved) => {
        const nextMissions = saved.missions.map((quest) => {
          if (quest.event !== eventName || quest.claimed) return quest
          if (eventName === 'habitat_population') {
            const population = Math.max(0, Number(detail.value) || 0)
            const progress = Math.min(quest.total, Math.max(quest.progress ?? 0, population))
            return { ...quest, progress, done: progress >= quest.total }
          }
          if (quest.distinct) {
            const entityId = detail.entityId
            if (entityId == null || quest.seenIds?.includes(entityId)) return quest
            const seenIds = [...(quest.seenIds ?? []), entityId]
            return { ...quest, seenIds, progress: Math.min(quest.total, seenIds.length), done: seenIds.length >= quest.total }
          }
          const progress = Math.min(quest.total, quest.progress + getEventValue(detail))
          return { ...quest, progress, done: progress >= quest.total }
        })
        const newlyCompleted = nextMissions.filter((mission) => mission.done && mission.permanent).map((mission) => mission.id)
        const collectionCompleted = eventName === 'field_guide_register' && isCollectionComplete()
        const permanentExcludedIds = [...new Set([
          ...(saved.permanentExcludedIds ?? []),
          ...newlyCompleted,
          ...(collectionCompleted ? ['weekly-guide-register'] : []),
        ])]
        const persisted = { ...saved, missions: nextMissions, permanentExcludedIds }
        if (user?.uid) saveUserState(user.uid, WEEKLY_KEY, persisted)
        return persisted
      })
    }
    window.addEventListener('little-biologist:mission', handleMissionEvent)
    return () => window.removeEventListener('little-biologist:mission', handleMissionEvent)
  }, [isLoaded, user?.uid])

  const claim = (tab, id) => {
    const quest = quests[tab]?.find((q) => q.id === id)
    if (!quest || quest.claimed || !quest.done) return
    if (tab === 'daily') {
      setDaily((saved) => {
        const next = { ...saved, missions: saved.missions.map((q) => (q.id === id ? { ...q, claimed: true } : q)) }
        if (user?.uid) saveUserState(user.uid, DAILY_KEY, next)
        return next
      })
      reportMissionEvent({ type: 'daily_mission_completed' })
    }
    if (tab === 'weekly') {
      setWeekly((saved) => {
        const next = { ...saved, missions: saved.missions.map((q) => (q.id === id ? { ...q, claimed: true } : q)) }
        if (user?.uid) saveUserState(user.uid, WEEKLY_KEY, next)
        return next
      })
    }
    if (tab === 'achievement') {
      setAchievementProgress((saved) => {
        const next = { ...saved, claimedIds: [...new Set([...(saved.claimedIds ?? []), id])] }
        if (user?.uid) saveUserState(user.uid, ACHIEVEMENT_KEY, next)
        return next
      })
    }
    if (tab === 'title') {
      setTitleClaimedIds((current) => (current.includes(id) ? current : [...current, id]))
    }
    addLeaves(quest.rewardLeaf ?? 100)
    addGrowthPoints(MISSION_GROWTH_REWARD)
  }

  const pendingCount = MISSION_GROUP_KEYS.concat('title').flatMap((key) => quests[key] ?? []).filter(
    (quest) => !quest.claimed && quest.done
  ).length

  // 실제 도감 등록 개수(계정별). Profile/Ranch에서 정적 mockUser.fieldGuideCount 대신 이 값을 쓴다.
  const fieldGuideCount = achievementProgress.registeredSpecies?.length ?? 0

  // 가방 '대표 캐릭터' 탭에서 "선택하기"를 누르면 호출된다 — 목장 탐험도우미가 앞으로 이 캐릭터를
  // 보여준다(성장은 계속 현재 캐릭터 기준으로 진행됨, 어디까지나 화면에 뭘 보여줄지 고르는 것).
  const selectProfileCharacter = (id) => {
    setProfileCharacterId(id)
    if (user?.uid) saveUserState(user.uid, PROFILE_CHARACTER_KEY, id)
  }

  // 탐험도우미(목장 버튼·튜토리얼 대사·미션 화면 캐릭터 대사 등, "안내 캐릭터" 역할을 하는 모든
  // 화면)가 공통으로 써야 할 이미지 — 가방에서 고른 대표 캐릭터가 있으면 그걸, 없으면(아직 아무것도
  // 선택 안 함) 지금 자라고 있는 캐릭터를 기본값으로 보여준다. 실제 성장 이벤트를 보여주는
  // GrowthStageModal/EggFirstRevealEffect는 여기가 아니라 계속 representativeCharacter를 직접 쓴다
  // (그 화면들은 "지금 자라는 애" 본인이 주인공이라 선택과 무관해야 한다).
  const ownedCharacters = getOwnedRepresentativeCharacters(representativeCharacter, adultHistory)
  const selectedCharacter = ownedCharacters.find((c) => c.id === profileCharacterId) ?? ownedCharacters[0] ?? null
  const featuredCharacterImage = selectedCharacter?.image ?? getRepresentativeCharacterImage(representativeCharacter) ?? null

  return (
    <QuestsContext.Provider
      value={{
        quests,
        claim,
        pendingCount,
        fieldGuideCount,
        representativeCharacter,
        adultHistory,
        profileCharacterId,
        selectProfileCharacter,
        featuredCharacterImage,
        missionGrowthReward: MISSION_GROWTH_REWARD,
        // Profile.jsx가 자기 자신의 fetchUserState(장착 배지/칭호)와 이 컨텍스트의 fetchUserState
        // (업적/칭호 달성 여부, quests.title/achievement의 근거)를 각각 따로 불러오는데, 두 요청의
        // 완료 순서가 보장되지 않는다 — 이 값이 아직 false인 동안 quests.title/achievement로
        // "보유 여부"를 걸러내면 아직 하나도 안 딴 것처럼 보여서, 장착 목록을 빈 배열로 잘못
        // 저장해버리는 사고가 난다(그 계정이 만든 실제 버그: 대표 칭호가 초기화되는 것처럼 보임).
        isLoaded,
      }}
    >
      {children}
    </QuestsContext.Provider>
  )
}

export function useQuests() {
  const ctx = useContext(QuestsContext)
  if (!ctx) throw new Error('useQuests must be used within QuestsProvider')
  return ctx
}
