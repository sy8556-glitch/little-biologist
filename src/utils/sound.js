const LEGACY_SOUND_VOLUME_KEY = 'little-biologist-sound-volume'
const MUSIC_VOLUME_KEY = 'little-biologist-music-volume'
const SFX_VOLUME_KEY = 'little-biologist-sfx-volume'
const DEFAULT_SOUND_VOLUME = 70

export const MUSIC_VOLUME_CHANGE_EVENT = 'little-biologist:music-volume-change'
export const SFX_VOLUME_CHANGE_EVENT = 'little-biologist:sfx-volume-change'
// 예전 이름으로 이 이벤트를 구독하는 코드가 남아 있을 수 있어 별칭으로 계속 내보낸다.
export const SOUND_VOLUME_CHANGE_EVENT = MUSIC_VOLUME_CHANGE_EVENT

const SFX_VOLUME_MULTIPLIER = 1.4
const AUDIO_POOL_SIZE = 3

const audioPools = new Map()

function readVolume(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return DEFAULT_SOUND_VOLUME
    const stored = Number(raw)
    if (!Number.isFinite(stored)) return DEFAULT_SOUND_VOLUME
    return Math.min(100, Math.max(0, stored))
  } catch {
    return DEFAULT_SOUND_VOLUME
  }
}

// BGM/효과음을 분리하기 전에는 하나의 값(LEGACY_SOUND_VOLUME_KEY)으로 둘 다 조절했다. 분리 이후
// 새 키가 아직 한 번도 저장되지 않은 기존 사용자는, 예전에 맞춰둔 값을 그대로 초기값으로 물려받는다.
function readVolumeWithLegacyFallback(key) {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) return readVolume(key)

    const legacyRaw = localStorage.getItem(LEGACY_SOUND_VOLUME_KEY)
    if (legacyRaw !== null) {
      const stored = Number(legacyRaw)
      if (Number.isFinite(stored)) return Math.min(100, Math.max(0, stored))
    }
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 기본값을 쓴다.
  }

  return DEFAULT_SOUND_VOLUME
}

function writeVolume(key, eventName, value) {
  try {
    const clamped = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : DEFAULT_SOUND_VOLUME)))
    localStorage.setItem(key, String(clamped))
    window.dispatchEvent(new Event(eventName))
  } catch {
    // 저장소를 쓸 수 없는 환경에서는 화면 상태만 유지한다.
  }
}

// 프로필 > 시스템 설정의 배경음악 음량(0~100)을 읽고 쓴다. BackgroundMusicController가 이 값을 곱해 적용한다.
export function readMusicVolume() {
  return readVolumeWithLegacyFallback(MUSIC_VOLUME_KEY)
}

export function writeMusicVolume(value) {
  writeVolume(MUSIC_VOLUME_KEY, MUSIC_VOLUME_CHANGE_EVENT, value)
}

// 프로필 > 시스템 설정의 효과음 음량(0~100)을 읽고 쓴다. playSfx가 이 값을 곱해 적용한다.
export function readSfxVolume() {
  return readVolumeWithLegacyFallback(SFX_VOLUME_KEY)
}

export function writeSfxVolume(value) {
  writeVolume(SFX_VOLUME_KEY, SFX_VOLUME_CHANGE_EVENT, value)
}

// 예전 이름으로 이 함수를 호출하는 코드가 남아 있을 수 있어 배경음악 음량의 별칭으로 유지한다.
export function readSoundVolume() {
  return readMusicVolume()
}

export function writeSoundVolume(value) {
  writeMusicVolume(value)
}

function createAudio(src) {
  const audio = new Audio(src)
  audio.preload = 'auto'
  audio.load()
  return audio
}

// 같은 효과음이 연속으로 겹쳐 재생될 때(버튼 연타 등) 끊기지 않도록 소스별로 오디오 인스턴스를
// 여러 개 돌려쓴다.
function getAudioPool(src) {
  let pool = audioPools.get(src)
  if (!pool) {
    pool = Array.from({ length: AUDIO_POOL_SIZE }, () => createAudio(src))
    audioPools.set(src, pool)
  }
  return pool
}

export function primeSfx(src) {
  try {
    if (!src) return
    getAudioPool(src)
  } catch {
    // no-op
  }
}

export function primeSfxList(srcList) {
  for (const src of srcList) {
    primeSfx(src)
  }
}

function playAudioInstance(audio, src, volume) {
  // 아직 메타데이터가 로드되지 않은 인스턴스에서는 currentTime 리셋이 예외를 던질 수 있는데,
  // 그것 때문에 재생 자체(아래 play())까지 막히면 안 돼서 따로 감싼다.
  try {
    audio.currentTime = 0
  } catch {
    // no-op
  }
  audio.volume = Math.min(1, Math.max(0, volume * (readSfxVolume() / 100) * SFX_VOLUME_MULTIPLIER))
  const playResult = audio.play()
  if (!playResult) return
  playResult.catch(() => {
    // 재사용 중이던 풀 인스턴스가 직전 재생과 겹치거나(AbortError) 아직 버퍼링 중이라(readyState
    // 부족) play()가 거부되면, 소리가 아예 안 나는 대신 완전히 새 인스턴스로 한 번 더 시도한다 —
    // "퀴즈 정답/오답 사운드가 가끔 안 들린다"는 신고가 바로 이 조용한 실패 때문이었다.
    playAudioInstance(createAudio(src), src, volume)
  })
}

// 브라우저 자동재생 정책·미지원 환경에서도 화면 흐름이 끊기지 않도록, 재시도까지 실패하면 조용히 무시한다.
export function playSfx(src, { volume = 1 } = {}) {
  try {
    const pool = getAudioPool(src)
    const audio = pool.shift() ?? createAudio(src)
    pool.push(audio)
    playAudioInstance(audio, src, volume)
  } catch {
    // no-op
  }
}
