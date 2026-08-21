// 하루 한 번만 풀 수 있는 오늘의 퀴즈 게이트. 계정별 서버 상태가 아니라 브라우저 로컬에만
// 저장한다 — sound.js의 음량 설정처럼 기기별 설정에 가까운 값이라 계정 동기화는 필요 없다.
const QUIZ_COMPLETED_KEY_PREFIX = 'little-biologist-quiz-completed-date'
const LEGACY_QUIZ_COMPLETED_KEY = 'little-biologist-quiz-completed-date'

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getQuizCompletedKey(accountId) {
  return `${QUIZ_COMPLETED_KEY_PREFIX}:${accountId || 'unknown'}`
}

export function isQuizCompletedToday(accountId) {
  try {
    // 이전 버전의 전체 공용 키는 계정 간 상태를 섞으므로 더 이상 사용하지 않는다.
    localStorage.removeItem(LEGACY_QUIZ_COMPLETED_KEY)
    const key = getQuizCompletedKey(accountId)
    const completedDate = localStorage.getItem(key)
    if (completedDate !== getLocalDateKey()) {
      // 날짜가 바뀌면 이전 완료 기록을 즉시 정리해 다음 퀴즈를 허용한다.
      if (completedDate) localStorage.removeItem(key)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function markQuizCompletedToday(accountId) {
  try {
    localStorage.setItem(getQuizCompletedKey(accountId), getLocalDateKey())
  } catch {
    // 저장할 수 없는 환경에서도 현재 화면의 퀴즈 흐름은 계속 진행한다.
  }
}
