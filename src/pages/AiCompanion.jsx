import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import FocusedLayout from '../components/common/FocusedLayout'
import { getSpeciesCategory, INSECT_SPECIES, HABITATS, getInsectSpecies, DEMO_ACCOUNT_USERNAME } from '../data/insectSpecies'
import { getFeaturedCharacterIdentity } from '../data/representativeCharacter'
import { useAuth } from '../router/AuthContext'
import { useQuests } from '../context/QuestsContext'
import { reportMissionEvent } from '../utils/missionEvents'
import { apiUrl } from '../api/apiBase'

// ai-companion.md: 대표 알 AI / 곤충 페르소나 AI 역할 분리, 음성 입력 실패 시 텍스트 입력 가능,
// 시스템 프롬프트·API 키 비노출(실제 호출은 server/index.js의 /chat 프록시가 담당). 안전 규칙:
// 개인정보 요청 금지, 위험 행동 권장 금지 — 위험 단어는 서버에서도 한 번 더 걸러진다.
const CHAT_STORAGE_KEY = 'little-biologist:al-chat'

// 대표 캐릭터 성장 단계 이름("알"/"애벌레"/"번데기"/"성충")에 붙는 조사는 받침 유무에 따라
// 달라진다(알과/애벌레와, 알이야/애벌레야, 알이/애벌레가) — 유니코드 완성형 한글의
// (코드 - 0xAC00) % 28 값이 0이면 받침이 없다는 성질을 이용해 계산한다.
function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1)
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
}
function withTopicParticle(word) {
  return `${word}${hasBatchim(word) ? '과' : '와'}`
}
function withCopula(word) {
  return `${word}${hasBatchim(word) ? '이야' : '야'}`
}
function withSubjectParticle(word) {
  return `${word}${hasBatchim(word) ? '이' : '가'}`
}

function getChatStorageKey(insectId) {
  return `${CHAT_STORAGE_KEY}:${insectId || 'general'}`
}

function loadChatState(fallbackMessages, insectId) {
  if (typeof window === 'undefined') return { messages: fallbackMessages, sessionId: null }
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(getChatStorageKey(insectId)) || 'null')
    if (saved?.messages?.length) return { messages: saved.messages, sessionId: saved.sessionId || null }
  } catch {
    // 세션 저장소가 없거나 값이 깨졌으면 새 대화로 시작한다.
  }
  return { messages: fallbackMessages, sessionId: null }
}

const DANGEROUS_WORDS = ['죽이고', '잡아먹', '불로 태워', '독을 만들', '다치게', '폭발', '무기']
// 곤충 분류별 말투/특징 — 알이 곤충을 3인칭으로 설명할 때 그 곤충의 분위기를 살리는 데 쓴다
// (알 자신의 정체성이 아니라 "설명 대상"의 색깔이라는 점에 유의).
const FLAVOR_BY_CATEGORY = {
  beetle: { traits: ['단단한 몸', '땅과 나무를 좋아함'], voice: '차분하고 씩씩한 숲 탐험가' },
  'stag-beetle': { traits: ['큰 턱', '나무 진액을 좋아함'], voice: '용감하지만 다정한 숲 지킴이' },
  butterfly: { traits: ['날개가 예쁨', '꽃을 찾아다님'], voice: '밝고 호기심 많은 꽃밭 친구' },
  bee: { traits: ['꽃가루를 옮김', '꽃을 좋아함'], voice: '부지런하고 상냥한 정원 친구' },
  ant: { traits: ['힘을 모아 생활함', '땅속 길을 만듦'], voice: '협동심 많고 똑똑한 작은 탐험가' },
  aquatic: { traits: ['물에서 생활함', '물의 움직임을 잘 이용함'], voice: '느긋하고 관찰력이 좋은 연못 친구' },
  dragonfly: { traits: ['날개가 네 장', '빠르게 날 수 있음'], voice: '빠르고 자신감 있는 하늘 친구' },
  mantis: { traits: ['앞다리가 낫처럼 생김', '가만히 기다리는 사냥꾼'], voice: '집중력이 좋은 조용한 숲 친구' },
  grasshopper: { traits: ['뒷다리가 튼튼함', '멀리 뛸 수 있음'], voice: '장난기 많고 활발한 풀밭 친구' },
  'leaf-beetle': { traits: ['잎을 먹으며 살아감', '몸이 작고 관찰력이 좋음'], voice: '조용하지만 호기심 많고 꼼꼼한 잎사귀 탐험가' },
  default: { traits: ['작은 몸', '자연 속에서 살아감'], voice: '친절하고 조심성 많은 자연 친구' },
}

function getInsectFlavor(insect) {
  return FLAVOR_BY_CATEGORY[getSpeciesCategory(insect?.id)] || FLAVOR_BY_CATEGORY.default
}

// 대표 캐릭터(알/유충/번데기/성충)는 화면에서 학습 주제로 선택한 곤충으로 빙의하지 않는
// 별개의 캐릭터다 — 선택된 곤충은 매번 바뀌는 "학습 주제"일 뿐, 대표 캐릭터 자신의 정체성은
// 지금 자라고 있는 단계(성충이면 실제로 자란 종)를 그대로 따라간다.
const DEFAULT_PERSONA = {
  voice: '다정하고 호기심을 키워 주는 자연 선생님',
  traits: ['어린이의 질문을 잘 듣기', '곤충 정보를 쉽고 정확하게 설명하기'],
}

function makeWelcomeMessage(insect, companionName) {
  if (!insect) return `안녕! 나는 ${withCopula(companionName)}. 궁금한 곤충을 선택하면 함께 알아보자!`
  return `안녕! 나는 ${withCopula(companionName)}. 네가 궁금해하는 ${insect.name}에 대해 알려줄게. 궁금한 점을 물어봐 줘.`
}

function pickReply(replies) {
  return replies[Math.floor(Math.random() * replies.length)]
}

function isGreeting(question) {
  return /^(안녕|안녕하세요|하이|헬로|반가워|좋은 아침|좋은 저녁|잘 지냈어)[요?!.\s]*$/i.test(question.trim())
}

// 서버(/chat)가 꺼져 있거나 실패했을 때만 쓰는 오프라인 대체 답변. 서버 프록시가 살아있는 한
// 실제 대화는 항상 서버의 buildSystemPrompt(페르소나 규칙)를 거친다 — 여기서도 같은 3인칭
// 페르소나(알이 선택된 곤충을 설명)를 유지해야 서버가 켜졌을 때와 톤이 어긋나지 않는다.
function localReply(question, insect, insectFlavor, previousMessages = [], companionName, persona) {
  const subject = insect?.name || '이 곤충'
  const iAm = `나는 ${withCopula(companionName)}`

  if (isGreeting(question)) {
    return insect
      ? pickReply([
          `안녕! ${iAm}. 지금은 ${insect.name}에 대해 알아보고 있어. 궁금한 거 물어봐.`,
          `안녕, 반가워! ${iAm}. ${insect.name}에 대해 뭐가 궁금해?`,
        ])
      : pickReply([
          `안녕! ${iAm}. 궁금한 곤충을 고르면 함께 알아보자.`,
          `반가워! ${iAm}. 편하게 질문해 줘.`,
        ])
  }
  if (question.includes('이름') || question.includes('누구') || (question.includes('뭐야') && question.includes('너'))) {
    return insect ? `${iAm}. 지금은 ${insect.name}에 대해 함께 알아보고 있어.` : `${iAm}. 궁금한 곤충을 선택하면 함께 알아보자.`
  }
  if (DANGEROUS_WORDS.some((word) => question.includes(word))) {
    return pickReply([
      '그건 다칠 수 있어서 도와줄 수 없어. 곤충은 눈으로만 관찰하고, 어른과 함께 안전하게 살펴보자!',
      '위험할 수 있는 방법은 알려줄 수 없어. 곤충을 해치지 않는 안전한 관찰 방법을 함께 찾아보자.',
    ])
  }
  if (question.includes('안전') || question.includes('관찰')) {
    return pickReply([
      '조금 떨어져서 눈으로 관찰하자. 곤충을 괴롭히거나 서식지를 망가뜨리지 말고, 관찰이 끝나면 원래 있던 곳에 두면 좋아.',
      '손으로 잡기보다 조용히 눈으로 살펴보는 게 좋아. 움직임과 생김새를 기록하면 더 오래 기억할 수 있어.',
    ])
  }
  if (question.includes('색') || question.includes('빛깔')) {
    const colorMatch = insect?.feature?.match(/[^.]*색[^.]*/)
    return colorMatch
      ? `도감에는 "${colorMatch[0].trim()}"이라고 적혀 있어.`
      : `${subject}의 색은 도감 이미지에서 확인하는 게 제일 정확해. 화면에 보이는 모습을 같이 살펴볼까?`
  }
  if (question.includes('어디') || question.includes('살')) {
    return pickReply([
      `${subject}은 ${insect?.habitatName || '자연 속'}에서 발견될 수 있어. 정확한 장소는 날씨와 계절에 따라 달라질 수 있어!`,
      `${subject}을 찾고 싶다면 ${insect?.habitatName || '자연 속'}을 천천히 살펴봐. 계절과 날씨에 따라 보이는 장소가 달라질 수 있어!`,
    ])
  }
  if (question.includes('먹')) {
    return pickReply([
      `${subject}의 먹이는 종류와 성장 단계에 따라 달라. 지금 가진 정보만으로는 확실히 말하기 어려워.`,
      `${subject}은 자라는 시기에 따라 먹이가 조금씩 달라져. 도감 설명과 발견한 환경을 함께 살펴보자.`,
    ])
  }
  const lastUserMessage = [...previousMessages].reverse().find((message) => message.from === 'user')
  const contextHint = lastUserMessage ? ` 아까 네가 "${lastUserMessage.text}"라고 물어본 것과 이어서 생각해 볼 수 있어.` : ''
  const flavorText = insect ? `${subject}은 ${insectFlavor.voice} 같은 곤충이야. 특징은 ${insectFlavor.traits.join(', ')}이야.` : `${iAm}. 나는 ${persona.voice}야.`
  return `${flavorText}${contextHint} 모르는 사실은 지어내지 않을게!`
}

async function askServer(message, history, context, sessionId) {
  const response = await fetch(apiUrl('/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      session_id: sessionId,
      history: history.slice(-10).map(({ from, text }) => ({ role: from === 'ai' ? 'assistant' : 'user', content: text })),
      context,
    }),
  })
  if (!response.ok) throw new Error('chat server unavailable')
  const data = await response.json()
  if (!data.reply) throw new Error('empty reply')
  return data
}

async function loadImageAsDataUrl(imagePath) {
  if (!imagePath) return null
  try {
    const response = await fetch(imagePath)
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export default function AiCompanion() {
  const { user } = useAuth()
  const { representativeCharacter, adultHistory, profileCharacterId, featuredCharacterImage } = useQuests()
  // 가방 '대표 캐릭터' 탭에서 고른 캐릭터가 있으면 그 캐릭터로(예: 지난 성체 "개미"), 없으면
  // 지금 자라는 캐릭터의 현재 단계("알"/"유충"/"번데기", 성충이면 실제 종 이름)로 대화 상대를 소개한다.
  const { name: companionName, speciesName: companionSpeciesName } = useMemo(
    () => getFeaturedCharacterIdentity(representativeCharacter, adultHistory, profileCharacterId),
    [representativeCharacter, adultHistory, profileCharacterId]
  )
  const isDemoAccount = user?.username === DEMO_ACCOUNT_USERNAME
  const [searchParams] = useSearchParams()
  const selectedIdFromUrl = searchParams.get('insectId') || ''
  const urlInsect = INSECT_SPECIES.find((species) => String(species.id) === selectedIdFromUrl)
  const fallbackMessages = [{ id: 'welcome', from: 'ai', text: makeWelcomeMessage(urlInsect, companionName) }]
  const chatStorageKey = getChatStorageKey(selectedIdFromUrl)
  const [messages, setMessages] = useState(() => loadChatState(fallbackMessages, selectedIdFromUrl).messages)
  const [input, setInput] = useState('')
  const [selectedId] = useState(selectedIdFromUrl)
  const [sessionId, setSessionId] = useState(() => loadChatState(fallbackMessages, selectedIdFromUrl).sessionId)
  const [isLoading, setIsLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const recognitionRef = useRef(null)
  const messageSequence = useRef(0)
  const selectedInsect = useMemo(() => INSECT_SPECIES.find((species) => String(species.id) === selectedId), [selectedId])
  const habitatName = selectedInsect ? HABITATS.find((habitat) => habitat.id === selectedInsect.habitatId)?.name : null
  // 대표 캐릭터가 성충이면 그 종의 말투/특징을 대화 상대 자신의 페르소나로 쓰고, 그 전
  // 단계에서는 기본 자연 선생님 톤을 쓴다.
  const companionSpecies = useMemo(
    () => (companionSpeciesName ? INSECT_SPECIES.find((species) => species.name === companionSpeciesName) : null),
    [companionSpeciesName]
  )
  const persona = useMemo(() => (companionSpecies ? getInsectFlavor(companionSpecies) : DEFAULT_PERSONA), [companionSpecies])
  const insectFlavor = useMemo(() => getInsectFlavor(selectedInsect), [selectedInsect])
  const insectProfile = selectedInsect ? { ...selectedInsect, habitatName } : null

  useEffect(() => {
    try {
      window.sessionStorage.setItem(chatStorageKey, JSON.stringify({ messages, sessionId }))
    } catch {
      // 저장소를 못 쓰는 브라우저에서도 대화 자체는 계속 동작한다.
    }
  }, [chatStorageKey, messages, sessionId])

  // 페이지를 벗어나면(뒤로가기 등) 대화를 정리한다 — 새로고침처럼 페이지가 그대로 유지되는
  // 경우에는 이 정리(cleanup)가 실행되지 않으므로 새로고침 후에는 계속 이어지고, 다른
  // 화면으로 나갔다가 같은 곤충으로 다시 들어오면 새 대화로 시작한다.
  useEffect(() => () => {
    try {
      window.sessionStorage.removeItem(chatStorageKey)
    } catch {
      // 저장소를 못 쓰는 브라우저에서는 애초에 남길 것도 없다.
    }
  }, [chatStorageKey])

  useEffect(() => () => {
    recognitionRef.current?.stop()
    window.speechSynthesis?.cancel()
  }, [])

  function speak(text) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 0.95
    window.speechSynthesis.speak(utterance)
  }

  function toggleListening() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event) => setInput(event.results[0][0].transcript)
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
  }

  async function send(text = input) {
    const content = text.trim()
    if (!content || isLoading) return
    // 선택된 곤충은 대화 주제일 뿐, 실제 대화 상대는 언제나 현재 대표 캐릭터다 — 주제 곤충이
    // 있든 없든 메시지를 보낼 때마다 "대표캐릭터와 대화하기" 미션이 진행돼야 한다.
    reportMissionEvent({ type: 'egg_talk' })
    const userMessage = { id: `${++messageSequence.current}-user`, from: 'user', text: content }
    const previousMessages = messages
    setMessages((current) => [...current, userMessage])
    setInput('')
    setIsLoading(true)
    const imageDataUrl = await loadImageAsDataUrl(selectedInsect?.photoUrl || selectedInsect?.image)
    const context = {
      companionName,
      observedInsect: insectProfile
        ? {
            name: insectProfile.name,
            scientificName: insectProfile.scientificName,
            feature: insectProfile.feature,
            image: insectProfile.image,
            imageDataUrl,
            habitat: habitatName,
          }
        : null,
      persona,
      fieldGuide: (() => {
        const speciesList = getInsectSpecies(isDemoAccount)
        return { registered: speciesList.filter((species) => species.registered).length, total: speciesList.length }
      })(),
    }
    try {
      const data = await askServer(content, previousMessages, context, sessionId)
      if (data.session_id) setSessionId(data.session_id)
      setMessages((current) => [...current, { id: `${++messageSequence.current}-ai`, from: 'ai', text: data.reply }])
      if (autoSpeak) speak(data.reply)
    } catch {
      const reply = localReply(content, insectProfile, insectFlavor, previousMessages, companionName, persona)
      setMessages((current) => [...current, { id: `${++messageSequence.current}-ai`, from: 'ai', text: reply }])
      if (autoSpeak) speak(reply)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <FocusedLayout title={selectedInsect ? `${selectedInsect.name}에 대해 알아보기` : companionName}>
      <div className="mx-auto flex h-[70vh] max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-card">
        <div className="border-b border-ivory-200 bg-leaf-50 px-4 py-3">
          <div className="flex items-center gap-3">
            {featuredCharacterImage && (
              <img src={featuredCharacterImage} alt="" className="h-14 w-14 rounded-xl object-contain bg-white" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink-900">{withTopicParticle(companionName)} 대화하기</p>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[82%] items-end gap-2 ${message.from === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.from === 'user' ? 'bg-leaf-500 text-white' : 'bg-ivory-100 text-ink-900'}`}>{message.text}</div>
                {message.from === 'ai' && <button type="button" onClick={() => speak(message.text)} className="shrink-0 text-sm" aria-label="답변 듣기" title="답변 듣기">🔊</button>}
              </div>
            </div>
          ))}
          {isLoading && <div className="text-sm text-ink-700/60">{withSubjectParticle(companionName)} 생각하고 있어…</div>}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 text-xs text-ink-700/70">
          <button type="button" onClick={() => setAutoSpeak((value) => !value)} className="rounded-full bg-ivory-100 px-3 py-1.5">{autoSpeak ? '🔊 자동으로 읽기 켬' : '🔈 자동으로 읽기 끔'}</button>
          <span>{selectedInsect ? `${selectedInsect.name}의 특징을 바탕으로 대화 중` : '곤충을 선택하면 맞춤 대화를 시작해요'}</span>
        </div>
        <form className="flex items-center gap-2 border-t border-ivory-200 p-3" onSubmit={(event) => { event.preventDefault(); void send() }}>
          <input type="text" value={input} onChange={(event) => setInput(event.target.value)} placeholder={`${companionName}에게 궁금한 것을 물어봐!`} className="w-full rounded-full border border-ivory-200 px-4 py-2.5 text-sm outline-none focus:border-leaf-500" maxLength={300} />
          <button type="button" onClick={toggleListening} className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg ${isListening ? 'bg-red-100' : 'bg-ivory-100'}`} aria-label="음성으로 질문하기" title="음성으로 질문하기">🎙️</button>
          <button type="submit" disabled={isLoading || !input.trim()} className="shrink-0 rounded-full bg-leaf-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">보내기</button>
        </form>
      </div>
    </FocusedLayout>
  )
}
