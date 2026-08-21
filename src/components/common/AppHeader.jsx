import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CurrencyDisplay from './CurrencyDisplay'
import AnnouncementBoard from './AnnouncementBoard'
import { useAuth } from '../../router/AuthContext'
import { useCurrency } from '../../context/CurrencyContext'
import { useQuests } from '../../context/QuestsContext'
import { GROWTH_MAX } from '../../data/representativeCharacter'

// screen-requirements.md §1: 공통 UI는 프로필, 레벨, 성장 게이지, 나뭇잎, 알림, 설정을 포함할 수 있다.
export default function AppHeader({ leftSlot }) {
  const navigate = useNavigate()
  const { leaves, growthPoints } = useCurrency()
  const { user } = useAuth()
  const { featuredCharacterImage } = useQuests()
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false)

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-ivory-200 bg-ivory-50/90 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        {leftSlot}
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex min-w-0 items-center gap-2 rounded-full px-1 py-1 hover:bg-ivory-100"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-leaf-100" aria-hidden="true">
            {featuredCharacterImage ? (
              <img src={featuredCharacterImage} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-lg">🦋</span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-2 text-left">
            <span className="block max-w-[8rem] truncate text-sm font-semibold text-ink-900">{user?.nickname}</span>
            <span className="flex items-center gap-1.5">
              <span
                data-reward-target="growth-points"
                className="h-2 w-20 overflow-hidden rounded-full bg-leaf-100 sm:w-28"
                role="progressbar"
                aria-label="성장포인트"
                aria-valuenow={growthPoints}
                aria-valuemin="0"
                aria-valuemax={GROWTH_MAX}
              >
                <span
                  className="block h-full rounded-full bg-leaf-500"
                  style={{ width: `${Math.min(100, (growthPoints / GROWTH_MAX) * 100)}%` }}
                />
              </span>
              <span className="whitespace-nowrap text-[10px] font-bold text-ink-700/70">
                {growthPoints}/{GROWTH_MAX}
              </span>
            </span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <CurrencyDisplay amount={leaves} onAdd={() => navigate('/shop')} />
        <button
          type="button"
          aria-label="알림"
          onClick={() => setIsAnnouncementOpen(true)}
          className="ranch-top-icon-button"
        >
          <img src="/ui/alarm-icon-sq.png" alt="" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="설정"
          onClick={() => navigate('/profile/edit')}
          className="ranch-top-icon-button"
        >
          <img src="/ui/settings-icon-v3.png" alt="" aria-hidden="true" />
        </button>
      </div>
      <AnnouncementBoard open={isAnnouncementOpen} onClose={() => setIsAnnouncementOpen(false)} />
    </header>
  )
}
