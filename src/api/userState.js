// 계정별 진행도(퀘스트/업적/도감등록/나뭇잎/목장배치 등)를 server/db.js의 user_state 테이블에
// 저장/조회하는 얇은 클라이언트. 키 하나가 기존에 각 Context가 쓰던 localStorage 키 하나에 대응한다.
import { apiUrl } from './apiBase'

export async function fetchUserState(uid) {
  if (!uid) return {}
  try {
    const response = await fetch(apiUrl(`/api/state/${uid}`))
    if (!response.ok) return {}
    const { state } = await response.json()
    return state || {}
  } catch {
    return {}
  }
}

export async function saveUserState(uid, key, value) {
  if (!uid) return
  try {
    await fetch(apiUrl(`/api/state/${uid}/${key}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    })
  } catch {
    // 네트워크 오류 시에도 화면 상태는 이미 반영돼 있으니 조용히 무시한다(다음 저장 시도에서 다시 맞춰짐).
  }
}

export const REPRESENTATIVE_CHARACTER_KEY = 'representativeCharacter'
