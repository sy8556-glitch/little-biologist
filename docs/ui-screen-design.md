# 리틀 바이올로지스트 — UI 화면 설계서

> 이 문서는 `prompts/` 폴더의 AI/디자인 프롬프트(화면이 지향해야 할 규칙)와는 별개로, **현재 실제 구현된 코드(src/App.jsx, src/pages/\*)를 기준으로** 각 화면의 구조·상태·데이터 흐름·이동 경로를 정리한 참고 문서입니다. 코드가 바뀌면 이 문서도 함께 갱신이 필요합니다.

## 0. 공통 구조

### 라우팅 (src/App.jsx)
- 모든 페이지는 `lazy()`로 코드 스플리팅됩니다.
- `/` 와 정의되지 않은 경로(`*`)는 `/login`으로 리다이렉트됩니다.
- `/login`, `/signup`은 `AuthRouteLayout`으로 감싸며 `ProtectedRoute`를 거치지 않습니다(비로그인 화면).
- 그 외 모든 라우트는 `ProtectedRoute`로 감싸져 있어, `AuthContext`(sessionStorage 기반)의 `isAuthenticated`가 `false`면 `/login`으로 리다이렉트됩니다.
- `/profile`과 `/profile/edit`은 **같은 컴포넌트**(`Profile.jsx`)를 재사용하며, 경로가 `/edit`로 끝나는지(`isEditMode`)로 보기 전용/편집 모드를 구분합니다.

**전체 라우트 목록**

| 경로 | 컴포넌트 | 보호 여부 |
|---|---|---|
| `/login` | `auth/Login.jsx` | 비보호 |
| `/signup` | `auth/Signup.jsx` | 비보호 |
| `/ranch` | `Ranch.jsx` | 보호 |
| `/ranch/:habitatId` | `RanchHabitat.jsx` | 보호 |
| `/exploration` | `Exploration.jsx` | 보호 |
| `/field-guide` | `FieldGuide.jsx` | 보호 |
| `/quests` | `Quests.jsx` | 보호 |
| `/friends` | `Friends.jsx` | 보호 |
| `/friends/ranch/:uid` | `FriendRanch.jsx` | 보호 |
| `/friends/ranch/:uid/:habitatId` | `FriendRanchHabitat.jsx` | 보호 |
| `/friends/field-guide/:uid` | `FriendFieldGuide.jsx` | 보호 |
| `/shop` | `Shop.jsx` | 보호 |
| `/bag` | `Bag.jsx` | 보호 |
| `/ai-companion` | `AiCompanion.jsx` | 보호 |
| `/quiz` | `Quiz.jsx` | 보호 |
| `/profile`, `/profile/edit` | `Profile.jsx` | 보호 |

### Provider 계층 (바깥 → 안쪽)
`AuthProvider` → `CurrencyProvider` → `QuestsProvider` → `BagProvider` → `RegisteredPhotosProvider` → `TutorialProvider`

전역 오버레이 컴포넌트(`GrowthStageModal`, `BackgroundMusicController`, `ButtonSoundController`, `SoundAssetPreloader`)는 라우트 밖 App.jsx 레벨에서 항상 마운트되어 있습니다. `TutorialOverlay`도 마찬가지로 모든 보호된 화면 위에 조건부로 뜰 수 있습니다(`/login`, `/signup` 제외).

### 레이아웃 종류
1. **`AuthRouteLayout`** — 로그인/가입 전용. `AuthScreen`(배경 그림 + 로고 + 반투명 유리 카드)을 한 번만 마운트하고 내부 콘텐츠만 크로스페이드로 전환합니다.
2. **`MainLayout`** — 목장류 화면(내 목장, 친구 목장) 전용. `h-screen overflow-hidden`으로 스크롤 없는 고정 뷰포트를 씁니다. `showHeader`/`showBottomNav` prop이 있지만, 현재 두 사용처(Ranch, FriendRanch) 모두 둘 다 꺼두고 자체 오버레이 UI만 사용합니다.
3. **`FocusedLayout`** — 목장류를 제외한 대부분의 화면(탐험/도감/미션/친구/상점/가방/AI말벗/퀴즈/프로필/친구도감)에서 사용. 상단 `AppHeader`(프로필·성장게이지·나뭇잎·알림·설정) + 좌측 `RanchBackButton`(목장으로 돌아가기, `backTo`로 커스텀 가능)을 공통으로 둡니다. 현재 경로와 매칭되는 배경 이미지(`featureBackgrounds.js`)가 있으면 옅게 깔고, 본문을 반투명 카드 위에 올립니다.
4. **완전 커스텀** — `RanchHabitat`, `FriendRanchHabitat`은 레이아웃 컴포넌트를 쓰지 않고 전체화면 배경 + `RanchCamera`(팬/줌)로 직접 구성합니다. 헤더/하단내비가 없습니다.

### 공통 상태 컴포넌트
- `EmptyState` — 🌱 아이콘 + 제목 + 설명
- `ErrorState` — 🌧️ 아이콘 + "다시 시도하기" 버튼
- `LoadingOverlay` — 스피너
- `ResultModal` — 공용 확인 모달(body에 portal)
- `ConfirmationModal` — 구매/확인용 예·아니오 모달

---

## 1. 로그인 (Login)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/login` → `src/pages/auth/Login.jsx` (실제 폼은 `LoginForm.jsx`) |
| 용도 | 서비스 진입점. 아이디/비밀번호로 `/api/login` 호출 후 로그인, 성공 시 `/ranch`로 이동 |
| 레이아웃 | `AuthRouteLayout` (별도 래퍼 없이 AuthScreen 배경·로고 공유) |
| 구성 | 로고 → "로그인하고 탐험을 시작해요!" 배지 타이틀 → 아이디/비밀번호 입력 폼 → 로그인 버튼 → 회원가입 링크 |
| 인터랙션 | 아이디/비밀번호 입력, 로그인 버튼 제출, "처음이신가요? 회원가입하기" 링크 |
| 상태 | idle / loading("로그인 중...") / error(AuthToast: 빈 입력·자격증명 불일치·네트워크 오류) — success는 즉시 `/ranch` 이동으로 대체 |
| 데이터소스 | `/api/login` POST → 성공 시 `login(user)`로 AuthContext에 저장(sessionStorage) |
| 이동 | → `/signup`, 성공 시 `/ranch` · 여기로 오는 경로: 앱 최초 진입, 미인증 상태에서 보호 라우트 접근, 로그아웃 |

## 2. 회원가입 (Signup)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/signup` → `src/pages/auth/Signup.jsx` (`SignupForm.jsx`) |
| 용도 | 신규 계정 생성(아이디/비밀번호/닉네임). 성공 시 `/ranch`로 이동하며 `state:{firstLogin:true}`를 전달해 알 획득 연출+튜토리얼을 트리거 |
| 레이아웃 | Login과 동일한 `AuthRouteLayout` |
| 구성 | 로고 → "닉네임을 정하고 알을 만나보세요" → 아이디/비밀번호/닉네임 입력 → 가입 버튼 → 로그인 링크 |
| 인터랙션 | 3개 입력 필드, 제출 버튼, "이미 계정이 있으신가요? 로그인" 링크 |
| 상태 | 에러는 AuthToast(예: "이미 사용 중인 아이디예요"), success는 즉시 네비게이션 |
| 데이터소스 | `/api/signup` POST |
| 이동 | → `/login` · 여기로: Login의 "회원가입하기" 링크 |

## 3. 목장 (Ranch) — 메인 허브

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/ranch` → `src/pages/Ranch.jsx` |
| 용도 | 로그인 후 최초 진입 화면이자 앱의 허브. 대표 캐릭터 성장, 서식지 탐색 진입점, 인테리어 배치 편집, 각종 팝업(프로필/미션/방명록/알림)의 집합소. 튜토리얼도 이 화면을 중심으로 진행 |
| 레이아웃 | `MainLayout showHeader={false} showBottomNav={false}` — 헤더·하단내비 없이 전체 화면을 목장 배경(`RanchMapScene`, `RanchCamera`로 팬/줌)이 채우고 나머지는 전부 오버레이 |

**구성 요소 (위 → 아래, z-순)**
- `RanchCamera` 내부: `RanchMapScene`(서식지 대객체 + 날씨 반영), `PlacedItemsLayer`(배치된 인테리어), `RandomInsectEffect`(랜덤 곤충 등장), `EggFirstRevealEffect`(최초 로그인 시 알 획득 연출)
- 좌상단: 탐험가 프로필 카드(아바타·닉네임·대표칭호·대표배지·성장게이지) → 클릭 시 프로필 모달
- 우상단: 알림 버튼(`AnnouncementBoard`), 설정 버튼(`/profile/edit`)
- 우측: 날씨 뱃지(접기/펴기, 위치기반 실제 날씨 API)
- 우측 중단: 편집 버튼(대객체/배치 편집 모드 토글), 방명록 버튼
- 좌하단(비편집 시): 탐험도우미 버튼(도움말/튜토리얼 재시작), 사이드 HUD 내비게이션(탐험/도감/소셜/가방/미션/상점/퀴즈 바로가기, 미션 뱃지)
- 편집 모드: 대객체 크기 슬라이더, 배치 인테리어 크기 슬라이더+회수 버튼, 가방에서 넘어온 경우 인테리어 꺼내기 트레이

| 항목 | 내용 |
|---|---|
| 인터랙션/모달 | 프로필 모달(대표 캐릭터·칭호·배지 선택), 방명록 모달, 미션 목록 모달(진행률+보상수령), 퀴즈 소진 안내 ResultModal, 서식지 클릭 → `/ranch/:habitatId`, 편집완료 버튼 |
| 상태 | 날씨: loading("날씨 확인 중")/error("날씨 불러오기 실패")/ready 3상태 명시 처리. 방명록: loading/empty("아직 남겨진 방명록이 없어요")/success 처리. 그 외 대부분은 로컬 컨텍스트라 loading/error 상태가 따로 없음 |
| 데이터소스 | `useCurrency`, `useQuests`, `useBag`, `useRegisteredPhotos`, `useTutorial`; 서버 직접 호출 `/api/guestbook/:uid`(GET), `fetchUserState`/`saveUserState`(habitatPositions·habitatScales·primaryTitleId·primaryBadgeId 등), 날씨는 `fetchRanchWeather`(Geolocation + 외부 날씨 API) |
| 이동 | → `/ranch/:habitatId`, `/exploration`, `/field-guide`, `/friends`, `/bag`, `/quests`, `/shop`, `/quiz`, `/profile/edit` · 여기로: 로그인/가입 성공, 대부분의 FocusedLayout 화면의 "목장으로 돌아가기", Bag의 "목장에 배치"(자동 편집모드 진입) |

## 4. 서식지 상세 (RanchHabitat)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/ranch/:habitatId` → `src/pages/RanchHabitat.jsx` |
| 용도 | 목장 내 특정 서식지(숲/연못·습지/흙 속/가로수/풀밭)에 들어가 등록된 곤충을 관찰. 풀밭은 꽃밭/나무 2단계 배경 전환이 있음 |
| 레이아웃 | 완전 커스텀 전체화면(`bg-ink-950`), 레이아웃 컴포넌트 미사용 |
| 구성 | `ZoneBannerOverlay`(입장 시 존 이름 배너), `RanchCamera`(배경+곤충 팬/줌), 상단 버튼줄(목장 복귀/도감 이동/곤충 위치 편집/정보패널 토글/나무·꽃밭 전환), 하단좌측 정보 패널(서식지 설명, 등록 수, 선택 곤충 상세+"도감에서 보기") |
| 인터랙션 | 곤충 아이콘 클릭(선택), 편집모드 위치 드래그(로컬스토리지 저장), 정보패널 토글, 단계 전환(풀밭), "도감에서 보기" → `/field-guide` |
| 상태 | 명시적 loading/error 없음(정적 즉시 렌더). "곤충을 선택해 주세요" placeholder가 사실상 empty state |
| 데이터소스 | `useRegisteredPhotos`(실등록 종 계산), `useTutorial`, 정적 `insectSpecies.js` |
| 이동 | → `/ranch`, `/field-guide`(state로 종 id 전달) · 여기로: Ranch에서 서식지 클릭 |

## 5. 탐험 (Exploration)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/exploration` → `src/pages/Exploration.jsx` |
| 용도 | 사진 촬영/업로드 또는 그림(자유/따라그리기)으로 곤충을 AI 분석해 도감에 등록. 서버 CLIP/iNaturalist API 연동 |
| 레이아웃 | `FocusedLayout`(내부에 `NatureSectionTitle`로 타이틀+설명+동네 지도 아이콘) |

**화면 흐름 (status state 기반)**
idle(초기: 지도+사진/그림 기록 카드) → photoUpload / drawingChoice(직접그리기 vs 따라그리기) → drawingUpload(파일+힌트) 또는 traceSelect(곤충 검색·선택) → traceReference(캔버스) → loading(분석 중) → candidates(후보 리스트, 신뢰도%) → success(ResultModal, 등록 완료) 또는 lowConfidence(ErrorState)

| 항목 | 내용 |
|---|---|
| 인터랙션 | 사진/그림 업로드, 그림 특징 힌트 선택(날개/머리/색상/무늬/다리모양), 자유 텍스트 설명, `DrawingCanvas`, 후보 카드 클릭(등록 확정), "이 중에는 없어요"(추가 후보) |
| 상태 | idle/loading/success/empty(traceSelect의 EmptyState)/error(lowConfidence) — 6개 상태 중 5개를 명시적으로 처리 |
| 데이터소스 | `/api/classify-insect`, `/api/predict-drawing`(POST FormData, 503이면 최대 15회 재시도), `useRegisteredPhotos`, 정적 `INSECT_SPECIES` |
| 이동 | → 성공 시 `/field-guide`(state로 등록 종 id 전달) · 여기로: Ranch 사이드 HUD "탐험", 튜토리얼 |

## 6. 도감 (FieldGuide)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/field-guide` → `src/pages/FieldGuide.jsx` |
| 용도 | 전체 곤충 도감 열람. 등록 종은 금(사진)/은(그림)/동(기본) 등급 이미지, 미등록 종은 잠금 표시 |
| 레이아웃 | `FocusedLayout`(내부 자체 헤더) |
| 구성 | 상단 헤더(아이콘+제목+진행률바+검색창+먹이사슬 피라미드 버튼) → 카테고리 필터 탭 → 좌측 카드 그리드 + 우측 상세 패널(sticky, 등급 선택, 이미지, 특징 요약, 서식지 태그, "~에 대해 알아보기") |
| 인터랙션 | 검색, 카테고리 전환, 카드 클릭, 등급(금/은/동) 전환, 먹이사슬 피라미드 모달, "~에 대해 알아보기" → `/ai-companion?insectId=` |
| 상태 | empty(검색결과없음/수집한곤충없음/분류미채움), 상세 미선택 시 EmptyState. loading/error 없음(로컬 컨텍스트) |
| 데이터소스 | `useRegisteredPhotos`, 정적 `INSECT_SPECIES`/`getInsectSpecies`, `useTutorial` |
| 이동 | → `/ai-companion?insectId=` · 여기로: Ranch 사이드 HUD "도감", RanchHabitat, Exploration 성공 모달, 튜토리얼 |

## 7. 미션 (Quests)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/quests` → `src/pages/Quests.jsx` |
| 용도 | 일일/주간/업적/칭호/이벤트 미션 확인 및 보상 수령(나뭇잎+성장포인트, 칭호/배지는 별도 보상) |
| 레이아웃 | `FocusedLayout title="미션"` |
| 구성 | 2열 그리드: 좌측(탭 5개+미션 리스트+페이지네이션), 우측(CharacterDialogue — 대표 캐릭터 말풍선) |
| 인터랙션 | 탭 전환, 미션별 "보상 받기"/"수령 완료" 버튼, 페이지네이션(4개씩) |
| 상태 | empty("진행 중인 미션이 없어요"). 보상 수령은 ResultModal(이미수령/칭호획득/배지획득/보상획득 분기), 성장게이지로 날아가는 파티클 연출 |
| 데이터소스 | `useQuests`(quests, claim), `useCurrency`(holdStageUp/releaseStageUp) |
| 이동 | 하위 이동 없음(헤더 통해 프로필/알림/목장복귀만) · 여기로: Ranch 사이드 HUD "미션", 튜토리얼 |

## 8. 친구 (Friends)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/friends` → `src/pages/Friends.jsx` |
| 용도 | 친구 목록/요청 관리, uid로 친구 검색·추가, 친구 목장 방문 진입점. 실시간 대화·선물은 없고 방명록으로 대체 |
| 레이아웃 | `FocusedLayout` |
| 구성 | 탭(친구목록/친구요청) + 2열 그리드: 좌측(검색창+결과+목록), 우측(내 ID 표시+복사 버튼) |
| 인터랙션 | uid 검색, 친구 요청 보내기, 요청 수락/거절, "목장 방문" → `/friends/ranch/:uid`, ID 복사·공유 |
| 상태 | empty("아직 친구가 없어요", "받은 친구 요청이 없어요"), 검색결과 없음 처리. 요청 실패 시 토스트("이미 친구예요"/"이미 요청을 보냈어요"/"나 자신은 추가할 수 없어요" 등) |
| 데이터소스 | `/api/friends?uid=`, `/api/friends/requests?uid=`(GET), `/api/users/:query`(GET), `/api/friends/requests`(POST), `/api/friends/requests/:id/accept`\|`/reject`(POST) |
| 이동 | → `/friends/ranch/:uid` · 여기로: Ranch 사이드 HUD "소셜" |

## 9. 친구 목장 (FriendRanch)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/friends/ranch/:uid` → `src/pages/FriendRanch.jsx` |
| 용도 | 친구 목장을 읽기 전용으로 방문(배치 재현), 방명록 작성 가능 |
| 레이아웃 | `MainLayout showHeader={false} showBottomNav={false}` (Ranch.jsx와 골격은 같지만 읽기 전용으로 별도 구현) |
| 구성 | 상단 친구 프로필 카드, 우상단 방명록 버튼, 하단좌측 돌아가기+"친구 도감 구경하기" |
| 인터랙션 | 서식지 클릭 → `/friends/ranch/:uid/:habitatId`, 방명록 열기(조회+작성), 프로필 모달(보기 전용). 편집·미션·상점 등 자기 목장 전용 UI는 의도적으로 제외 |
| 상태 | loading("목장을 불러오는 중...")/error("목장을 불러오지 못했어요") 명시 처리. 방명록도 loading/empty 처리 |
| 데이터소스 | `/api/ranch/:uid`(GET), `/api/guestbook/:uid`(GET/POST) |
| 이동 | → `/friends`, `/friends/ranch/:uid/:habitatId`, `/friends/field-guide/:uid` · 여기로: Friends의 "목장 방문" |

## 10. 친구 서식지 상세 (FriendRanchHabitat)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/friends/ranch/:uid/:habitatId` → `src/pages/FriendRanchHabitat.jsx` |
| 용도 | 친구 목장의 특정 서식지를 읽기 전용으로 관찰(RanchHabitat.jsx와 동일 배치, 편집/튜토리얼/미션 없음) |
| 레이아웃 | 완전 커스텀 전체화면(RanchHabitat과 동일 구조, 편집모드/드래그 없음) |
| 인터랙션 | 곤충 선택, 정보패널(항상 열림 — RanchHabitat과 차이점), "도감에서 보기" → `/friends/field-guide/:uid`, 단계전환(풀밭) |
| 상태 | loading("불러오는 중...") 명시 처리(전체화면 대체 렌더) |
| 데이터소스 | `/api/field-guide/:uid`(GET) |
| 이동 | → `/friends/ranch/:uid`, `/friends/field-guide/:uid` · 여기로: FriendRanch에서 서식지 클릭 |

## 11. 친구 도감 (FriendFieldGuide)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/friends/field-guide/:uid` → `src/pages/FriendFieldGuide.jsx` |
| 용도 | 친구 도감을 읽기 전용으로 열람(FieldGuide.jsx와 동일 레이아웃/등급배지, 등록 액션 없음) |
| 레이아웃 | `FocusedLayout title="{닉네임}님의 도감" backTo="/friends/ranch/:uid"` (직접 지정된 backTo — 대부분의 다른 화면은 기본값 `/ranch`) |
| 인터랙션 | FieldGuide와 거의 동일(검색/카테고리 필터/카드 선택/등급 전환/먹이사슬 피라미드/"~에 대해 알아보기"). "수집한 곤충" 필터 탭은 없음 |
| 상태 | loading("불러오는 중...") 명시 처리, empty(검색결과없음/분류미채움/카드 미선택) |
| 데이터소스 | `/api/field-guide/:uid`(GET) |
| 이동 | → `/ai-companion?insectId=`, 뒤로가기(`/friends/ranch/:uid`) · 여기로: FriendRanch "친구 도감 구경하기", FriendRanchHabitat |

## 12. 상점 (Shop)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/shop` → `src/pages/Shop.jsx` |
| 용도 | 나뭇잎으로 아이템 구매(가방확장권 등), 캐시(재화 충전 — 실제 결제 미구현), 뽑기, 인테리어 아이템 구매 |
| 레이아웃 | `FocusedLayout` |
| 구성 | 탭(추천/재화/뽑기/아이템), 아이템 탭은 테마 필터(전체/기본/겨울/바다) 추가, 하단 "가방 열기" 버튼 |
| 인터랙션 | 탭/테마 전환, 아이템 카드 "구매"(나뭇잎 부족 시 disabled), 재화탭 구매(효과음만, 실결제는 "보호자·법적 검토 완료 후 구현" 예정), 뽑기 탭은 `GachaModal`, "가방 열기" → `/bag` |
| 상태 | ConfirmationModal(구매 확인) → ResultModal(구매 완료, 가방확장/아이템획득 분기). loading/empty/error는 별도 처리 없음(정적 mock 데이터) |
| 데이터소스 | `useCurrency`(leaves, addLeaves), `useBag`(addItem, expandBag), 정적 `mockShopItems` |
| 이동 | → `/bag` · 여기로: Ranch 사이드 HUD "상점", AppHeader 나뭇잎(+) 버튼 |

## 13. 가방 (Bag)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/bag` → `src/pages/Bag.jsx` |
| 용도 | 보유 인테리어 아이템(목장 배치용)과 대표 캐릭터(현재+지난 성체들) 목록 관리 |
| 레이아웃 | `FocusedLayout title="가방"` |
| 구성 | 카테고리 탭(인테리어/대표 캐릭터), 슬롯 그리드(보유 아이템+빈 칸) |
| 인터랙션 | 카테고리 전환, 인테리어 "목장에 배치"(→`/ranch` 편집모드 자동 진입) / "가방에 넣기"(회수), 대표 캐릭터 "선택하기" |
| 상태 | 명시적 empty/error/loading 없음(빈 칸을 항상 "빈 칸" 텍스트로 채워 표시). 튜토리얼 'bag' 단계에서 포인터 힌트 오버레이 |
| 데이터소스 | `useBag`(bagItems, bagCapacity, placeItem, retrieveItem), `useQuests`(대표캐릭터/adultHistory/profileCharacterId) |
| 이동 | → `/ranch`(배치 시 state 전달) · 여기로: Ranch 사이드 HUD "가방", Shop "가방 열기", 튜토리얼 |

## 14. AI 말벗 (AiCompanion)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/ai-companion?insectId=` → `src/pages/AiCompanion.jsx` |
| 용도 | 대표 캐릭터(알/유충/번데기/성체)와 채팅. `insectId`가 있으면 그 곤충을 학습 주제로 3인칭 설명. 음성 인식/합성 지원 |
| 레이아웃 | `FocusedLayout title="{곤충명}에 대해 알아보기"` 또는 컴패니언 이름 |
| 구성 | 단일 채팅 카드(상단 캐릭터 아바타+대화 상대명, 중앙 메시지 스크롤, 하단 자동읽기 토글+안내문구, 입력폼) |
| 인터랙션 | 텍스트 입력+전송, 음성 인식(Web Speech API), 자동 읽기 토글(TTS), 개별 답변 "🔊 답변 듣기" |
| 상태 | 로딩("~생각하고 있어…"). `/chat` 실패 시 로컬 폴백 응답(인사/위험단어차단/안전/색/서식지/먹이 키워드 매칭)으로 항상 답변 제공 — empty/error 배너 없음 |
| 데이터소스 | `/chat` POST(서버 프록시), sessionStorage(대화 임시 저장, 페이지 이탈 시 정리), `useQuests`(대표캐릭터 정체성) |
| 이동 | 별도 이동 버튼 없음(기본 헤더로만) · 여기로: FieldGuide/FriendFieldGuide의 "~에 대해 알아보기" |

## 15. 퀴즈 (Quiz)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/quiz` → `src/pages/Quiz.jsx` |
| 용도 | 등록된 도감 카드 기반 4지선다 퀴즈 3문제, 하루 1회 제한, 보상은 나뭇잎+성장포인트 |
| 레이아웃 | `FocusedLayout`("오늘의 퀴즈") |
| 구성 | 2열: 좌측(문제+선택지 4개+제출/다음), 우측(진행현황: 현재문제/정답수/연속정답) |
| 인터랙션 | 선택지 클릭(제출 전 변경 가능), "정답 제출", "다음 문제"/"결과 보기", ResultModal "보상 받기" |
| 상태 | 소진 시 ResultModal "오늘의 퀴즈를 모두 풀었어요"로 즉시 대체. 등록 카드 없음(no question) 시 안내 카드 — 사실상 empty state. 정답/오답 시각 피드백 |
| 데이터소스 | `useRegisteredPhotos`, `useCurrency`(addLeaves, addGrowthPoints), `isQuizCompletedToday`/`markQuizCompletedToday`(localStorage), 정적 `INSECT_SPECIES` |
| 이동 | → 완료 후 `/ranch`(자동 이동) · 여기로: Ranch 사이드 HUD "퀴즈"(이미 완료 시 Ranch에서 자체 모달로 막고 이동 안 시킴) |

## 16. 프로필 (Profile / ProfileEdit)

| 항목 | 내용 |
|---|---|
| 경로 / 파일 | `/profile`(보기 전용), `/profile/edit`(편집 모드) → 동일 `src/pages/Profile.jsx` |
| 용도 | 닉네임/성장 게이지, 도감·업적 달성도, 접속일수 표시. 편집 모드에서는 자기소개, 대표 배지·칭호 선택(최대 5개 장착 중 1개 대표), 시스템 설정(BGM/효과음 볼륨, 로그아웃) |
| 레이아웃 | `FocusedLayout title="프로필"|"프로필 수정" icon="🙂"`, 편집모드일 때만 탭전환 액션 표시 |
| 구성 | 좌측: 아바타+닉네임+대표캐릭터단계+성장게이지. 우측: 통계 3칸(도감/업적달성도/접속일수) → (프로필탭) 자기소개+대표배지(5칸)+보유배지그리드+대표칭호(5칸)+보유칭호그리드, 또는 (시스템탭) 볼륨 슬라이더+로그아웃. 편집모드+프로필탭일 때만 하단 sticky "저장하기" 바 |
| 인터랙션 | 탭전환, 자기소개 textarea(60자 제한, 즉시 자동저장), 배지/칭호 카드 클릭(장착→대표지정→해제 3단계 순환), "저장하기"(대표 배지/칭호만 명시적 저장 필요), 볼륨 슬라이더, "로그아웃" |
| 상태 | empty("획득한 배지가 아직 없어요" 등), "저장하지 않은 변경사항이 있어요"/"저장했어요"/"변경사항 없음" 3단계 저장 상태 표시 |
| 데이터소스 | `useQuests`, `useCurrency`, `fetchUserState`/`saveUserState`(bio, 장착·대표 배지/칭호 ID), `readMusicVolume`/`readSfxVolume`(localStorage) |
| 이동 | → 로그아웃 시 `/login` · 여기로: AppHeader 프로필 클릭(`/profile`), Ranch/AppHeader 설정 버튼(`/profile/edit`) |

---

## 부록 A. 화면별 레이아웃 · 배경 매핑

| 화면 | 레이아웃 | 배경 이미지 | 비고 |
|---|---|---|---|
| Login / Signup | AuthRouteLayout | 로그인 전용 배경 | |
| Ranch | MainLayout(헤더·내비 끔) | 목장 배경(RanchMapScene) | 자체 사이드 HUD |
| RanchHabitat | 커스텀 전체화면 | 서식지별 정적 이미지 | |
| Exploration | FocusedLayout | 있음 | |
| FieldGuide | FocusedLayout | 있음 | |
| Quests | FocusedLayout | 있음 | |
| Friends | FocusedLayout | 있음 | |
| FriendRanch | MainLayout(헤더·내비 끔) | 없음(목장 씬) | |
| FriendRanchHabitat | 커스텀 전체화면 | 서식지별 정적 이미지 | |
| FriendFieldGuide | FocusedLayout | 없음(매핑 안 됨) | |
| Shop | FocusedLayout | 있음 | |
| Bag | FocusedLayout | 있음 | |
| AiCompanion | FocusedLayout | 있음 | |
| Quiz | FocusedLayout | 있음 | |
| Profile | FocusedLayout | 없음(매핑 안 됨) | |

## 부록 B. 참고 — 코드베이스 드리프트 메모

- `BottomNav.jsx`는 `MainLayout` 전용 컴포넌트로 코드는 살아있지만, 실제 사용처(Ranch, FriendRanch)가 둘 다 `showBottomNav={false}`로 고정해둬서 **현재 빌드에서 실제로 렌더링되는 화면은 없습니다.** 화면 흐름을 다시 설계할 때 참고할 만한 지점입니다.
- `prompts/design/screens.md`(디자인 프롬프트)는 화면이 "지향해야 할" 규칙이고, 이 문서는 "실제 구현이 어떻게 되어 있는지"를 담은 문서입니다. 둘이 다르게 느껴지는 부분이 있다면 실제 구현(이 문서)이 더 최신 상태를 반영합니다.

## 부록 C. 공용 컴포넌트

- `GrowthStageModal` — App.jsx 레벨, 대표 캐릭터 성장 단계 전환 시 모든 화면 위에 뜸
- `AnnouncementBoard` — 알림(공지) 모달, Ranch/AppHeader 양쪽에서 열림
- `TutorialOverlay` — 모든 보호된 화면에서 조건부로 등장
- `CurrencyDisplay` + 나뭇잎(+) 버튼 — AppHeader, `/shop`으로 이동
