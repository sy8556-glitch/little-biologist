import { useEffect, useRef } from 'react'
import { readMusicVolume, MUSIC_VOLUME_CHANGE_EVENT } from '../../utils/sound'

const BACKGROUND_MUSIC_SRC = '/sounds/backgroundmusic.mp3'
const BASE_VOLUME = 0.35

// 목장뿐 아니라 탐험/도감/소셜/가방/미션/상점/퀴즈 등 앱 전체에서 계속 재생되는 배경음악.
// App.jsx 최상단에 한 번만 마운트되어 페이지 이동과 무관하게 오디오 인스턴스를 유지한다.
let backgroundMusicAudio = null
// 상점처럼 화면 전용 배경음악이 이 공용 배경음악을 대신 재생 중일 때 true — 이 동안은 아래
// "자동재생 막히면 클릭/키입력 시 재시도" 리스너가 이 배경음악을 다시 틀면 안 된다(그러면
// 상점 화면에서 뭘 누를 때마다 목장 배경음악이 다시 겹쳐 들리게 된다).
let isSuppressed = false
// 개발 모드 StrictMode가 useSceneBackgroundMusic을 마운트→정리→재마운트로 두 번 돌릴 때,
// 정리 단계에서 곧바로 resumeBackgroundMusic()을 부르면 그 찰나에 공용 배경음악이 잠깐
// 재개됐다가 다시 멈추는 게 들린다. 재개를 타이머로 미뤄두고, 바로 이어지는 재마운트의
// pauseBackgroundMusic()이 그 타이머를 취소하게 해서 진짜 화면 이탈일 때만 재개되게 한다.
let pendingResumeTimer = null
// 서식지(대객체) 내부처럼 전용 효과음을 공용 배경음악 위에 겹쳐 틀 때, 공용 배경음악 소리를
// 줄여서 효과음이 묻히지 않게 하는 배율(1 = 원래 크기). useSceneBackgroundMusic의
// duckGlobalMusic 옵션이 이 값을 조절한다.
let duckFactor = 1

function getBackgroundMusicAudio() {
  if (!backgroundMusicAudio) {
    backgroundMusicAudio = new Audio(BACKGROUND_MUSIC_SRC)
    backgroundMusicAudio.loop = true
    backgroundMusicAudio.preload = 'auto'
  }
  return backgroundMusicAudio
}

function applyVolume(audio) {
  audio.volume = BASE_VOLUME * (readMusicVolume() / 100) * duckFactor
}

// factor(0~1)만큼 공용 배경음악 볼륨을 낮춘다. 서식지 화면이 마운트되어 있는 동안만 적용하고,
// 나가면 restoreBackgroundMusicDuck()으로 원래 크기로 되돌린다.
export function duckBackgroundMusic(factor) {
  duckFactor = factor
  if (backgroundMusicAudio) applyVolume(backgroundMusicAudio)
}

export function restoreBackgroundMusicDuck() {
  duckFactor = 1
  if (backgroundMusicAudio) applyVolume(backgroundMusicAudio)
}

function tryPlay(audio) {
  audio.play()?.catch(() => {})
}

// 상점처럼 화면 전용 배경음악을 따로 트는 곳에서, 그동안 이 공용 배경음악은 잠깐 멈춰야 한다
// (동시에 두 음악이 겹치지 않도록). ShopBgm 같은 컴포넌트가 마운트/언마운트될 때 호출한다.
export function pauseBackgroundMusic() {
  if (pendingResumeTimer) {
    window.clearTimeout(pendingResumeTimer)
    pendingResumeTimer = null
  }
  isSuppressed = true
  backgroundMusicAudio?.pause()
}

export function resumeBackgroundMusic() {
  isSuppressed = false
  if (!backgroundMusicAudio) return
  applyVolume(backgroundMusicAudio)
  tryPlay(backgroundMusicAudio)
}

// 화면 전용 배경음악이 언마운트될 때 쓰는 지연 재개 — 진짜 화면 이탈이면 곧 재개되고,
// StrictMode의 즉시 재마운트라면 pauseBackgroundMusic()이 먼저 호출되어 취소된다.
function scheduleResumeBackgroundMusic() {
  pendingResumeTimer = window.setTimeout(() => {
    pendingResumeTimer = null
    resumeBackgroundMusic()
  }, 0)
}

// 상점·서식지 화면처럼 그 화면에 있는 동안만 전용 배경음악을 트는 곳에서 공통으로 쓰는 훅.
// 기본값(suppressGlobalMusic: true)은 마운트되는 동안 공용 배경음악(BackgroundMusicController)을
// 멈추고, 언마운트되면(그 화면을 떠나면) 다시 재개한다 — 상점처럼 화면 전용 음악이 공용 배경음악을
// "대체"하는 경우. 서식지(대객체) 내부처럼 전용 효과음을 공용 배경음악 위에 "겹쳐서" 같이 들려주고
// 싶으면 suppressGlobalMusic: false를 넘긴다 — 이땐 공용 배경음악을 끄지 않고 계속 튼다.
// 이때 공용 배경음악이 너무 커서 전용 효과음이 묻히면, duckGlobalMusic(0~1 배율)으로 공용
// 배경음악 볼륨만 그만큼 줄인 채 겹쳐 들려줄 수 있다 — 화면을 나가면 원래 크기로 복구된다.
// src가 바뀌면(예: 풀밭 서식지의 꽃밭<->나무 전환) 재생 중인 전용 트랙만 새 src로 바꿔 끊김 없이 이어간다.
export function useSceneBackgroundMusic(src, { volume = 0.35, suppressGlobalMusic = true, duckGlobalMusic = null } = {}) {
  const audioRef = useRef(null)

  useEffect(() => {
    if (!suppressGlobalMusic) return undefined
    pauseBackgroundMusic()
    return () => {
      audioRef.current?.pause()
      scheduleResumeBackgroundMusic()
    }
  }, [suppressGlobalMusic])

  useEffect(() => {
    if (suppressGlobalMusic || duckGlobalMusic === null) return undefined
    duckBackgroundMusic(duckGlobalMusic)
    return () => {
      restoreBackgroundMusicDuck()
    }
  }, [suppressGlobalMusic, duckGlobalMusic])

  useEffect(() => {
    audioRef.current?.pause()
    if (!src) {
      audioRef.current = null
      return undefined
    }

    const audio = new Audio(src)
    audio.loop = true
    audio.volume = volume * (readMusicVolume() / 100)
    audio.play()?.catch(() => {})
    audioRef.current = audio

    const resumeOnInteraction = () => audio.play()?.catch(() => {})
    const syncVolume = () => {
      audio.volume = volume * (readMusicVolume() / 100)
    }

    window.addEventListener('pointerdown', resumeOnInteraction)
    window.addEventListener('keydown', resumeOnInteraction)
    window.addEventListener(MUSIC_VOLUME_CHANGE_EVENT, syncVolume)

    return () => {
      audio.pause()
      window.removeEventListener('pointerdown', resumeOnInteraction)
      window.removeEventListener('keydown', resumeOnInteraction)
      window.removeEventListener(MUSIC_VOLUME_CHANGE_EVENT, syncVolume)
    }
  }, [src, volume])
}

export default function BackgroundMusicController() {
  useEffect(() => {
    let audio = null
    let resumePlayback = null
    let syncVolume = null

    // new Audio(src)는 만들어지는 즉시 네트워크에서 받아오기 시작한다(2.4MB) — 어차피 자동재생
    // 정책 때문에 첫 재생은 사용자의 첫 클릭/키입력까지 기다려야 하므로, 오디오 객체 생성 자체도
    // 초기 JS/이미지 로딩과 경합하지 않도록 유휴 시간까지 늦춘다.
    const schedule = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 200))
    const cancelSchedule = window.cancelIdleCallback || window.clearTimeout

    const handle = schedule(() => {
      audio = getBackgroundMusicAudio()
      applyVolume(audio)

      // 브라우저 자동재생 정책으로 첫 재생이 막히면, 사용자가 화면을 처음 터치/클릭/키입력할 때 다시 시도한다.
      // 단, 상점처럼 전용 배경음악이 대신 재생 중일 때(isSuppressed)는 건드리지 않는다.
      //
      // isSuppressed 판정은 반드시 다음 틱으로 미뤄야 한다: 예를 들어 앱을 막 열자마자 하단 내비의
      // "상점" 버튼을 누르면, pointerdown이 가장 먼저 발생해 이 리스너가 즉시 실행되는데, 이 시점엔
      // 아직 React Router의 네비게이션과 Shop의 pauseBackgroundMusic() 이펙트(패시브 이펙트라 커밋
      // 이후로 지연 실행됨)가 반영되기 전이라 isSuppressed가 여전히 false다. 그 상태에서 바로
      // tryPlay를 부르면 공용 배경음악이 잠깐 켜졌다가 상점 전용 음악과 겹쳐 들린다. setTimeout(0)으로
      // 미루면 그사이 Shop의 이펙트가 먼저 반영되어 isSuppressed가 true로 바뀐 뒤 이 검사를 하게 된다.
      resumePlayback = () => {
        window.setTimeout(() => {
          if (isSuppressed) return
          tryPlay(audio)
        }, 0)
      }
      resumePlayback()

      syncVolume = () => applyVolume(audio)

      window.addEventListener('pointerdown', resumePlayback)
      window.addEventListener('keydown', resumePlayback)
      window.addEventListener(MUSIC_VOLUME_CHANGE_EVENT, syncVolume)
    })

    return () => {
      cancelSchedule(handle)
      if (resumePlayback) window.removeEventListener('pointerdown', resumePlayback)
      if (resumePlayback) window.removeEventListener('keydown', resumePlayback)
      if (syncVolume) window.removeEventListener(MUSIC_VOLUME_CHANGE_EVENT, syncVolume)
    }
  }, [])

  return null
}
