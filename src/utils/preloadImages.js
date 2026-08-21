// 연출용 이미지(부화/진화/랜덤곤충 등장)는 용량이 커서, 타이머만 믿고 바로 <img>를 그리면
// 로딩이 안 끝난 채로 다음 단계로 넘어가 버려 장면이 안 보이는 문제가 생긴다. 타이머 시작 전에
// 반드시 이 함수로 먼저 로드를 끝내둔다.
export function preloadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve()
      return
    }
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve() // 깨진 이미지 하나 때문에 연출 전체가 멈추지 않게 한다.
    img.src = src
  })
}

export function preloadImages(sources) {
  return Promise.all(sources.filter(Boolean).map(preloadImage))
}
