import { useEffect } from 'react'
import { primeSfxList } from '../../utils/sound'
import { getRanchHabitatSoundSrc, getGrassStageSoundSrc } from '../../utils/habitatSound'
import { SFX } from '../../utils/sfx'

const PRELOAD_SOURCES = [
  SFX.buttonDefault,
  SFX.buttonTutorial,
  SFX.currencyPurchase,
  SFX.missionReward,
  SFX.titleReward,
  SFX.gachaResult,
  SFX.dailyQuizComplete,
  SFX.quizCorrect,
  SFX.quizWrong,
  SFX.registerGold,
  SFX.registerSilver,
  SFX.registerBronze,
  SFX.newEgg,
  SFX.eggToLarva,
  SFX.larvaToPupa,
  SFX.pupaToAdult,
  getRanchHabitatSoundSrc('soil'),
  getRanchHabitatSoundSrc('forest'),
  getRanchHabitatSoundSrc('pond'),
  getRanchHabitatSoundSrc('street-trees'),
  getRanchHabitatSoundSrc('grass'),
  getGrassStageSoundSrc(0),
  getGrassStageSoundSrc(1),
].filter(Boolean)

export default function SoundAssetPreloader() {
  useEffect(() => {
    // 초기 JS/이미지 로딩과 네트워크 커넥션을 다투지 않도록, 페이지가 한숨 돌린 뒤(유휴 시간)
    // 프리로드를 시작한다. requestIdleCallback이 없는 환경(Safari 등)은 setTimeout으로 대체.
    const schedule = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 200))
    const cancel = window.cancelIdleCallback || window.clearTimeout
    const handle = schedule(() => primeSfxList(PRELOAD_SOURCES))
    return () => cancel(handle)
  }, [])

  return null
}
