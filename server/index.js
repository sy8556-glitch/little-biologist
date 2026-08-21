import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import OpenAI from 'openai'
import sharp from 'sharp'
import { INSECT_SPECIES, HABITATS, getInsectSpecies, getHabitatStats, DEMO_ACCOUNT_USERNAME } from '../src/data/insectSpecies.js'
import { getClipPredictor, predictDrawing, SPECIES as CLIP_SPECIES } from './clipPredictor.js'
import { pool, dbReady, generateUid, hashPassword, verifyPassword } from './db.js'
import { createRepresentativeCharacter } from '../src/data/representativeCharacter.js'

// predict_insect.py를 서버 사이드로 옮긴 것. iNaturalist 개인 토큰을 프론트엔드 번들에
// 노출하지 않기 위해, 사진 업로드는 항상 이 프록시를 거쳐 iNaturalist API를 호출한다.
const TARGET_SPECIES = INSECT_SPECIES.map((s) => ({ name: s.name, scientificName: s.scientificName || null, feature: s.feature || '' }))
const TARGET_NAMES = TARGET_SPECIES.map((s) => s.name)
const TOP_K = 3
// 그림 업로드 시 사용자가 적은 부연 설명 하나당 이 정도까지만 신뢰도에 더한다. iNaturalist는
// 이미지만 보고 점수를 매기므로, 아이가 적은 한글 특징 설명은 이 텍스트 매칭으로 보조한다
// (텍스트만으로 확정하진 않고, 이미지 인식 결과가 있는 후보 사이의 순서만 조정한다).
const DESCRIPTION_BOOST_PER_KEYWORD = 4
const DESCRIPTION_BOOST_MAX = 20

function getDescriptionBoost(description, feature) {
  if (!description || !feature) return 0
  const keywords = description
    .split(/[\s,.!?~/·]+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
  if (!keywords.length) return 0
  const matchCount = keywords.filter((word) => feature.includes(word)).length
  return Math.min(DESCRIPTION_BOOST_MAX, matchCount * DESCRIPTION_BOOST_PER_KEYWORD)
}

function normalizeSci(name) {
  return (name || '').trim().toLowerCase()
}

// 학명은 iNaturalist가 항상 내려주므로 1순위 매칭 기준으로 쓴다. 종(species)까지 아는 항목은
// 속+종을 비교하고, 속(genus)까지만 확신하는 항목(insectSpecies.js 주석 참고)은 속만 비교해서
// 아종/세부종 표기 차이에도 매칭되게 한다.
function sciMatches(apiSciName, targetSciName) {
  if (!apiSciName || !targetSciName) return false
  const apiWords = normalizeSci(apiSciName).split(/\s+/)
  const targetWords = normalizeSci(targetSciName).split(/\s+/)
  if (apiWords[0] !== targetWords[0]) return false
  if (targetWords.length >= 2) return apiWords[1] === targetWords[1]
  return true
}

// 스마트폰 카메라 원본 사진은 8MB를 쉽게 넘기기 때문에(특히 고화소 기종), 넉넉하게 20MB로 둔다.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
const app = express()
app.use(cors())

const PORT = process.env.PORT || 5174
const INAT_TOKEN = process.env.INATURALIST_JWT
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null

// 선택한 도감 이미지를 GPT에 함께 전달할 수 있도록 요청 본문 크기를 넉넉하게 허용한다.
app.use(express.json({ limit: '10mb' }))

const MIN_DRAWING_INK_PIXELS = 10
const MIN_DRAWING_BOUNDS = 2

// 캔버스를 거의 그리지 않고 바로 제출한 빈 그림을 CLIP에 보내기 전에 걸러낸다.
async function analyzeDrawingBuffer(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const width = info.width || 0
  const height = info.height || 0
  let inkPixels = 0
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] <= 8) continue

    inkPixels += 1
    const pixelIndex = index / 4
    const x = pixelIndex % width
    const y = Math.floor(pixelIndex / width)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }

  if (!inkPixels) {
    return { hasInk: false, inkPixels: 0, boundsWidth: 0, boundsHeight: 0 }
  }

  const boundsWidth = maxX - minX + 1
  const boundsHeight = maxY - minY + 1
  const hasMeaningfulInk =
    inkPixels >= MIN_DRAWING_INK_PIXELS &&
    boundsWidth >= MIN_DRAWING_BOUNDS &&
    boundsHeight >= MIN_DRAWING_BOUNDS

  return { hasInk: hasMeaningfulInk, inkPixels, boundsWidth, boundsHeight }
}

// CLIP과 79종 후보 텍스트 임베딩을 서버 시작 시 한 번만 불러와 캐시한다. 모델을 처음 내려받는
// 동안에도 서버 자체는 떠 있고, 그 사이 들어온 예측 요청은 같은 싱글턴 프라미스를 기다린다.
getClipPredictor().then(() => console.log(`[clip] ready: ${CLIP_SPECIES.length} candidates cached`)).catch((error) => console.error('[clip] startup failed:', error.message))

app.post('/api/predict-drawing', upload.single('file'), async (req, res) => {
  if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: 'EMPTY_FILE' })
  try {
    const drawingStats = await analyzeDrawingBuffer(req.file.buffer)
    if (!drawingStats.hasInk) {
      return res.status(400).json({ success: false, error: 'EMPTY_DRAWING' })
    }
    const predictions = await predictDrawing(req.file.buffer, req.body?.hint_text || '')
    return res.json({ success: true, engine_version: 'node-clip-v2-hard-filter', predictions })
  } catch (error) {
    console.error('[predict-drawing] failed:', error)
    return res.status(503).json({ success: false, error: 'CLIP_UNAVAILABLE', message: 'CLIP 모델을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' })
  }
})

app.post('/api/classify-insect', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'NO_IMAGE' })
  }
  if (!INAT_TOKEN) {
    return res.status(500).json({ error: 'MISSING_TOKEN' })
  }

  try {
    const form = new FormData()
    form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname)
    form.append('locale', 'ko')

    const inatResponse = await fetch('https://api.inaturalist.org/v1/computervision/score_image', {
      method: 'POST',
      headers: { Authorization: INAT_TOKEN },
      body: form,
    })

    if (!inatResponse.ok) {
      return res.status(inatResponse.status).json({ error: 'INATURALIST_API_ERROR', status: inatResponse.status })
    }

    const data = await inatResponse.json()
    const results = data.results || []

    // 79종 리스트(insectSpecies.js)와 매칭되는 후보만 신뢰도 순으로 추린다. 학명 매칭을 우선 시도하고
    // (한국어 이름이 iNaturalist에 없는 외래종도 잡힘), 학명이 없거나 안 맞으면 한국어 이름으로 보조 매칭한다.
    const matched = []
    for (const result of results) {
      const taxon = result.taxon || {}
      const commonName = taxon.preferred_common_name || ''
      const apiSciName = taxon.name || ''
      // combined_score는 iNaturalist API가 이미 0~100 스케일로 반환한다 (0~1 스케일이 아님).
      const score = Math.max(0, Math.min(100, result.combined_score || 0))
      const target = TARGET_SPECIES.find(
        (t) => sciMatches(apiSciName, t.scientificName) || (commonName && commonName.includes(t.name))
      )
      if (target && !matched.some((m) => m.name === target.name)) {
        // Math.round는 0.x%대의 낮지만 실재하는 일치율을 0%로 뭉개버려서, 실제로 찾아낸 후보인데도
        // "일치율 0%"로 보여 마치 못 찾은 것처럼 보이는 버그가 있었다. 소수점 둘째 자리까지 보존하고,
        // 점수가 0보다 크면 최소 0.01%는 보이게 한다(진짜 0점인 경우만 0%로 남는다).
        const confidence = score > 0 ? Math.max(0.01, Number(score.toFixed(2))) : 0
        matched.push({ name: target.name, commonName, scientificName: apiSciName, confidence, feature: target.feature })
      }
    }

    // 그림 업로드 화면에서 적은 부연 설명이 있으면, 그 특징 문장과 겹치는 후보의 신뢰도를 살짝 올려서
    // 이미지만으로는 순위가 애매한 후보들 사이에서 더 정확한 쪽이 위로 오게 돕는다.
    const description = (req.body?.description || '').trim()
    if (description) {
      for (const candidate of matched) {
        candidate.confidence = Math.min(100, candidate.confidence + getDescriptionBoost(description, candidate.feature))
      }
    }

    matched.sort((a, b) => b.confidence - a.confidence)
    matched.forEach((candidate) => delete candidate.feature)

    // 후보는 항상 우리 종 리스트(TARGET_NAMES) 안에서만 고른다. 매칭된 게 3개 미만이면
    // 아직 안 쓰인 종 이름을 신뢰도 0으로 채워서 목록 밖 학명이 섞여 나오지 않게 한다.
    // TARGET_NAMES를 순서 그대로 돌면 항상 배열 맨 앞 종들(장수풍뎅이 등)만 채워져서, 실제
    // 일치하는 후보가 적은 사진마다 매번 똑같은 종만 뜨는 것처럼 보였다 — 채울 때는 무작위로 고른다.
    const candidates = matched.slice(0, TOP_K)
    const usedNames = new Set(candidates.map((c) => c.name))

    const fillerNames = TARGET_NAMES.filter((name) => !usedNames.has(name))
    for (let i = fillerNames.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[fillerNames[i], fillerNames[j]] = [fillerNames[j], fillerNames[i]]
    }
    for (const name of fillerNames) {
      if (candidates.length >= TOP_K) break
      candidates.push({ name, commonName: name, scientificName: '', confidence: 0 })
    }

    res.json({ candidates })
  } catch (err) {
    console.error('[classify-insect] failed:', err)
    res.status(500).json({ error: 'SERVER_ERROR' })
  }
})

// AI 말벗 챗봇(ai-companion.md) — 원래 별도 Python(FastAPI) 서버로 만들어졌던 것을, 이미 있는 이
// Express 프록시 하나로 합쳤다(runtime을 Node/Python 둘로 늘리지 않기 위해). 세션별 대화 기록은
// 재시작하면 사라지는 인메모리 저장소로 충분하다(데모 범위).
const chatSessions = new Map()
const DANGEROUS_WORDS = ['죽이고', '잡아먹', '불로 태워', '독을 만들', '다치게', '폭발', '무기']
const SAFE_REDIRECT = '그건 다칠 수 있어서 도와줄 수 없어. 곤충은 눈으로만 관찰하고, 어른에게 함께 봐 달라고 하자!'

function isDangerous(message) {
  return DANGEROUS_WORDS.some((word) => message.includes(word))
}

function buildSystemPrompt(context) {
  const observed = context.observedInsect || {}
  const guide = context.fieldGuide || {}
  const persona = context.persona || {}
  const personaVoice = persona.voice || '다정하고 호기심을 키워 주는 자연 선생님'
  const companionName = context.companionName || '알'

  const contextText = `현재 학습 주제 곤충: ${observed.name || '없음'} `
    + `(이미지 경로: ${observed.image || '없음'}, 발견 장소: ${observed.habitat || '알 수 없음'}). `
    + `도감 설명: ${observed.feature || '등록된 설명 없음'}. `
    + `도감 등록: ${guide.registered ?? '?'}/${guide.total ?? '?'}종.`

  return `너는 어린이 자연·곤충 탐험 앱에서 아이가 기르고 있는 대표 캐릭터 '${companionName}'이야. 말투는 '${personaVoice}'이고, 목적은 어린이가 질문과 답변을 통해 곤충을 공부하도록 돕는 거야.
역할 규칙: 너는 항상 너 자신인 ${companionName}으로 말해. 화면에 학습 주제로 선택된 곤충이 있어도 그 곤충으로 빙의하거나 "나는 [학습 주제 곤충 이름]이야"처럼 말하지 마 — 학습 주제 곤충은 네가 3인칭으로 설명해 주는 대상일 뿐이야. 네 이름을 물으면 항상 "나는 ${companionName}이야"라고 답해.
- 한국어로만, 상황에 맞는 2~4문장으로 자연스럽게 대답해. 짧은 질문에는 짧게 답해.
- 어려운 낱말은 바로 쉽게 풀어 설명하고, 어린이에게 친근한 반말을 사용해.
- 사용자의 질문에 먼저 직접 답하고 나서 덧붙일 말을 이어가. 인사, 자기소개, "어떤 곤충을 보고 있니?" 같은 되물음으로 답변을 시작하지 마 — 곤충은 이미 선택되어 있어.
- 사용자가 인사만 하면 "안녕, 나는 ${companionName}이야. 지금은 [곤충 이름]에 대해 알아보고 있어."처럼 짧게 네 이름과 학습 주제를 소개하며 인사를 받아 줘. 특징 목록이나 안전 규칙을 인사에 덧붙이지 마.
- 사용자가 "누구야?"라고 물으면 "나는 ${companionName}이야"라고 답하고, 지금 공부 중인 곤충 이름도 함께 알려 줘.
- 대화가 이어지면 앞선 질문·답변을 기억하고 자연스럽게 이어서 반응해, 이미 답한 내용을 다시 묻지 마.
- 현재 맥락: ${contextText}
- 곤충·자연에 관한 질문을 우선 도와줘. 모르는 사실, 종을 확정할 수 없는 내용은 추측하지 말고
  '확실히 알기 어렵다'고 말한 뒤 사진, 크기, 색, 발견 장소처럼 확인에 필요한 정보를 물어봐.
- 위험한 행동, 생명체를 해치는 방법, 개인정보 요구에는 방법을 알려주지 말고 안전한 관찰로 안내해.
- 의료·응급 상황은 보호자나 긴급 도움을 요청하도록 안내해.`
}

app.post('/chat', async (req, res) => {
  const { message, session_id: sessionId, history = [], context = {} } = req.body || {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'MESSAGE_REQUIRED' })
  }

  const currentSessionId = sessionId || crypto.randomUUID()

  if (isDangerous(message)) {
    return res.json({ reply: SAFE_REDIRECT, session_id: currentSessionId })
  }
  if (!openai) {
    return res.status(503).json({ error: 'OPENAI_API_KEY_NOT_CONFIGURED' })
  }

  const messages = [{ role: 'system', content: buildSystemPrompt(context) }]
  const stored = chatSessions.get(currentSessionId)
  if (stored?.length) {
    messages.push(...stored.slice(-10))
  } else {
    messages.push(...history.slice(-10).map((item) => ({ role: item.role, content: item.content })))
  }

  // 매 턴 직전에 한 번 더 못박아서, 대화가 길어져도 모델이 "어떤 곤충을 보고 있니" 되묻거나
  // 다른 곤충으로 착각하지 않게 한다 — system 프롬프트 하나만으로는 history가 쌓일수록 잊혀졌다.
  if (context.observedInsect?.name) {
    const observed = context.observedInsect
    const companionName = context.companionName || '알'
    messages.push({
      role: 'system',
      content: `대화 직전 확인: 지금 학습 주제 곤충은 ${observed.name}이야. 너는 ${companionName}이야, 이 곤충을 3인칭으로 설명해. 곤충을 연기하지 말고, 어떤 곤충을 보고 있는지 되묻지 마. 도감 설명은 "${observed.feature || '없음'}", 서식지는 "${observed.habitat || '알 수 없음'}"이야.`,
    })
  }

  const imageDataUrl = context.observedInsect?.imageDataUrl
  const groundedMessage = context.observedInsect?.name
    ? `[도감 참고 정보 — 이 내용을 바탕으로 답해] 곤충: ${context.observedInsect.name}; 서식지: ${context.observedInsect.habitat || '알 수 없음'}; 특징: ${context.observedInsect.feature || '알 수 없음'}\n[사용자 질문] ${message}`
    : message
  if (typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: groundedMessage },
        { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
      ],
    })
  } else {
    messages.push({ role: 'user', content: groundedMessage })
  }

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 300,
    })
    const reply = (completion.choices[0]?.message?.content || '').trim()
    if (!reply) throw new Error('empty assistant response')

    const nextHistory = [...(stored || []), { role: 'user', content: message }, { role: 'assistant', content: reply }].slice(-20)
    chatSessions.set(currentSessionId, nextHistory)

    res.json({ reply, session_id: currentSessionId })
  } catch (err) {
    console.error('[chat] OpenAI request failed:', err)
    res.status(502).json({ error: 'AI_RESPONSE_UNAVAILABLE' })
  }
})

async function issueUid() {
  let uid
  let exists = true
  while (exists) {
    uid = generateUid()
    const { rows } = await pool.query('SELECT 1 FROM users WHERE uid = $1', [uid])
    exists = rows.length > 0
  }
  return uid
}

// habitat.code("forest" 등) <-> habitat.id, mission_definition.code("achievement-6-2" 등) <->
// mission_definition.id 변환은 여러 라우트에서 반복해서 쓰인다. 앱 전체가 이 78+82개 정적
// 레코드를 자주 왔다갔다 참조하는 것에 비해 값 자체는 절대 안 바뀌므로(시드 스크립트로만 갱신),
// 서버 프로세스가 켜져 있는 동안 메모리에 캐시해서 매 요청마다 조인하지 않게 한다.
let habitatIdByCodeCache = null
async function getHabitatIdByCode() {
  if (!habitatIdByCodeCache) {
    const { rows } = await pool.query('SELECT id, code FROM habitat')
    habitatIdByCodeCache = Object.fromEntries(rows.map((row) => [row.code, row.id]))
  }
  return habitatIdByCodeCache
}

let missionDefByCodeCache = null
async function getMissionDefByCode() {
  if (!missionDefByCodeCache) {
    const { rows } = await pool.query(
      'SELECT id, code, type, title, description, event_key, goal, reward_leaf FROM mission_definition'
    )
    missionDefByCodeCache = Object.fromEntries(rows.map((row) => [row.code, row]))
  }
  return missionDefByCodeCache
}

async function getUserByUid(uid) {
  const { rows } = await pool.query('SELECT id, uid, nickname FROM users WHERE uid = $1', [uid])
  return rows[0]
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

async function upsertRepresentativeCharacter(userId, character) {
  await pool.query(
    `INSERT INTO representative_character (user_id, species_index, stage, larva_category, species_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       species_index = excluded.species_index,
       stage = excluded.stage,
       larva_category = excluded.larva_category,
       species_id = excluded.species_id`,
    [userId, character.index, character.stage, character.larvaCategory ?? null, character.speciesId != null ? String(character.speciesId) : null]
  )
}

async function hasRepresentativeCharacter(userId) {
  const { rows } = await pool.query('SELECT 1 FROM representative_character WHERE user_id = $1', [userId])
  return rows.length > 0
}

// FieldGuide.jsx의 등록 하이드레이션과 동일한 규칙 — 정적 registered 플래그만 보면 실제
// 진행도(사진/그림/동 등록)와 어긋난다. 친구 목장 라벨과 친구 도감 화면이 둘 다 이 함수를 쓴다.
function hydrateSpeciesForUser(target, { photos, sketches, bronzeUnlocks }) {
  const isDemoAccount = target.username === DEMO_ACCOUNT_USERNAME
  return getInsectSpecies(isDemoAccount).map((species) => {
    const goldPhoto = photos[species.id]
    const silverSketch = sketches[species.id]
    const bronzeUnlocked = Boolean(bronzeUnlocks[species.id])
    if (!goldPhoto && !silverSketch && !bronzeUnlocked) return species
    return {
      ...species,
      registered: true,
      photoUrl: goldPhoto ?? species.photoUrl,
      sketchUrl: silverSketch ?? species.sketchUrl,
      defaultUrl: species.image,
      registeredRanks: {
        ...species.registeredRanks,
        gold: Boolean(goldPhoto) || species.registeredRanks.gold,
        silver: Boolean(silverSketch) || species.registeredRanks.silver,
        bronze: true,
      },
    }
  })
}

// user_species_record 한 번 조회로 photos/sketches/bronzeUnlocks/registrations 4개 키를
// 전부 만든다 — hydrateSpeciesForUser(친구 목장/도감 미리보기)와 buildStateForUser(내 진행도)가
// 공유해서 쓴다.
async function loadSpeciesRecords(userId) {
  const { rows } = await pool.query(
    'SELECT species_id, bronze_unlocked, photo_url, sketch_url, first_registered_at FROM user_species_record WHERE user_id = $1',
    [userId]
  )
  const photos = {}
  const sketches = {}
  const bronzeUnlocks = {}
  const registrations = {}
  for (const row of rows) {
    const speciesId = Number(row.species_id)
    if (row.photo_url) photos[speciesId] = row.photo_url
    if (row.sketch_url) sketches[speciesId] = row.sketch_url
    if (row.bronze_unlocked) bronzeUnlocks[speciesId] = true
    registrations[speciesId] = row.first_registered_at
  }
  return { photos, sketches, bronzeUnlocks, registrations, rows }
}

const ACHIEVEMENT_COUNTER_KEYS = [
  'ranchDiscoveries', 'explorations', 'hatchedEggs', 'eggGrowthActivities', 'interiorPlacements',
  'dailyMissionsCompleted', 'friendsAdded', 'friendVisits',
]

// 계정 하나의 GET /api/state/:uid 전체를 정규화 테이블들에서 재조립한다 — 프론트가 예전
// user_state 블롭에서 기대하던 것과 동일한 모양으로 돌려줘야 Context 쪽 코드를 한 줄도
// 안 건드릴 수 있다.
async function buildStateForUser(user) {
  const userId = user.id
  const state = {}

  const [userRow, repCharRow, habitatLayoutRows, speciesRecords, counterRows, missionRows, poolRows, blobRows] = await Promise.all([
    pool.query('SELECT bio, leaves, growth_points, bag_capacity FROM users WHERE id = $1', [userId]).then((r) => r.rows[0]),
    pool.query('SELECT species_index, stage, larva_category, species_id FROM representative_character WHERE user_id = $1', [userId]).then((r) => r.rows[0]),
    pool.query(
      `SELECT h.code, l.pos_x, l.pos_y, l.scale FROM user_habitat_layout l JOIN habitat h ON h.id = l.habitat_id WHERE l.user_id = $1`,
      [userId]
    ).then((r) => r.rows),
    loadSpeciesRecords(userId),
    pool.query('SELECT counter_key, value FROM user_progress_counter WHERE user_id = $1', [userId]).then((r) => r.rows),
    pool.query(
      `SELECT m.code, m.type, m.title, m.description, m.event_key, m.goal, m.reward_leaf, m.permanent,
              p.period_key, p.progress, p.total, p.done, p.claimed, p.seen_ids, p.is_equipped, p.equip_order
       FROM user_mission_progress p JOIN mission_definition m ON m.id = p.mission_definition_id
       WHERE p.user_id = $1`,
      [userId]
    ).then((r) => r.rows),
    pool.query(
      `SELECT m.code, m.type FROM user_mission_pool up JOIN mission_definition m ON m.id = up.mission_definition_id WHERE up.user_id = $1`,
      [userId]
    ).then((r) => r.rows),
    pool.query(
      "SELECT key, value FROM user_state WHERE user_id = $1 AND key IN ('bagItems', 'placements', 'profileCharacterId', 'primaryTitleId', 'primaryBadgeId', 'representativeAdultHistory')",
      [userId]
    ).then((r) => r.rows),
  ])

  if (userRow) {
    state.bio = userRow.bio ?? undefined
    state.leaves = userRow.leaves
    state.growthPoints = userRow.growth_points
    state.bagCapacity = userRow.bag_capacity
  }
  if (repCharRow) {
    state.representativeCharacter = {
      index: repCharRow.species_index,
      stage: repCharRow.stage,
      larvaCategory: repCharRow.larva_category ?? undefined,
      speciesId: repCharRow.species_id != null ? Number(repCharRow.species_id) : null,
    }
  }

  if (habitatLayoutRows.length) {
    state.habitatPositions = {}
    state.habitatScales = {}
    for (const row of habitatLayoutRows) {
      state.habitatPositions[row.code] = { x: row.pos_x, y: row.pos_y }
      state.habitatScales[row.code] = row.scale
    }
  }

  state.photos = speciesRecords.photos
  state.sketches = speciesRecords.sketches
  state.bronzeUnlocks = speciesRecords.bronzeUnlocks
  state.registrations = speciesRecords.registrations

  // achievementProgress: 정수 카운터 7개 + claimedIds + missionIds + user_species_record에서
  // 파생하는 배열형 카운터들(drawings/photos/registeredSpecies/allRanksSpecies).
  const counters = Object.fromEntries(ACHIEVEMENT_COUNTER_KEYS.map((key) => [key, 0]))
  for (const row of counterRows) counters[row.counter_key] = row.value
  const drawings = speciesRecords.rows.filter((r) => r.sketch_url).map((r) => Number(r.species_id))
  const photosArr = speciesRecords.rows.filter((r) => r.photo_url).map((r) => Number(r.species_id))
  const registeredSpecies = speciesRecords.rows.map((r) => Number(r.species_id))
  const allRanksSpecies = speciesRecords.rows.filter((r) => r.photo_url && r.sketch_url).map((r) => Number(r.species_id))

  const achievementRows = missionRows.filter((row) => row.type === 'achievement')
  const titleRows = missionRows.filter((row) => row.type === 'title')
  const achievementPoolCodes = poolRows.filter((row) => row.type === 'achievement').map((row) => row.code)
  const titlePoolCodes = poolRows.filter((row) => row.type === 'title').map((row) => row.code)

  state.achievementProgress = {
    ...counters,
    drawings, photos: photosArr, registeredSpecies, allRanksSpecies, rankState: {},
    claimedIds: achievementRows.filter((row) => row.claimed).map((row) => row.code),
    missionIds: achievementPoolCodes,
  }
  state.titleClaims = titleRows.filter((row) => row.claimed).map((row) => row.code)
  state.titleMissionIds = titlePoolCodes

  const equippedOf = (type) => missionRows
    .filter((row) => row.type === type && row.is_equipped)
    .sort((a, b) => (a.equip_order ?? 0) - (b.equip_order ?? 0))
    .map((row) => row.code)
  state.equippedBadges = equippedOf('achievement')
  state.equippedTitles = equippedOf('title')

  // 일일/주간 미션은 "가장 최근에 저장된 period_key" 묶음만 유효하다 — 날짜/주차가 지났는지는
  // 이미 클라이언트(resolveDaily/resolveWeekly)가 판단해서 새로 뽑고 다시 저장해준다.
  const buildPeriodMissions = (type) => {
    const rowsOfType = missionRows.filter((row) => row.type === type)
    if (!rowsOfType.length) return null
    const latestPeriod = rowsOfType.reduce((max, row) => (row.period_key > max ? row.period_key : max), '')
    const missions = rowsOfType
      .filter((row) => row.period_key === latestPeriod)
      .map((row) => ({
        id: row.code, title: row.title, desc: row.description, event: row.event_key,
        progress: row.progress, total: row.total, rewardLeaf: row.reward_leaf,
        claimed: row.claimed, done: row.done,
        ...(type === 'weekly' ? { seenIds: row.seen_ids ?? undefined, permanent: row.permanent } : {}),
      }))
    return { periodKey: latestPeriod, missions }
  }

  const daily = buildPeriodMissions('daily')
  if (daily) state.dailyMissions = { date: daily.periodKey, missions: daily.missions }

  const weekly = buildPeriodMissions('weekly')
  if (weekly) {
    // permanent 미션은 한 번 완료하면 이후 다시 안 뽑히게 제외 목록을 파생시켜 같이 내려준다.
    const permanentExcludedIds = missionRows
      .filter((row) => row.type === 'weekly' && row.permanent && row.done)
      .map((row) => row.code)
    state.weeklyMissions = { week: weekly.periodKey, permanentExcludedIds, missions: weekly.missions }
  }

  for (const row of blobRows) {
    try {
      state[row.key] = JSON.parse(row.value)
    } catch {
      state[row.key] = null
    }
  }

  return state
}

async function upsertSpeciesRecordColumn(userId, column, entries) {
  // photos/sketches/bronzeUnlocks/registrations는 서로 다른 saveUserState 호출로 따로따로
  // 들어오지만 전부 같은 user_species_record 행을 겨눈다 — 이 종에 대해 다른 세 컬럼이 이미
  // 있어도 안 건드리도록 그 컬럼 하나만 업데이트한다.
  for (const [speciesId, value] of entries) {
    await pool.query(
      `INSERT INTO user_species_record (user_id, species_id, ${column}) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, species_id) DO UPDATE SET ${column} = excluded.${column}`,
      [userId, speciesId, value]
    )
  }
}

async function upsertPeriodMissions(userId, type, periodKey, missions) {
  const missionDefByCode = await getMissionDefByCode()
  for (const mission of missions) {
    const def = missionDefByCode[mission.id]
    if (!def) continue
    await pool.query(
      `INSERT INTO user_mission_progress (user_id, mission_definition_id, period_key, progress, total, done, claimed, claimed_at, seen_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN now() ELSE NULL END, $8)
       ON CONFLICT (user_id, mission_definition_id, period_key) DO UPDATE SET
         progress = excluded.progress, total = excluded.total, done = excluded.done, claimed = excluded.claimed,
         claimed_at = CASE WHEN excluded.claimed THEN COALESCE(user_mission_progress.claimed_at, now()) ELSE user_mission_progress.claimed_at END,
         seen_ids = excluded.seen_ids`,
      [userId, def.id, periodKey, mission.progress ?? 0, mission.total ?? def.goal, Boolean(mission.done), Boolean(mission.claimed), mission.seenIds ?? null]
    )
  }
}

async function claimLifetimeMissions(userId, type, codes) {
  const missionDefByCode = await getMissionDefByCode()
  for (const code of codes) {
    const def = missionDefByCode[code]
    if (!def) continue
    await pool.query(
      `INSERT INTO user_mission_progress (user_id, mission_definition_id, period_key, total, done, claimed, claimed_at)
       VALUES ($1, $2, '', $3, true, true, now())
       ON CONFLICT (user_id, mission_definition_id, period_key) DO UPDATE SET
         done = true, claimed = true, claimed_at = COALESCE(user_mission_progress.claimed_at, now())`,
      [userId, def.id, def.goal]
    )
  }
}

// 클라이언트(resolveAchievementProgress/resolveTitleMissionIds)가 이미 "한 번 뽑은 목록은 다시
// 섞지 않는다"를 책임지고 있으므로, 여기서는 그 목록에 있는 코드를 빠짐없이 upsert만 하면 된다
// (ON CONFLICT DO NOTHING이라 이미 있는 코드는 그대로 두고, 새로 늘어난 코드만 추가된다).
async function insertMissionPoolOnce(userId, type, codes) {
  const missionDefByCode = await getMissionDefByCode()
  for (const code of codes) {
    const def = missionDefByCode[code]
    if (!def) continue
    await pool.query(
      'INSERT INTO user_mission_pool (user_id, mission_definition_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, def.id]
    )
  }
}

async function setEquipped(userId, type, codes) {
  await pool.query(
    `UPDATE user_mission_progress SET is_equipped = false, equip_order = NULL
     WHERE user_id = $1 AND mission_definition_id IN (SELECT id FROM mission_definition WHERE type = $2)`,
    [userId, type]
  )
  const missionDefByCode = await getMissionDefByCode()
  for (let i = 0; i < codes.length; i += 1) {
    const def = missionDefByCode[codes[i]]
    if (!def) continue
    await pool.query(
      'UPDATE user_mission_progress SET is_equipped = true, equip_order = $1 WHERE user_id = $2 AND mission_definition_id = $3',
      [i, userId, def.id]
    )
  }
}

app.post('/api/signup', async (req, res) => {
  const { username, password, nickname } = req.body || {}
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }
  const { rows: existing } = await pool.query('SELECT 1 FROM users WHERE username = $1', [username])
  if (existing.length) {
    return res.status(409).json({ error: 'USERNAME_TAKEN' })
  }
  const uid = await issueUid()
  const passwordHash = hashPassword(password)
  const today = todayDateKey()
  const { rows: inserted } = await pool.query(
    'INSERT INTO users (uid, username, password_hash, nickname, total_login_days, last_login_date) VALUES ($1, $2, $3, $4, 1, $5) RETURNING id',
    [uid, username, passwordHash, nickname, today]
  )
  const userId = inserted[0].id
  // 대표 캐릭터(알)는 계정마다 6종 중 하나로 무작위 배정하고 첫 단계는 항상 "알"이다.
  await upsertRepresentativeCharacter(userId, createRepresentativeCharacter())
  const { rows: userRows } = await pool.query(
    'SELECT id, uid, username, nickname, total_login_days AS "totalLoginDays" FROM users WHERE id = $1',
    [userId]
  )
  res.status(201).json({ user: userRows[0] })
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }
  const { rows } = await pool.query(
    'SELECT id, uid, username, nickname, password_hash, total_login_days, last_login_date FROM users WHERE username = $1',
    [username]
  )
  const row = rows[0]
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' })
  }
  const today = todayDateKey()
  let totalLoginDays = row.total_login_days
  if (row.last_login_date !== today) {
    totalLoginDays += 1
    await pool.query('UPDATE users SET total_login_days = $1, last_login_date = $2 WHERE id = $3', [totalLoginDays, today, row.id])
  }
  // 이 기능이 생기기 전에 가입한 계정은 대표 캐릭터가 없으니 로그인 시점에 하나 배정해 채운다.
  if (!(await hasRepresentativeCharacter(row.id))) {
    await upsertRepresentativeCharacter(row.id, createRepresentativeCharacter())
  }
  res.json({ user: { id: row.id, uid: row.uid, username: row.username, nickname: row.nickname, totalLoginDays } })
})

app.get('/api/state/:uid', async (req, res) => {
  const user = await getUserByUid(req.params.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const state = await buildStateForUser(user)
  res.json({ state })
})

app.put('/api/state/:uid/:key', async (req, res) => {
  const user = await getUserByUid(req.params.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const { key } = req.params
  const value = req.body?.value

  switch (key) {
    case 'leaves':
      await pool.query('UPDATE users SET leaves = $1 WHERE id = $2', [value, user.id])
      break
    case 'growthPoints':
      await pool.query('UPDATE users SET growth_points = $1 WHERE id = $2', [value, user.id])
      break
    case 'bagCapacity':
      await pool.query('UPDATE users SET bag_capacity = $1 WHERE id = $2', [value, user.id])
      break
    case 'bio':
      await pool.query('UPDATE users SET bio = $1 WHERE id = $2', [value, user.id])
      break
    case 'representativeCharacter':
      await upsertRepresentativeCharacter(user.id, value)
      break
    case 'photos':
      await upsertSpeciesRecordColumn(user.id, 'photo_url', Object.entries(value ?? {}))
      break
    case 'sketches':
      await upsertSpeciesRecordColumn(user.id, 'sketch_url', Object.entries(value ?? {}))
      break
    case 'bronzeUnlocks':
      await upsertSpeciesRecordColumn(user.id, 'bronze_unlocked', Object.keys(value ?? {}).map((id) => [id, true]))
      break
    case 'registrations':
      await upsertSpeciesRecordColumn(user.id, 'first_registered_at', Object.entries(value ?? {}))
      break
    case 'habitatPositions': {
      const habitatIdByCode = await getHabitatIdByCode()
      for (const [code, position] of Object.entries(value ?? {})) {
        const habitatId = habitatIdByCode[code]
        if (!habitatId) continue
        await pool.query(
          `INSERT INTO user_habitat_layout (user_id, habitat_id, pos_x, pos_y) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, habitat_id) DO UPDATE SET pos_x = excluded.pos_x, pos_y = excluded.pos_y`,
          [user.id, habitatId, position.x, position.y]
        )
      }
      break
    }
    case 'habitatScales': {
      const habitatIdByCode = await getHabitatIdByCode()
      for (const [code, scale] of Object.entries(value ?? {})) {
        const habitatId = habitatIdByCode[code]
        if (!habitatId) continue
        const fallback = HABITATS.find((h) => h.id === code) ?? { x: 50, y: 50 }
        await pool.query(
          `INSERT INTO user_habitat_layout (user_id, habitat_id, pos_x, pos_y, scale) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, habitat_id) DO UPDATE SET scale = excluded.scale`,
          [user.id, habitatId, fallback.x, fallback.y, scale]
        )
      }
      break
    }
    case 'dailyMissions':
      if (value?.date && Array.isArray(value.missions)) await upsertPeriodMissions(user.id, 'daily', value.date, value.missions)
      break
    case 'weeklyMissions':
      if (value?.week && Array.isArray(value.missions)) await upsertPeriodMissions(user.id, 'weekly', value.week, value.missions)
      break
    case 'achievementProgress': {
      for (const counterKey of ACHIEVEMENT_COUNTER_KEYS) {
        if (typeof value?.[counterKey] !== 'number') continue
        await pool.query(
          `INSERT INTO user_progress_counter (user_id, counter_key, value) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, counter_key) DO UPDATE SET value = excluded.value`,
          [user.id, counterKey, value[counterKey]]
        )
      }
      if (Array.isArray(value?.claimedIds)) await claimLifetimeMissions(user.id, 'achievement', value.claimedIds)
      if (Array.isArray(value?.missionIds)) await insertMissionPoolOnce(user.id, 'achievement', value.missionIds)
      break
    }
    case 'titleClaims':
      if (Array.isArray(value)) await claimLifetimeMissions(user.id, 'title', value)
      break
    case 'titleMissionIds':
      if (Array.isArray(value)) await insertMissionPoolOnce(user.id, 'title', value)
      break
    case 'equippedBadges':
      if (Array.isArray(value)) await setEquipped(user.id, 'achievement', value)
      break
    case 'equippedTitles':
      if (Array.isArray(value)) await setEquipped(user.id, 'title', value)
      break
    case 'bagItems':
    case 'placements':
    case 'profileCharacterId':
    case 'primaryTitleId':
    case 'primaryBadgeId':
    case 'representativeAdultHistory':
      await pool.query(
        `INSERT INTO user_state (user_id, key, value, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [user.id, key, JSON.stringify(value ?? null)]
      )
      break
    default:
      // 알 수 없는 키는 조용히 무시한다 — 예전 블롭 방식 잔재 등, 있어도 무해하다.
      break
  }

  res.json({ success: true })
})

app.post('/api/signup', async (req, res) => {
  const { username, password, nickname } = req.body || {}
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }
  const { rows: existing } = await pool.query('SELECT 1 FROM users WHERE username = $1', [username])
  if (existing.length) {
    return res.status(409).json({ error: 'USERNAME_TAKEN' })
  }
  const uid = await issueUid()
  const passwordHash = hashPassword(password)
  const today = todayDateKey()
  const { rows: inserted } = await pool.query(
    'INSERT INTO users (uid, username, password_hash, nickname, total_login_days, last_login_date) VALUES ($1, $2, $3, $4, 1, $5) RETURNING id',
    [uid, username, passwordHash, nickname, today]
  )
  const userId = inserted[0].id
  // 대표 캐릭터(알)는 계정마다 6종 중 하나로 무작위 배정하고 첫 단계는 항상 "알"이다.
  await upsertRepresentativeCharacter(userId, createRepresentativeCharacter())
  const { rows: userRows } = await pool.query(
    'SELECT id, uid, username, nickname, total_login_days AS "totalLoginDays" FROM users WHERE id = $1',
    [userId]
  )
  res.status(201).json({ user: userRows[0] })
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS' })
  }
  const { rows } = await pool.query(
    'SELECT id, uid, username, nickname, password_hash, total_login_days, last_login_date FROM users WHERE username = $1',
    [username]
  )
  const row = rows[0]
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS' })
  }
  const today = todayDateKey()
  let totalLoginDays = row.total_login_days
  if (row.last_login_date !== today) {
    totalLoginDays += 1
    await pool.query('UPDATE users SET total_login_days = $1, last_login_date = $2 WHERE id = $3', [totalLoginDays, today, row.id])
  }
  // 이 기능이 생기기 전에 가입한 계정은 대표 캐릭터가 없으니 로그인 시점에 하나 배정해 채운다.
  const { rows: repCharRows } = await pool.query(
    "SELECT 1 FROM user_state WHERE user_id = $1 AND key = 'representativeCharacter'",
    [row.id]
  )
  if (!repCharRows.length) {
    await upsertRepresentativeCharacter(row.id, createRepresentativeCharacter())
  }
  res.json({ user: { id: row.id, uid: row.uid, username: row.username, nickname: row.nickname, totalLoginDays } })
})

app.get('/api/state/:uid', async (req, res) => {
  const user = await getUserByUid(req.params.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const { rows } = await pool.query('SELECT key, value FROM user_state WHERE user_id = $1', [user.id])
  const state = {}
  for (const row of rows) {
    try {
      state[row.key] = JSON.parse(row.value)
    } catch {
      state[row.key] = null
    }
  }
  res.json({ state })
})

app.put('/api/state/:uid/:key', async (req, res) => {
  const user = await getUserByUid(req.params.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const value = JSON.stringify(req.body?.value ?? null)
  await pool.query(
    `INSERT INTO user_state (user_id, key, value, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [user.id, req.params.key, value]
  )
  res.json({ success: true })
})

// 친구 검색용 공개 조회. 아직 친구가 아니어도 uid로 상대를 찾아 미리보기(닉네임)만 보여준다.
app.get('/api/users/:uid', async (req, res) => {
  const user = await getUserByUid(req.params.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  res.json({ user: { uid: user.uid, nickname: user.nickname } })
})

app.post('/api/friends/requests', async (req, res) => {
  const { requesterUid, targetUid } = req.body || {}
  const requester = await getUserByUid(requesterUid)
  const target = await getUserByUid(targetUid)
  if (!requester || !target) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  if (requester.id === target.id) return res.status(400).json({ error: 'CANNOT_ADD_SELF' })
  const { rows: alreadyFriends } = await pool.query(
    'SELECT 1 FROM friendship WHERE user_id = $1 AND friend_id = $2',
    [requester.id, target.id]
  )
  if (alreadyFriends.length) return res.status(409).json({ error: 'ALREADY_FRIENDS' })
  try {
    await pool.query('INSERT INTO friend_request (requester_id, target_id) VALUES ($1, $2)', [requester.id, target.id])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'REQUEST_ALREADY_SENT' })
    throw err
  }
  res.status(201).json({ success: true })
})

app.get('/api/friends/requests', async (req, res) => {
  const user = await getUserByUid(req.query.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const { rows: requests } = await pool.query(
    `SELECT fr.id, u.uid, u.nickname, fr.created_at
     FROM friend_request fr
     JOIN users u ON u.id = fr.requester_id
     WHERE fr.target_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [user.id]
  )
  res.json({ requests })
})

app.post('/api/friends/requests/:id/accept', async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM friend_request WHERE id = $1 AND status = 'pending'", [req.params.id])
  const request = rows[0]
  if (!request) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("UPDATE friend_request SET status = 'accepted' WHERE id = $1", [request.id])
    await client.query('INSERT INTO friendship (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      request.requester_id,
      request.target_id,
    ])
    await client.query('INSERT INTO friendship (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      request.target_id,
      request.requester_id,
    ])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  res.json({ success: true })
})

app.post('/api/friends/requests/:id/reject', async (req, res) => {
  const result = await pool.query(
    "UPDATE friend_request SET status = 'rejected' WHERE id = $1 AND status = 'pending'",
    [req.params.id]
  )
  if (!result.rowCount) return res.status(404).json({ error: 'REQUEST_NOT_FOUND' })
  res.json({ success: true })
})

app.get('/api/friends', async (req, res) => {
  const user = await getUserByUid(req.query.uid)
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const { rows: friends } = await pool.query(
    `SELECT u.uid, u.nickname
     FROM friendship f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1
     ORDER BY u.nickname`,
    [user.id]
  )
  res.json({ friends })
})

app.post('/api/guestbook/:ownerUid', async (req, res) => {
  const owner = await getUserByUid(req.params.ownerUid)
  const visitor = await getUserByUid(req.body?.visitorUid)
  const message = (req.body?.message || '').trim()
  if (!owner || !visitor) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  if (!message) return res.status(400).json({ error: 'EMPTY_MESSAGE' })
  await pool.query('INSERT INTO guestbook (ranch_owner_id, visitor_id, message) VALUES ($1, $2, $3)', [
    owner.id,
    visitor.id,
    message,
  ])
  res.status(201).json({ success: true })
})

app.get('/api/guestbook/:ownerUid', async (req, res) => {
  const owner = await getUserByUid(req.params.ownerUid)
  if (!owner) return res.status(404).json({ error: 'USER_NOT_FOUND' })
  const { rows: entries } = await pool.query(
    `SELECT g.id, g.message, g.created_at, u.uid AS "visitorUid", u.nickname AS "visitorNickname"
     FROM guestbook g
     JOIN users u ON u.id = g.visitor_id
     WHERE g.ranch_owner_id = $1
     ORDER BY g.created_at DESC`,
    [owner.id]
  )
  res.json({ entries })
})

// 친구 목장 방문(Friends.jsx)용 읽기 전용 스냅샷 — 대객체 위치/크기, 배치한 인테리어,
// 서식지별 등록 현황을 돌려준다. 도감 원본 데이터(사진/그림 dataURL 등)는 내려주지 않는다.
app.get('/api/ranch/:uid', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, username, nickname, total_login_days AS "totalLoginDays" FROM users WHERE uid = $1',
    [req.params.uid]
  )
  const target = rows[0]
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' })

  const [speciesRecords, state] = await Promise.all([
    loadSpeciesRecords(target.id),
    buildStateForUser(target),
  ])
  const speciesList = hydrateSpeciesForUser(target, speciesRecords)

  const habitatStats = {}
  for (const habitat of HABITATS) {
    habitatStats[habitat.id] = getHabitatStats(habitat.id, speciesList)
  }

  // 친구 목장 방문 시 프로필 카드(FriendRanch.jsx)를 눌러 보여줄 정보 — 자기 목장 프로필
  // 모달과 같은 항목(대표 캐릭터/도감/성장 포인트/출석/나뭇잎)을 읽기 전용으로 노출한다.
  res.json({
    nickname: target.nickname,
    positions: state.habitatPositions || null,
    scales: state.habitatScales || null,
    placements: Array.isArray(state.placements) ? state.placements : [],
    habitatStats,
    representativeCharacter: state.representativeCharacter || null,
    growthPoints: state.growthPoints ?? 0,
    leaves: state.leaves ?? 0,
    totalLoginDays: target.totalLoginDays ?? 0,
    fieldGuideCount: speciesList.filter((s) => s.registered).length,
    fieldGuideTotal: speciesList.length,
  })
})

// 친구 도감 구경하기(FriendFieldGuide.jsx)용 — 친구가 등록한 종을 사진/그림 등급까지 그대로
// 보여준다(FieldGuide.jsx와 같은 화면을 읽기 전용으로 재사용).
app.get('/api/field-guide/:uid', async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, nickname FROM users WHERE uid = $1', [req.params.uid])
  const target = rows[0]
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' })

  const speciesRecords = await loadSpeciesRecords(target.id)
  const species = hydrateSpeciesForUser(target, speciesRecords)

  res.json({ nickname: target.nickname, species })
})

// multer의 파일 크기 초과 등은 라우트 핸들러 진입 전에 발생해서 위 try/catch를 안 거치므로,
// 이 4-인자 에러 미들웨어가 없으면 Express 기본 500 HTML 페이지가 나가 프론트에서 원인을 알 수 없었다.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'FILE_TOO_LARGE' })
  }
  console.error('[classify-insect] unexpected error:', err)
  res.status(500).json({ error: 'SERVER_ERROR' })
})

// 라우트 대부분이 try/catch 없이 await pool.query(...)를 바로 쓰는데, DB 쪽 순간적인
// 네트워크 문제로 그 쿼리 하나가 실패하면 Node가 이걸 처리 안 된 예외로 보고 서버 프로세스
// 전체를 죽였다 — 로그인/친구요청 등 모든 버튼이 갑자기 응답 없어지던 원인. 요청 하나의
// 실패가 서버 전체를 죽이지 않도록 마지막 방어선만 둔다(요청 쪽엔 그냥 응답이 안 가고 남).
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandled rejection (서버는 계속 떠 있음):', err)
})

dbReady
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Insect classify proxy listening on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('[db] schema init failed:', err)
    process.exit(1)
  })
