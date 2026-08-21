// 목업 데이터. 실제 서버 연동 전까지 화면 뼈대 확인용.
// 참고: decision-log.md D-002(나뭇잎 단일 재화), D-003(금/은/동 등급, 별점 미사용)
import { INSECT_TOTAL, INSECT_REGISTERED_COUNT } from './insectSpecies'

export const mockUser = {
  nickname: '자연 탐험가',
  expToNext: 500,
  leaves: 9999,
  intimacy: 68, // 대표 알 캐릭터 친밀도 (성장 게이지)
  intimacyMax: 100,
  eggStage: '유아기', // 대표 알 캐릭터 성장 단계
  fieldGuideCount: INSECT_REGISTERED_COUNT, // 실제 80종 자산(insectSpecies.js) 기준으로 계산
  fieldGuideTotal: INSECT_TOTAL,
  achievementRate: 28,
  totalLoginDays: 27,
}

// 서식지 목록은 src/data/insectSpecies.js의 HABITATS를 사용한다 (실제 목장 배경/오브젝트 자산 기반).

export const mockQuests = {
  daily: [
    { id: 'q1', title: '탐험을 떠나보자', desc: '오늘 탐험 지역을 1회 방문해요.', progress: 1, total: 1, rewardLeaf: 50, claimed: false, done: true },
    { id: 'q2', title: '도감에 기록하기', desc: '새로운 생물을 도감에 1회 등록해요.', progress: 1, total: 1, rewardLeaf: 40, claimed: false, done: true },
    { id: 'q3', title: 'AI 말벗과 대화하기', desc: 'AI 말벗과 1회 대화해요.', progress: 1, total: 1, rewardLeaf: 30, claimed: false, done: true },
  ],
  weekly: [
    { id: 'w1', title: '도감 3종 새로 등록하기', desc: '이번 주에 새로운 생물 3종을 등록해요.', progress: 3, total: 3, rewardLeaf: 200, claimed: false, done: true },
  ],
  achievement: [
    { id: 'a1', title: '곤충 10종 수집', desc: '도감에 곤충 10종을 등록해요.', progress: 10, total: 10, rewardLeaf: 300, claimed: false, done: true },
  ],
  event: [],
}

export const mockFriends = [
  { id: 'f1', friendCode: 'GREEN-0142', nickname: '초록나무', level: 14, fieldGuideCount: 86, status: 'accepted' },
  { id: 'f2', friendCode: 'BUGDR-0091', nickname: '곤충박사', level: 13, fieldGuideCount: 72, status: 'accepted' },
  { id: 'f3', friendCode: 'FLWR-0207', nickname: '꽃잎소녀', level: 11, fieldGuideCount: 65, status: 'pending' },
]

export const mockShopItems = {
  // 실제 현금 결제(재화 충전)는 보호자·법적 검토 완료 전이라, UI만 미리 보여주고 구매 버튼은
  // 아무 동작도 하지 않는다(Shop.jsx 참고). priceWon은 실제 통화 가격(원)이라 나뭇잎을 쓰는
  // 다른 상점 아이템의 priceLeaf와 구분해서 쓴다.
  currency: [
    { id: 'c1', name: '나뭇잎 100개', desc: '기본 충전 패키지', leafAmount: 100, priceWon: 1200, image: '/currency/100개.png', buttonImage: '/currency/1200원.png' },
    { id: 'c2', name: '나뭇잎 300개', desc: '알뜰 충전 패키지', leafAmount: 300, priceWon: 3000, image: '/currency/300개.png', buttonImage: '/currency/3000원.png' },
    { id: 'c3', name: '나뭇잎 700개', desc: '인기 충전 패키지', leafAmount: 700, priceWon: 6000, image: '/currency/700개.png', buttonImage: '/currency/6000원.png' },
    { id: 'c4', name: '나뭇잎 1500개', desc: '최대 충전 패키지', leafAmount: 1500, priceWon: 12000, image: '/currency/1500개.png', buttonImage: '/currency/12000원.png' },
  ],
  item: [
    { id: 's3', name: '나무 벤치', desc: '목장 인테리어 아이템', priceLeaf: 120, category: 'interior', theme: 'basic', image: '/interior/나무 벤치.png' },
    { id: 's4', name: '울타리', desc: '목장 인테리어 아이템', priceLeaf: 90, category: 'interior', theme: 'basic', image: '/interior/울타리.png' },
    { id: 's5', name: '의자', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/의자.png' },
    { id: 's6', name: '가로등', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/가로등.png' },
    { id: 's7', name: '건초더미', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/건초더미.png' },
    { id: 's8', name: '꽃1', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/꽃1.png' },
    { id: 's9', name: '꽃2', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/꽃2.png' },
    { id: 's10', name: '꽃수레', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/꽃수레.png' },
    { id: 's11', name: '데크', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/데크.png' },
    { id: 's12', name: '돌담', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/돌담.png' },
    { id: 's13', name: '물통', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/물통.png' },
    { id: 's14', name: '버섯', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/버섯.png' },
    { id: 's15', name: '부들', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/부들.png' },
    { id: 's16', name: '우물', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/우물.png' },
    { id: 's17', name: '캠프파이어', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/캠프파이어.png' },
    { id: 's18', name: '테이블', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/테이블.png' },
    { id: 's19', name: '통나무', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/통나무.png' },
    { id: 's20', name: '팻말', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/팻말.png' },
    { id: 's21', name: '풍차', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/풍차.png' },
    { id: 's22', name: '해먹', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/해먹.png' },
    { id: 's23', name: '허수아비', desc: '목장 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'basic', image: '/interior/허수아비.png' },
    { id: 's24', name: '겨울 가로등', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 가로등.png' },
    { id: 's25', name: '겨울 건초더미', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 건초더미.png' },
    { id: 's26', name: '겨울 꽃', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 꽃.png' },
    { id: 's27', name: '겨울 꽃2', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 꽃2.png' },
    { id: 's28', name: '겨울 꽃수레', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 꽃수레.png' },
    { id: 's29', name: '겨울 나무 벤치', desc: '겨울 테마 인테리어 아이템', priceLeaf: 120, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 나무 벤치.png' },
    { id: 's30', name: '겨울 데크', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 데크.png' },
    { id: 's31', name: '겨울 돌담', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 돌담.png' },
    { id: 's32', name: '겨울 물통', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 물통.png' },
    { id: 's33', name: '겨울 부들', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 부들.png' },
    { id: 's34', name: '겨울 우물', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 우물.png' },
    { id: 's35', name: '겨울 울타리', desc: '겨울 테마 인테리어 아이템', priceLeaf: 90, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 울타리.png' },
    { id: 's36', name: '겨울 캠프파이어', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 켐프파이어.png' },
    { id: 's37', name: '겨울 테이블', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 테이블.png' },
    { id: 's38', name: '겨울 통나무', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 통나무.png' },
    { id: 's39', name: '겨울 팻말', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 팻말.png' },
    { id: 's40', name: '겨울 풍차', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 풍차.png' },
    { id: 's41', name: '겨울 해먹', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 해먹.png' },
    { id: 's42', name: '겨울 허수아비', desc: '겨울 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'winter', image: '/interior/winter/겨울 허수아비.png' },
    { id: 's43', name: '바다 가로등', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 가로등.png' },
    { id: 's44', name: '바다 건초더미', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 건초더미.png' },
    { id: 's45', name: '바다 꽃', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 꽃.png' },
    { id: 's46', name: '바다 꽃2', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 꽃2.png' },
    { id: 's47', name: '바다 꽃수레', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 꽃수레.png' },
    { id: 's48', name: '바다 나무벤치', desc: '바다 테마 인테리어 아이템', priceLeaf: 120, category: 'interior', theme: 'sea', image: '/interior/sea/바다 나무벤치.png' },
    { id: 's49', name: '바다 데크', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 데크.png' },
    { id: 's50', name: '바다 돌담', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 돌담.png' },
    { id: 's51', name: '바다 물통', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 물통.png' },
    { id: 's52', name: '바다 버들', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 버들.png' },
    { id: 's53', name: '바다 산호초', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 산호초.png' },
    { id: 's54', name: '바다 우물', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 우물.png' },
    { id: 's55', name: '바다 울타리', desc: '바다 테마 인테리어 아이템', priceLeaf: 90, category: 'interior', theme: 'sea', image: '/interior/sea/바다 울타리.png' },
    { id: 's56', name: '바다 캠프파이어', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 캠프파이어.png' },
    { id: 's57', name: '바다 테이블', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 테이블.png' },
    { id: 's58', name: '바다 통나무', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 통나무.png' },
    { id: 's59', name: '바다 팻말', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 팻말.png' },
    { id: 's60', name: '바다 풍차', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 풍차.png' },
    { id: 's61', name: '바다 해먹', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 해먹.png' },
    { id: 's62', name: '바다 허수아비', desc: '바다 테마 인테리어 아이템', priceLeaf: 100, category: 'interior', theme: 'sea', image: '/interior/sea/바다 허수아비.png' },
    { id: 's63', name: '가로 길', desc: '목장 인테리어 아이템', priceLeaf: 1, category: 'interior', theme: 'basic', image: '/interior/road/가로.png' },
    { id: 's64', name: '세로 길', desc: '목장 인테리어 아이템', priceLeaf: 1, category: 'interior', theme: 'basic', image: '/interior/road/세로.png' },
    { id: 's65', name: '대각선 길 1', desc: '목장 인테리어 아이템', priceLeaf: 1, category: 'interior', theme: 'basic', image: '/interior/road/대각선1.png' },
    { id: 's66', name: '대각선 길 2', desc: '목장 인테리어 아이템', priceLeaf: 1, category: 'interior', theme: 'basic', image: '/interior/road/대각선2.png' },
  ],
}

export const mockBagItems = [
  { id: 'b1', name: '나무 벤치', category: 'interior', qty: 3, placed: 1, image: '/interior/나무 벤치.png' },
]
