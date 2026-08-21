export default function InsectCard({ name, image, rank, registered, onClick, showRankDot = true, showTutorialPointer }) {
  const rankClass = showRankDot && registered && rank ? `insect-card--${rank}` : ''
  const displayName = registered ? name : '미수집 곤충'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={registered ? name : '미수집 곤충'}
      className={`insect-card relative ${rankClass} flex w-full flex-col gap-2 rounded-xl bg-white p-2 text-left shadow-card transition ${
        registered ? 'hover:-translate-y-0.5 hover:shadow-soft' : 'opacity-85 hover:shadow-soft'
      }`}
    >
      {showTutorialPointer && (
        <span className="pointer-events-none absolute -top-16 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1 whitespace-nowrap">
          <span className="text-4xl drop-shadow-md animate-bounce" aria-hidden="true">👇</span>
          <span className="rounded-full bg-ink-900/85 px-2.5 py-1 text-[10px] font-bold text-white shadow-card">여기를 눌러보세요</span>
        </span>
      )}
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-ivory-50"
      >
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className={`h-full w-full object-contain p-2 ${registered ? '' : 'grayscale opacity-30'}`}
          />
        )}
        {!registered && (
          <div className="absolute inset-0 grid place-items-center bg-ink-900/10">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/85 text-lg font-bold text-ink-700/55 shadow-card">
              ?
            </span>
          </div>
        )}
      </div>
      <div className="flex w-full items-center justify-between px-0.5">
        <span className={`truncate text-sm font-medium ${registered ? 'text-ink-900' : 'text-ink-700/70'}`}>
          {displayName}
        </span>
      </div>
    </button>
  )
}
