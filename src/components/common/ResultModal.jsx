import { createPortal } from 'react-dom'

export default function ResultModal({ open, imageSrc, title, description, confirmLabel = '확인', onConfirm, suppressButtonSfx = false }) {
  if (!open) return null
  // body에 직접 portal로 붙여야 한다 — FocusedLayout의 backdrop-blur 조상 안에서 렌더링되면
  // fixed의 기준이 뷰포트가 아니라 그 조상의 콘텐츠 박스 전체가 되어, 스크롤을 내려야
  // 모달이 보이는 문제가 생긴다.
  return createPortal(
    <div className="result-modal-backdrop" role="dialog" aria-modal="true">
      <div className="result-modal-card">
        <div className={`result-modal-visual ${imageSrc ? 'result-modal-visual--image' : ''}`} aria-hidden="true">
          {imageSrc ? (
            <img src={imageSrc} alt="" />
          ) : (
            <span className="result-modal-leaf-mark" />
          )}
        </div>
        <p className="result-modal-title">{title}</p>
        {description && <p className="result-modal-description">{description}</p>}
        <button
          type="button"
          onClick={onConfirm}
          {...(suppressButtonSfx ? { 'data-click-sfx': 'none' } : {})}
          className="result-modal-button"
        >
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
