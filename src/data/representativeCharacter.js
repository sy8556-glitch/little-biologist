// 대표 캐릭터(내 알): 회원가입 시 6종 중 하나를 무작위로 배정한다. growthPoints(CurrencyContext.jsx)가
// 쌓일 때마다 알 → 유충 → 번데기 → 성충 순으로 자동 성장하며(getRepresentativeStage), 유충 단계에서는
// 17가지 유충 종류(larvaCategory) 중 하나로 자라고, 성체가 되는 순간 그 유충 종류에 맞는 실제 도감
// 종 하나를 무작위로 뽑아 그 종 전용 성체 일러스트(도감 사진이 아니라 대표 캐릭터 전용 원화,
// public/representative-character/adult/{2자리 도감 id}.png)를 평생 그대로 쓴다.
import { INSECT_SPECIES, getSpeciesByCategory } from './insectSpecies.js'

const CHARACTER_BASE_PATH = '/representative-character'
const CHARACTER_COUNT = 6 // 알1~6.png, 번데기1~6.png 개수

export const GROWTH_MAX = 30
export const REPRESENTATIVE_STAGES = ['egg', 'larva', 'pupa', 'adult']

const STAGE_LABELS = {
  egg: '알',
  larva: '유충',
  pupa: '번데기',
  adult: '성충',
}

// 유충 원화(public/representative-character/larva/*.png, 17종류) → 도감 종 분류(insectSpecies.js의
// SPECIES_CATEGORY/getSpeciesByCategory) 매핑. 이름이 그대로 대응되는 건 1:1로, 전용 유충 그림이
// 없는 분류(매미충/사마귀/무작위 등)는 상식적으로 제일 가까운 유충 그림에 묶었다.
const LARVA_CATEGORIES = {
  ant: ['ant'],
  bee: ['bee'],
  beetle: ['beetle', 'random'],
  butterfly: ['butterfly'],
  cicada: ['cicada'],
  dragonfly: ['dragonfly'],
  etc: ['etc'],
  event: ['event'],
  'grasshopper-mantis': ['grasshopper', 'mantis'],
  ladybug: ['ladybug'],
  'leaf-beetle': ['leaf-beetle'],
  'longhorn-beetle': ['longhorn-beetle'],
  moth: ['moth'],
  'stag-beetle': ['stag-beetle'],
  'stink-bug': ['stink-bug', 'planthopper'],
  aquatic: ['aquatic'],
  wasp: ['wasp'],
}
const LARVA_CATEGORY_IDS = Object.keys(LARVA_CATEGORIES)

// seedIndex가 없으면(성체로 막 자라나는 순간) 무작위로, 있으면(speciesId를 아직 못 구한 예전
// 데이터를 화면에 보여줘야 할 때) index로 결정되는 고정된 종을 골라서 매번 다른 종으로
// 깜빡이지 않게 한다.
function pickAdultSpeciesId(larvaCategory, seedIndex = null) {
  const categoryIds = LARVA_CATEGORIES[larvaCategory] ?? LARVA_CATEGORIES.etc
  const pool = categoryIds.flatMap((categoryId) => getSpeciesByCategory(categoryId))
  if (!pool.length) return null
  const i = seedIndex == null ? Math.floor(Math.random() * pool.length) : seedIndex % pool.length
  return pool[i].id
}

function buildAdultImagePath(speciesId) {
  if (speciesId == null) return null
  return encodeURI(`${CHARACTER_BASE_PATH}/adult/${String(speciesId).padStart(2, '0')}.png`)
}

export function getRepresentativeStage(growthPoints = 0) {
  const points = Math.max(0, Math.min(GROWTH_MAX, Number(growthPoints) || 0))
  return REPRESENTATIVE_STAGES[Math.min(REPRESENTATIVE_STAGES.length - 1, Math.floor(points / 10))]
}

export function createRepresentativeCharacter(
  index = Math.floor(Math.random() * CHARACTER_COUNT),
  larvaCategory = LARVA_CATEGORY_IDS[Math.floor(Math.random() * LARVA_CATEGORY_IDS.length)]
) {
  return { index, stage: 'egg', larvaCategory, speciesId: null }
}

export function normalizeRepresentativeCharacter(value) {
  if (!value || typeof value !== 'object') return null
  const index = Number.isInteger(value.index) && value.index >= 0 && value.index < CHARACTER_COUNT ? value.index : null
  if (index === null) return null
  const stage = REPRESENTATIVE_STAGES.includes(value.stage) ? value.stage : 'egg'
  const larvaCategory = LARVA_CATEGORY_IDS.includes(value.larvaCategory)
    ? value.larvaCategory
    : LARVA_CATEGORY_IDS[index % LARVA_CATEGORY_IDS.length]
  const speciesId = Number.isInteger(value.speciesId) ? value.speciesId : null
  return { index, stage, larvaCategory, speciesId }
}

// 성체 단계로 처음 넘어가는 순간 QuestsContext.jsx가 호출한다 — 이미 speciesId가 있으면 그대로
// 두고(한 번 정해진 종은 안 바뀜), 없으면 유충 종류에 맞는 실제 도감 종을 무작위로 뽑아 고정한다.
export function assignAdultSpecies(character) {
  const normalized = normalizeRepresentativeCharacter(character)
  if (!normalized) return character
  if (normalized.speciesId != null) return normalized
  return { ...normalized, speciesId: pickAdultSpeciesId(normalized.larvaCategory) }
}

export function getRepresentativeCharacterImage(character, stage = character?.stage || 'egg') {
  const normalized = normalizeRepresentativeCharacter(character)
  if (!normalized) return null
  if (stage === 'adult') {
    const speciesId = normalized.speciesId ?? pickAdultSpeciesId(normalized.larvaCategory, normalized.index)
    return buildAdultImagePath(speciesId)
  }
  if (stage === 'larva') return encodeURI(`${CHARACTER_BASE_PATH}/larva/${normalized.larvaCategory}.png`)
  if (stage === 'pupa') return encodeURI(`${CHARACTER_BASE_PATH}/pupa/번데기${normalized.index + 1}.png`)
  return encodeURI(`${CHARACTER_BASE_PATH}/egg/알${normalized.index + 1}.png`)
}

export function getRepresentativeCharacterStageLabel(stage) {
  return STAGE_LABELS[stage] ?? STAGE_LABELS.egg
}

// 알 -> 애벌레로 성장할 때 GrowthStageModal에서 보여줄 균열 진행 3단계 이미지.
// 알 색상(index)별로 egg-crack/알{n}(1~3).png 세 장이 미리 준비되어 있다.
export function getRepresentativeCharacterEggCrackImages(character) {
  const normalized = normalizeRepresentativeCharacter(character)
  if (!normalized) return []
  return [1, 2, 3].map((step) => encodeURI(`${CHARACTER_BASE_PATH}/egg-crack/알${normalized.index + 1}(${step}).png`))
}

// 성체 단계일 때 실제 종 이름(예: "톱사슴벌레")을 보여주고 싶은 화면(가방 등)에서 쓴다.
export function getRepresentativeSpeciesName(character) {
  const normalized = normalizeRepresentativeCharacter(character)
  if (!normalized) return null
  const speciesId = normalized.speciesId ?? pickAdultSpeciesId(normalized.larvaCategory, normalized.index)
  return INSECT_SPECIES.find((species) => species.id === speciesId)?.name ?? null
}

// 가방 '대표 캐릭터' 탭(Bag.jsx)과 목장 프로필 팝업의 캐릭터 선택 UI가 공유하는 "보유한 대표
// 캐릭터 목록". 현재 기르고 있는 캐릭터 1개 + 성체까지 다 키워서 새 알로 넘어간 지난 성체들
// (adultHistory, QuestsContext.jsx가 관리)을 함께 보여준다.
export function getOwnedRepresentativeCharacters(character, adultHistory = []) {
  const items = []
  const currentImage = getRepresentativeCharacterImage(character)
  if (currentImage) {
    items.push({
      id: 'representative-character-current',
      name: `대표 캐릭터 ${getRepresentativeCharacterStageLabel(character?.stage)}`,
      category: 'egg',
      image: currentImage,
      sourceCharacter: character,
    })
  }
  adultHistory.forEach((pastCharacter, index) => {
    const image = getRepresentativeCharacterImage(pastCharacter, 'adult')
    if (!image) return
    const speciesName = getRepresentativeSpeciesName(pastCharacter)
    items.push({
      // historyId(고유값)가 있으면 그걸 쓴다 — 배열 인덱스를 그대로 id로 쓰면, 새 성체가
      // adultHistory 앞쪽에 추가될 때마다 기존 항목들의 인덱스가 하나씩 밀려서, 이미
      // profileCharacterId로 저장해둔 "선택"이 완전히 다른(엉뚱한) 캐릭터를 가리키게 되는
      // 버그가 있었다 — 인덱스는 legacy 데이터(historyId 없음) 대비용 폴백일 뿐이다.
      id: pastCharacter.historyId ? `representative-character-adult-${pastCharacter.historyId}` : `representative-character-adult-${index}`,
      name: speciesName ? `${speciesName} (성체)` : '성체가 된 대표 캐릭터',
      category: 'egg',
      image,
      sourceCharacter: pastCharacter,
    })
  })
  return items
}

// 가방에서 고른 대표 캐릭터(지금 자라는 중이거나, 이미 성체까지 큰 지난 캐릭터)를 대화 상대
// 자신의 정체성으로 써야 하는 화면(AiCompanion 등)이 쓴다 — 가방 선택과 무관하게 항상 "지금
// 자라는 애"를 보여줘야 하는 GrowthStageModal류와 달리, 여기는 profileCharacterId를 따라간다.
export function getFeaturedCharacterIdentity(character, adultHistory = [], profileCharacterId = null) {
  const owned = getOwnedRepresentativeCharacters(character, adultHistory)
  const selected = owned.find((item) => item.id === profileCharacterId) ?? owned[0] ?? null

  if (!selected || selected.id === 'representative-character-current') {
    const stage = character?.stage ?? 'egg'
    if (stage === 'adult') {
      const speciesName = getRepresentativeSpeciesName(character)
      return { name: speciesName || getRepresentativeCharacterStageLabel(stage), speciesName }
    }
    return { name: getRepresentativeCharacterStageLabel(stage), speciesName: null }
  }

  const speciesName = getRepresentativeSpeciesName(selected.sourceCharacter)
  return { name: speciesName || '대표 캐릭터', speciesName }
}
