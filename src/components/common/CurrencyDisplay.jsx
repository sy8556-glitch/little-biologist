// 기본 재화는 나뭇잎 하나만 사용한다 (decision-log.md D-002).
// UI 참고 이미지의 골드/보석은 구현하지 않는다.
// 목장(Ranch)의 재화 배지(.ranch-currency-pill)와 동일한 스타일을 다른 화면 헤더에서도 쓴다.
export default function CurrencyDisplay({ amount, onAdd }) {
  return (
    <button
      type="button"
      data-reward-target="currency"
      onClick={onAdd}
      className="ranch-currency-pill"
      aria-label="나뭇잎 충전하러 상점 가기"
    >
      <span aria-hidden="true">
        <img src="/ui/leaf.png" alt="" />
      </span>
      <span>{amount.toLocaleString()}</span>
      {onAdd && (
        <span className="ranch-currency-plus" aria-hidden="true">
          +
        </span>
      )}
    </button>
  )
}
