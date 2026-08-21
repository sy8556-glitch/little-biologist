import { useLocation } from 'react-router-dom'
import AppHeader from './AppHeader'
import RanchBackButton from './RanchBackButton'
import { getFeatureBackground } from '../../data/featureBackgrounds'

// AGENTS.md §11 / screen-requirements.md: 도감·퀘스트·AI말벗 등은
// '목장으로 돌아가기' 중심의 집중형 내비게이션을 사용하고, 전체 사이드바를 복원하지 않는다.
// 현재 경로에 맞는 배경 이미지(featureBackgrounds.js)가 있으면 옅게 깔고, 본문은 반투명 카드
// 위에 올려서 가독성을 유지한다.
export default function FocusedLayout({ title, icon, iconSrc, actions, backTo, backLabel, children }) {
  const location = useLocation()
  const backgroundImage = getFeatureBackground(location.pathname)

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden">
      {backgroundImage && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(255, 252, 245, 0.72), rgba(255, 248, 233, 0.84)), url('${backgroundImage}')`,
          }}
        />
      )}
      <AppHeader leftSlot={<RanchBackButton to={backTo} label={backLabel} />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <div className={backgroundImage ? 'rounded-3xl bg-white/72 p-4 shadow-soft backdrop-blur-[2px] sm:p-5' : ''}>
          {title && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900">
                {iconSrc ? (
                  <span className="grid h-16 w-16 place-items-center overflow-visible" aria-hidden="true">
                    <img src={iconSrc} alt="" className="h-16 w-16 scale-110 object-contain drop-shadow-sm" />
                  </span>
                ) : icon ? (
                  <span aria-hidden="true">{icon}</span>
                ) : null}
                {title}
              </h1>
              {actions}
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
