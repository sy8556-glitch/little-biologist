import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from '../router/AuthContext'
import { fetchUserState, saveUserState } from '../api/userState'
import { getRepresentativeStage, GROWTH_MAX } from '../data/representativeCharacter'
import { reportMissionEvent } from '../utils/missionEvents'

// leaves(나뭇잎)·growthPoints(성장 포인트)는 계정별 진행도라 로그인한 uid를 기준으로
// 서버(user_state 테이블)에서 불러오고, 증감이 생길 때마다 서버에 저장한다. 저장된 값이
// 없는 신규 계정은 0에서 시작한다. growthPoints는 대표 캐릭터의 성장 단계(알→유충→번데기→성충)를
// 그대로 결정하는 값이라 GROWTH_MAX(30)에서 멈춘다 — 성충에 도달하면 그 이상은 쌓이지 않는다.
const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const { user } = useAuth()
  const [leaves, setLeaves] = useState(0)
  const [growthPoints, setGrowthPoints] = useState(0)
  const [growthStage, setGrowthStage] = useState('egg')
  const [stageUp, setStageUp] = useState(null)
  // 미션 보상 확인 팝업이나 랜덤 곤충 등장 연출처럼, 화면을 이미 차지하고 있는 다른 팝업이
  // 있는 동안엔 부화/진화 연출이 그 위를 덮어버리지 않도록 이 카운트가 0보다 클 때는
  // stageUp을 밖으로 내보내지 않는다. 그 팝업들이 "확인"으로 닫히거나(미션) 도감으로
  // 이동한 뒤(랜덤 곤충) holdStageUp/releaseStageUp으로 이 값을 올리고 내린다.
  const [stageUpHoldCount, setStageUpHoldCount] = useState(0)

  useEffect(() => {
    if (!user?.uid) return
    let cancelled = false
    fetchUserState(user.uid).then((state) => {
      if (cancelled) return
      setLeaves(typeof state.leaves === 'number' ? state.leaves : 0)
      const savedGrowthPoints = typeof state.growthPoints === 'number' ? state.growthPoints : 0
      setGrowthPoints(savedGrowthPoints)
      setGrowthStage(getRepresentativeStage(savedGrowthPoints))
    })
    return () => {
      cancelled = true
    }
  }, [user?.uid])

  const addLeaves = (amount) => {
    setLeaves((current) => {
      const next = current + amount
      if (user?.uid) saveUserState(user.uid, 'leaves', next)
      return next
    })
  }

  const addGrowthPoints = (amount) => {
    if (amount > 0) reportMissionEvent({ type: 'egg_growth_activity', value: 1 })
    setGrowthPoints((current) => {
      const next = Math.max(0, Math.min(GROWTH_MAX, current + amount))
      if (user?.uid) saveUserState(user.uid, 'growthPoints', next)
      const previousStage = getRepresentativeStage(current)
      const nextStage = getRepresentativeStage(next)
      setGrowthStage(nextStage)
      if (nextStage !== previousStage) setStageUp({ from: previousStage, to: nextStage, points: next })
      return next
    })
  }

  const resetGrowthPoints = () => {
    setGrowthPoints(0)
    setGrowthStage('egg')
    if (user?.uid) saveUserState(user.uid, 'growthPoints', 0)
  }

  // 성체(성장 단계 마지막)에 도달했다는 안내 팝업을 닫는 순간, 새 알을 지급하는
  // 'adult-reached' 이벤트를 쏜다 — 실제로 대표 캐릭터를 새로 배정하고 성장포인트를
  // 리셋하는 처리는 그 캐릭터 상태를 들고 있는 QuestsContext.jsx가 이 이벤트를 듣고 한다.
  const dismissStageUp = () => {
    if (stageUp?.to === 'adult') window.dispatchEvent(new CustomEvent('little-biologist:adult-reached'))
    setStageUp(null)
  }

  const holdStageUp = () => setStageUpHoldCount((count) => count + 1)
  const releaseStageUp = () => setStageUpHoldCount((count) => Math.max(0, count - 1))

  return (
    <CurrencyContext.Provider
      value={{
        leaves,
        addLeaves,
        growthPoints,
        addGrowthPoints,
        resetGrowthPoints,
        growthStage,
        stageUp: stageUpHoldCount > 0 ? null : stageUp,
        dismissStageUp,
        holdStageUp,
        releaseStageUp,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider')
  return ctx
}
