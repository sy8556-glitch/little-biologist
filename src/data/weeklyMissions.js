export const WEEKLY_MISSION_CANDIDATES = [
  { id: 'weekly-exploration', title: '일주일 탐험가', desc: '탐험을 총 10회 완료하기', event: 'exploration_complete', total: 10 },
  { id: 'weekly-insects', title: '곤충 수집가', desc: '목장에서 곤충을 총 5마리 발견하기', event: 'ranch_insect_found', total: 5 },
  { id: 'weekly-guide-register', title: '도감 채우기', desc: '도감에 5종 등록하기', event: 'field_guide_register', total: 5, distinct: true, permanent: true },
  { id: 'weekly-habitats', title: '다양한 서식지', desc: '서로 다른 서식지 3곳을 방문하기', event: 'habitat_visit', total: 3, distinct: true },
  { id: 'weekly-observation', title: '꾸준한 관찰', desc: '서로 다른 곤충의 도감 정보를 5회 확인하기', event: 'field_guide_view', total: 5, distinct: true },
  { id: 'weekly-egg-growth', title: '부화를 기다리며', desc: '알 성장 활동을 총 5회 진행하기', event: 'egg_growth_activity', total: 5 },
  { id: 'weekly-hatch', title: '알 부화 도전', desc: '알을 1개 부화시키기', event: 'egg_hatched', total: 1 },
  { id: 'weekly-busy', title: '복작복작', desc: '서식지에 곤충을 5마리 이상 보유하기', event: 'habitat_population', total: 5, permanent: true },
  { id: 'weekly-friends', title: '함께하는 탐험', desc: '친구 목장을 총 5회 방문하기', event: 'friend_visit', total: 5 },
  { id: 'weekly-daily-streak', title: '성실한 생물학자', desc: '일일 미션을 누적 15개 완료하기', event: 'daily_mission_completed', total: 15 },
]

export const WEEKLY_MISSION_COUNT = 3

export function getWeekKey(date = new Date()) {
  const day = date.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  const monday = new Date(date)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(date.getDate() - daysFromMonday)
  const year = monday.getFullYear()
  const month = String(monday.getMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(monday.getDate()).padStart(2, '0')
  return `${year}-${month}-${dayOfMonth}`
}

export function isCollectionComplete() {
  try {
    const photos = JSON.parse(localStorage.getItem('little-biologist-gold-photos') ?? '{}')
    const sketches = JSON.parse(localStorage.getItem('little-biologist-silver-sketches') ?? '{}')
    const completedSpeciesCount = INSECT_SPECIES.filter((species) => (
      species.registeredRanks?.bronze
      && (species.registeredRanks?.gold || photos[species.id])
      && (species.registeredRanks?.silver || sketches[species.id])
    )).length
    return completedSpeciesCount >= 79
  } catch {
    return false
  }
}

// dateKey/weekKey 기반 시드로 셔플해서, 같은 주에 여러 번 다시 계산돼도(새로고침 등) 매번 다른
// 3개가 뽑히지 않고 그 주 내내 같은 미션 구성을 유지한다.
function createSeededRandom(seedText) {
  let seed = [...seedText].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 2166136261)
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

export function createWeeklyMissions(weekKey, excludedIds = []) {
  const excluded = new Set(excludedIds)
  const available = WEEKLY_MISSION_CANDIDATES.filter((mission) => !excluded.has(mission.id))
  const random = createSeededRandom(`${weekKey}:${[...excluded].sort().join(',')}`)
  for (let i = available.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[available[i], available[j]] = [available[j], available[i]]
  }
  const missions = available.slice(0, WEEKLY_MISSION_COUNT).map((mission) => ({
      ...mission,
      progress: 0,
      claimed: false,
      done: false,
      rewardLeaf: 100,
    }))
  return {
    week: weekKey,
    permanentExcludedIds: [...new Set([
      ...excludedIds,
      ...missions.filter((mission) => mission.permanent).map((mission) => mission.id),
    ])],
    missions,
  }
}
import { INSECT_SPECIES } from './insectSpecies.js'
