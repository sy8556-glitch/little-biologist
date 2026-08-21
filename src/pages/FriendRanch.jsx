import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MainLayout from '../components/common/MainLayout'
import RanchCamera from '../components/common/RanchCamera'
import RanchMapScene from '../components/common/RanchMapScene'
import PlacedItemsLayer from '../components/common/PlacedItemsLayer'
import { HABITATS } from '../data/insectSpecies'
import { getRepresentativeCharacterImage, GROWTH_MAX } from '../data/representativeCharacter'
import { useAuth } from '../router/AuthContext'
import { reportMissionEvent } from '../utils/missionEvents'

// friends.md: "목장 방문"은 평소 자기 목장 화면과 같은 구성(대객체·배치 그대로, 진행도는
// 친구 것)으로 보여주되, 편집·미션·상점 등 내 것만 의미 있는 하단 UI 대신 뒤로가기/친구 도감
// 구경하기 두 버튼만 둔다 — Ranch.jsx를 그대로 재사용하지 않고 읽기 전용으로 새로 구성한다.
export default function FriendRanch() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ranch, setRanch] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGuestbookOpen, setIsGuestbookOpen] = useState(false)
  const [isGuestbookLoading, setIsGuestbookLoading] = useState(false)
  const [guestbookEntries, setGuestbookEntries] = useState([])
  const [guestMessage, setGuestMessage] = useState('')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/uid 변경 시 1회 서버에서 불러오는 표준 패턴
    setIsLoading(true)
    fetch(`/api/ranch/${encodeURIComponent(uid)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setRanch(data)
      })
      .catch(() => {
        if (!cancelled) setRanch(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    reportMissionEvent({ type: 'friend_visit' })
    return () => {
      cancelled = true
    }
  }, [uid])

  async function openGuestbook() {
    setIsGuestbookOpen(true)
    setIsGuestbookLoading(true)
    try {
      const response = await fetch(`/api/guestbook/${encodeURIComponent(uid)}`)
      const { entries } = await response.json()
      setGuestbookEntries(entries || [])
    } catch {
      setGuestbookEntries([])
    } finally {
      setIsGuestbookLoading(false)
    }
  }

  async function submitGuestbook() {
    if (!guestMessage.trim()) return
    try {
      const response = await fetch(`/api/guestbook/${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorUid: user?.uid, message: guestMessage.trim() }),
      })
      if (response.ok) {
        reportMissionEvent({ type: 'guestbook' })
        setGuestMessage('')
        const refreshed = await fetch(`/api/guestbook/${encodeURIComponent(uid)}`)
        const { entries } = await refreshed.json()
        setGuestbookEntries(entries || [])
      }
    } catch {
      // 방명록 등록 실패는 조용히 무시 — 입력값은 유지해서 다시 시도할 수 있게 한다.
    }
  }

  const friendAvatarImage = getRepresentativeCharacterImage(ranch?.representativeCharacter) ?? '/ui/egg-clean.png'

  return (
    <MainLayout showHeader={false} showBottomNav={false}>
      <div className="relative h-screen min-h-0 overflow-hidden bg-ink-950">
        {isLoading ? (
          <p className="grid h-full place-items-center text-sm text-white/70">목장을 불러오는 중...</p>
        ) : !ranch ? (
          <p className="grid h-full place-items-center text-sm text-white/70">목장을 불러오지 못했어요</p>
        ) : (
          <RanchCamera>
            <RanchMapScene
              habitats={HABITATS}
              stats={ranch.habitatStats}
              positions={ranch.positions}
              scales={ranch.scales}
              onSelect={(h) => navigate(`/friends/ranch/${uid}/${h.id}`)}
            />
            <PlacedItemsLayer placements={ranch.placements} isEditing={false} onSelect={() => {}} />
          </RanchCamera>
        )}

        {/* 상단: 친구 프로필 (내 목장의 프로필 카드와 같은 모양 — 아바타 + 닉네임 + 성장 포인트 바) */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
          <div className="ranch-profile-cluster pointer-events-auto">
            <button
              type="button"
              onClick={() => setIsProfileModalOpen(true)}
              className="ranch-profile-card"
              aria-label={`${ranch?.nickname ?? '친구'}님 프로필 보기`}
            >
              <img className="ranch-profile-avatar" src={friendAvatarImage} alt="" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <span className="block text-sm font-black text-ink-900">{ranch?.nickname ?? '친구'}</span>
                <span className="flex items-center gap-1.5" aria-label={`성장 포인트 ${ranch?.growthPoints ?? 0}/${GROWTH_MAX}`}>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-leaf-100">
                    <span
                      className="block h-full rounded-full bg-leaf-500 transition-[width]"
                      style={{ width: `${Math.min(100, ((ranch?.growthPoints ?? 0) / GROWTH_MAX) * 100)}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-[9px] font-bold tabular-nums text-ink-700/70">
                    {ranch?.growthPoints ?? 0}/{GROWTH_MAX}
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* 우측 상단: 방명록 버튼 — 내 목장의 편집/방명록 버튼과 같은 위치·모양(아이콘 전용). */}
        <div className="absolute right-1 top-[9rem] z-50 flex flex-col items-end">
          <button type="button" onClick={openGuestbook} className="ranch-edit-button">
            <img className="ranch-action-button__image ranch-action-button__image--guestbook" src="/ui/guestbook-action.png" alt="방명록 보기" />
          </button>
        </div>

        {/* 하단 좌측: 내 목장의 도감/탐험/소셜... 바로가기 대신 뒤로가기 + 친구 도감 구경하기만 둔다. */}
        <div className="absolute bottom-6 left-4 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => navigate('/friends')}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-card hover:bg-ivory-100"
          >
            <span aria-hidden="true">←</span>
            돌아가기
          </button>
          <button
            type="button"
            onClick={() => navigate(`/friends/field-guide/${encodeURIComponent(uid)}`)}
            className="flex items-center gap-1.5 rounded-full bg-leaf-500 px-4 py-2.5 text-sm font-semibold text-white shadow-card hover:bg-leaf-600"
          >
            <span aria-hidden="true">📖</span>
            친구 도감 구경하기
          </button>
        </div>

        {isGuestbookOpen && (
          <div className="ranch-modal-backdrop" role="presentation" onClick={() => setIsGuestbookOpen(false)}>
            <div className="ranch-modal" role="dialog" aria-modal="true" aria-label="방명록" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ranch-modal-close" onClick={() => setIsGuestbookOpen(false)} aria-label="닫기">×</button>
              <div className="ranch-guestbook-modal-logo" aria-label={`${ranch?.nickname ?? '친구'}의 방명록`}>
                <span className="ranch-guestbook-modal-owner">{ranch?.nickname ?? '친구'}의</span>
                <img src="/ui/guestbook-action.png" alt="방명록" />
              </div>
              {isGuestbookLoading ? (
                <p className="mt-4 text-sm text-ink-700/60">불러오는 중...</p>
              ) : guestbookEntries.length === 0 ? (
                <p className="mt-4 text-sm text-ink-700/60">아직 남겨진 방명록이 없어요.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-2">
                  {guestbookEntries.map((entry) => (
                    <li key={entry.id} className="rounded-lg bg-ivory-100 p-3 text-sm">
                      <p className="font-semibold text-ink-900">{entry.visitorNickname}</p>
                      <p className="text-ink-700/80">{entry.message}</p>
                      <p className="mt-1 text-xs text-ink-700/50">{entry.created_at}</p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={guestMessage}
                  onChange={(event) => setGuestMessage(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && submitGuestbook()}
                  placeholder="방명록을 남겨보세요"
                  className="w-full rounded-full border border-ivory-200 px-4 py-2 text-sm outline-none focus:border-leaf-500"
                />
                <button
                  type="button"
                  onClick={submitGuestbook}
                  className="shrink-0 rounded-full bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600"
                >
                  등록
                </button>
              </div>
            </div>
          </div>
        )}

        {isProfileModalOpen && ranch && (
          <div className="ranch-modal-backdrop" role="presentation" onClick={() => setIsProfileModalOpen(false)}>
            <div className="ranch-modal ranch-profile-modal" role="dialog" aria-modal="true" aria-label="탐험가 정보" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ranch-modal-close" onClick={() => setIsProfileModalOpen(false)} aria-label="닫기">×</button>
              <div className="ranch-profile-modal-hero">
                <div className="relative">
                  <div className="ranch-profile-modal-avatar">
                    <img src={friendAvatarImage} alt="" className="h-full w-full object-contain p-1" />
                  </div>
                </div>
                <div className="ranch-profile-modal-info">
                  <p className="ranch-profile-modal-rank">EXPLORER</p>
                  <div className="ranch-profile-modal-name-row">
                    <h2>{ranch.nickname}</h2>
                  </div>
                  <p className="ranch-profile-modal-subtitle">자연 탐험가</p>
                </div>
                <div className="ranch-profile-modal-currency">
                  <img src="/ui/leaf.png" alt="" aria-hidden="true" />
                  <span>{(ranch.leaves ?? 0).toLocaleString()}</span>
                  {/* .ranch-profile-modal-currency span:last-child은 원래 "+" 버튼용 크기(1.2rem)
                      규칙이라, 이 span이 없으면 그 규칙이 나뭇잎 개수 span에 그대로 걸려 잘린다.
                      친구 화면은 충전 버튼이 필요 없어서 빈 span으로 그 자리만 대신 채운다. */}
                  <span aria-hidden="true" />
                </div>
              </div>
              <div className="ranch-profile-modal-stats">
                <div className="ranch-stat-tile"><span>도감</span><strong>{ranch.fieldGuideCount ?? 0}/{ranch.fieldGuideTotal ?? 0}</strong></div>
                <div className="ranch-stat-tile"><span>성장 포인트</span><strong>{ranch.growthPoints ?? 0}</strong></div>
                <div className="ranch-stat-tile"><span>출석</span><strong>{ranch.totalLoginDays ?? 0}일</strong></div>
                <div className="ranch-stat-tile"><span>나뭇잎</span><strong>{ranch.leaves ?? 0}</strong></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
