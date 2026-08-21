import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusedLayout from '../components/common/FocusedLayout'
import EmptyState from '../components/common/EmptyState'
import { useAuth } from '../router/AuthContext'
import { reportMissionEvent } from '../utils/missionEvents'
import { NatureButton, NatureCard, NaturePage, NaturePanel, NatureSectionTitle, NatureTab } from '../components/common/NatureUI'
import { Leaf, Search, Sprout } from 'lucide-react'

// friends.md: 닉네임이 아닌 친구 ID(uid)로 검색. 실시간 대화/선물 없음, 방명록 사용.
// screen-requirements.md §7: 친구 활동 피드 제거, 대화·선물 버튼 제거.
// "목장 방문"은 이 페이지 안에 미리보기를 그리지 않고 FriendRanch.jsx(/friends/ranch/:uid)로
// 이동한다 — 평소 자기 목장 화면과 같은 전체 화면 구성으로 보여주기 위해서다.
export default function Friends() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState('list')
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState([])

  const [searchId, setSearchId] = useState('')
  const [searchResult, setSearchResult] = useState(undefined)
  const [searchMessage, setSearchMessage] = useState('')

  function copyId() {
    navigator.clipboard?.writeText(user?.uid ?? '')
  }

  async function loadFriends() {
    if (!user?.uid) return
    try {
      const response = await fetch(`/api/friends?uid=${encodeURIComponent(user.uid)}`)
      const { friends: list } = await response.json()
      setFriends(list || [])
    } catch {
      setFriends([])
    }
  }

  async function loadRequests() {
    if (!user?.uid) return
    try {
      const response = await fetch(`/api/friends/requests?uid=${encodeURIComponent(user.uid)}`)
      const { requests: list } = await response.json()
      setRequests(list || [])
    } catch {
      setRequests([])
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 서버 목록을 불러오는 표준 패턴
    loadFriends()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  async function handleSearch() {
    const query = searchId.trim()
    setSearchMessage('')
    if (!query) {
      setSearchResult(undefined)
      return
    }
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(query)}`)
      if (!response.ok) {
        setSearchResult(null)
        return
      }
      const { user: found } = await response.json()
      setSearchResult(found)
    } catch {
      setSearchResult(null)
    }
  }

  async function sendFriendRequest(targetUid) {
    setSearchMessage('')
    try {
      const response = await fetch('/api/friends/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterUid: user?.uid, targetUid }),
      })
      if (response.ok) {
        setSearchMessage('친구 요청을 보냈어요')
        reportMissionEvent({ type: 'friend_add' })
        return
      }
      const { error } = await response.json().catch(() => ({}))
      if (error === 'ALREADY_FRIENDS') setSearchMessage('이미 친구예요')
      else if (error === 'REQUEST_ALREADY_SENT') setSearchMessage('이미 요청을 보냈어요')
      else if (error === 'CANNOT_ADD_SELF') setSearchMessage('나 자신은 추가할 수 없어요')
      else setSearchMessage('요청을 보내지 못했어요')
    } catch {
      setSearchMessage('요청을 보내지 못했어요')
    }
  }

  async function acceptRequest(requestId) {
    await fetch(`/api/friends/requests/${requestId}/accept`, { method: 'POST' })
    loadRequests()
    loadFriends()
  }

  async function rejectRequest(requestId) {
    await fetch(`/api/friends/requests/${requestId}/reject`, { method: 'POST' })
    loadRequests()
  }

  function visitFriend(friend) {
    navigate(`/friends/ranch/${encodeURIComponent(friend.uid)}`)
  }

  const isSearchResultFriend = searchResult && friends.some((f) => f.uid === searchResult.uid)
  const isSearchResultSelf = searchResult && searchResult.uid === user?.uid

  return (
    <FocusedLayout>
      <NaturePage>
        <NatureSectionTitle iconSrc="/ui/social.png" title="친구" />

        <div className="mb-5 flex flex-wrap gap-3">
          {[
            { id: 'list', label: '친구 목록' },
            { id: 'requests', label: '친구 요청' },
          ].map((t) => (
            <NatureTab key={t.id} onClick={() => setTab(t.id)} active={tab === t.id}>
              {t.label}
            </NatureTab>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            <div className="mb-4 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Sprout className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--nature-sprout)]" size={18} aria-hidden="true" />
                <input
                  type="text"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="친구 ID(uid)로 검색하세요"
                  className="nature-input w-full px-11 py-3 text-sm outline-none focus:border-leaf-500"
                />
              </div>
              <NatureButton onClick={handleSearch} className="flex shrink-0 items-center gap-2 px-5">
                <Search size={16} aria-hidden="true" />
                검색
              </NatureButton>
            </div>

            {searchResult !== undefined && (
              <NatureCard className="mb-4">
                {searchResult ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{searchResult.nickname}</p>
                      <p className="truncate text-xs text-ink-700/70">{searchResult.uid}</p>
                    </div>
                    {isSearchResultSelf ? (
                      <span className="text-xs text-ink-700/60">나예요</span>
                    ) : isSearchResultFriend ? (
                      <NatureButton variant="secondary" onClick={() => visitFriend(searchResult)} className="shrink-0 px-4 py-2 text-xs">
                        목장 방문
                      </NatureButton>
                    ) : (
                      <NatureButton onClick={() => sendFriendRequest(searchResult.uid)} className="shrink-0 px-4 py-2 text-xs">
                        친구 요청
                      </NatureButton>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-sm text-ink-700/70">해당 ID의 친구를 찾을 수 없어요</p>
                )}
                {searchMessage && <p className="mt-2 text-center text-xs text-ink-700/70">{searchMessage}</p>}
              </NatureCard>
            )}

            {tab === 'list' ? (
              <ul className="flex flex-col gap-3">
                {friends.map((f) => (
                  <li key={f.uid} className="nature-card flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{f.nickname}</p>
                      <p className="truncate text-xs text-ink-700/70">{f.uid}</p>
                    </div>
                    <NatureButton variant="secondary" onClick={() => visitFriend(f)} className="shrink-0 px-4 py-2 text-xs">
                      목장 방문
                    </NatureButton>
                  </li>
                ))}
                {friends.length === 0 && (
                  <li className="nature-empty">
                    <div>
                      <Sprout className="mx-auto mb-3 text-[var(--nature-green)]" size={42} aria-hidden="true" />
                      <p className="text-lg font-black text-[var(--nature-ink)]">아직 친구가 없어요</p>
                    </div>
                  </li>
                )}
              </ul>
            ) : (
              <ul className="flex flex-col gap-3">
                {requests.map((r) => (
                  <li key={r.id} className="nature-card flex items-center justify-between gap-3">
                    <p className="font-semibold text-ink-900">{r.nickname}</p>
                    <div className="flex gap-2">
                      <NatureButton onClick={() => acceptRequest(r.id)} className="px-3 py-1.5 text-xs">
                        수락
                      </NatureButton>
                      <NatureButton variant="secondary" onClick={() => rejectRequest(r.id)} className="px-3 py-1.5 text-xs">
                        거절
                      </NatureButton>
                    </div>
                  </li>
                ))}
                {requests.length === 0 && <EmptyState title="받은 친구 요청이 없어요" />}
              </ul>
            )}
          </div>

          <NaturePanel className="self-start">
            <p className="mb-3 flex items-center gap-2 text-lg font-black text-[var(--nature-ink)]">
              <Leaf size={18} className="text-[var(--nature-green)]" aria-hidden="true" />
              나의 ID
            </p>
            <p className="mb-4 rounded-2xl border border-[var(--nature-line)] bg-[#fff7e6] px-3 py-3 text-center font-mono text-sm text-[var(--nature-ink)]">{user?.uid}</p>
            <NatureButton onClick={copyId} className="w-full">
              ID 복사·공유하기
            </NatureButton>
          </NaturePanel>
        </div>
      </NaturePage>
    </FocusedLayout>
  )
}
