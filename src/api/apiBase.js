// 백엔드(server/index.js) 요청 주소를 한 곳에서 관리한다. 프론트엔드와 백엔드를 같은 origin에
// 배포하면(예: 백엔드가 dist를 함께 서빙) VITE_API_BASE_URL을 비워두면 되고, 서로 다른 도메인에
// 나눠 배포하면 빌드 시 VITE_API_BASE_URL로 백엔드 주소(예: https://little-biologist-api.onrender.com)를
// 지정한다. 값이 없으면 지금까지처럼 상대 경로(/api/..., /chat)로 요청하며, 로컬 개발에서는
// vite.config.js의 server.proxy가 그대로 처리한다.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export function apiUrl(path) {
  return `${API_BASE_URL}${path}`
}
