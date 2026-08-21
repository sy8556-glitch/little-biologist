# 리틀 바이올로지스트 — 기능별 구현 문서 (프론트엔드 / 백엔드)

> 이 문서는 **기능이 실제로 어떻게 구현되어 있는지**를 프론트엔드/백엔드로 나누어 정리한 참고 문서입니다.
> 화면 단위 흐름(라우트/레이아웃/상태)은 [`ui-screen-design.md`](./ui-screen-design.md)를 참고하세요. 이 문서는 그 화면들을 "무엇이 실제로 움직이게 하는지" 관점에서 다룹니다.

## 0. 전체 아키텍처

```
[브라우저 (React/Vite, 5173)]
        │  fetch(VITE_API_BASE_URL 또는 상대경로 /api, /chat)
        ▼
[Express 프록시 서버 (server/index.js, 5174)]
        │
        ├─ Supabase(Postgres) ── server/db.js (계정/미션/친구/도감등록 등 정규화 테이블)
        ├─ iNaturalist Computer Vision API ── 사진 곤충 분류
        ├─ CLIP(Transformers.js, 로컬 추론) ── 그림 곤충 분류 (server/clipPredictor.js)
        └─ OpenAI API ── AI 말벗 챗봇(/chat)
```

- **프론트엔드**: React 18 + Vite + React Router + Tailwind. 상태 관리는 Redux 같은 전역 스토어 없이 **React Context 5개**로 구성(`src/context/*`).
- **백엔드**: `server/index.js` 단일 Express 서버 하나가 REST API + 정적 프록시 역할을 모두 담당(별도 마이크로서비스 없음).
- **DB**: Supabase(Postgres). `npm run dev`가 vite와 서버를 `concurrently`로 동시 실행.
- 자세한 실행/환경변수는 [`SETUP.md`](../SETUP.md) 참고.

---

## 1. 폴더 구조

```
src/
  App.jsx                라우트 정의 + Provider 계층 + 전역 오버레이 마운트
  main.jsx               React 엔트리
  router/
    AuthContext.jsx       로그인 상태(sessionStorage 기반) 전역 컨텍스트
    ProtectedRoute.jsx    비로그인 시 /login으로 리다이렉트
  context/                전역 상태 5종 (아래 §2 참고)
    CurrencyContext.jsx    나뭇잎(재화) + 대표 캐릭터 성장 포인트
    QuestsContext.jsx      일일/주간/업적/칭호 미션 + 대표 캐릭터 정체성
    BagContext.jsx         가방(인테리어 아이템) + 목장 배치
    RegisteredPhotosContext.jsx  도감 등록 현황(금/은/동 등급)
    TutorialContext.jsx    온보딩 튜토리얼 단계
  api/                    백엔드 호출 클라이언트 (fetch 래퍼)
    apiBase.js             API base URL 조립(VITE_API_BASE_URL)
    userState.js           범용 키-값 상태 저장(/api/state/:uid) 클라이언트
    inaturalist.js         iNaturalist 관찰기록 → 동네 지도 마커 변환
    googleMaps.js          Google Maps JS SDK 동적 로더
    weather.js              Open-Meteo 날씨 코드 → 아이콘/이펙트 매핑
  data/                   정적 데이터(마스터 데이터), 서버 DB와 무관하게 번들에 포함
    insectSpecies.js        곤충 80종 + 서식지 5개 정의 (분류 마스터 데이터)
    dailyMissions.js / weeklyMissions.js / achievementMissions.js / titles.js
    representativeCharacter.js  대표 캐릭터(알→유충→번데기→성체) 규칙
    featureBackgrounds.js   화면별 배경 이미지 매핑
    foodPyramid.js, mapSpecies.js, inaturalistTaxa.js, insectDrawingGuides.js, insectSummaries.js, mockData.js
  pages/                  라우트 1:1 대응 화면 컴포넌트 (auth/ 하위는 로그인·가입)
  components/
    common/                 여러 화면에서 재사용하는 공통 컴포넌트(레이아웃/헤더/모달/사운드 컨트롤러 등)
    features/                단일 기능 전용 컴포넌트(가챠 모달, 존 배너)
  utils/                  사운드 재생, 미션 이벤트 디스패치, 퀴즈 1일 1회 제한 등 순수 로직

server/
  index.js                Express 앱: 전체 REST API 라우트 (§3 표 참고)
  db.js                   Postgres 스키마 정의(initSchema) + 비밀번호 해시/uid 발급
  clipPredictor.js        CLIP 모델 로드 + 그림→후보종 임베딩 유사도 계산
  dump-db.js              DB 내용을 파일로 덤프하는 운영 스크립트

public/
  insects/                곤충 도감 이미지 80종
  ranch/                  목장 배경 + 서식지 오브젝트 이미지
```

---

## 2. 프론트엔드 전역 상태 (Context 5종)

App.jsx의 Provider 순서: `AuthProvider → CurrencyProvider → QuestsProvider → BagProvider → RegisteredPhotosProvider → TutorialProvider`

| Context | 담당 상태 | 서버 동기화 |
|---|---|---|
| `AuthContext`(router/) | 로그인 사용자(uid/닉네임 등), `isAuthenticated` | sessionStorage에만 저장(새로고침 유지, 탭 닫으면 소멸) |
| `CurrencyContext` | 나뭇잎(leaves), 대표 캐릭터 성장 포인트/게이지 | `fetchUserState`/`saveUserState`로 `leaves`, `growthPoints` 키 저장 |
| `QuestsContext` | 일일/주간/업적/칭호 미션 진행도, 대표 캐릭터(알~성체) 정체성, 장착 배지/칭호 | 미션 진행도는 `user_mission_progress` 테이블(정규화), 대표 캐릭터는 `representative_character` 테이블 |
| `BagContext` | 보유 인테리어 아이템, 가방 용량(bagCapacity), 목장 배치 좌표 | `user_state` 테이블의 `bagItems`/`placements` 키 (정규화 안 된 잔존 key-value, §4 참고) |
| `RegisteredPhotosContext` | 도감 등록 종 목록, 금(사진)/은(그림)/동(랜덤) 등급 | `user_species_record` 테이블 |
| `TutorialContext` | 온보딩 튜토리얼 현재 단계, 완료 여부 | localStorage |

컴포넌트 간 직접 결합을 피하기 위해 미션 갱신은 `reportMissionEvent()`(`src/utils/missionEvents.js`)로 `CustomEvent`를 `window`에 dispatch하고, `QuestsContext`가 이를 구독해서 진행도를 올리는 **이벤트 기반 느슨한 결합** 방식을 씁니다. (예: 탐험에서 곤충 등록 → `missionEvents` 이벤트 → 미션 진행도 자동 반영)

---

## 3. 백엔드 API 전체 목록 (`server/index.js`)

| 메서드 | 경로 | 기능 | 비고 |
|---|---|---|---|
| POST | `/api/signup` | 회원가입 | uid 자동 발급, 비밀번호는 scrypt 해시 |
| POST | `/api/login` | 로그인 | 아이디/비밀번호 검증 |
| GET | `/api/state/:uid` | 범용 사용자 상태 조회 | `user_state` 테이블 (§4) |
| PUT | `/api/state/:uid/:key` | 범용 사용자 상태 저장 | 위와 동일 |
| POST | `/api/classify-insect` | 사진 → 곤충 종 분류 | 업로드 이미지를 iNaturalist Computer Vision API로 프록시 |
| POST | `/api/predict-drawing` | 그림 → 곤충 종 분류 | 서버 내 CLIP 모델로 로컬 추론(외부 API 미사용) |
| POST | `/chat` | AI 말벗 챗봇 대화 | OpenAI API 프록시, 실패 시 프론트에서 로컬 폴백 |
| GET | `/api/users/:uid` | uid로 사용자 검색 | 친구 추가용 |
| GET/POST | `/api/friends`, `/api/friends/requests` | 친구 목록/요청 조회·발송 | |
| POST | `/api/friends/requests/:id/accept`\|`/reject` | 친구 요청 수락/거절 | |
| GET/POST | `/api/guestbook/:ownerUid` | 방명록 조회/작성 | |
| GET | `/api/ranch/:uid` | 친구 목장 배치 조회(읽기 전용) | |
| GET | `/api/field-guide/:uid` | 친구 도감 조회(읽기 전용) | |

핵심 설계 포인트:
- **iNaturalist JWT / OpenAI API 키를 프론트에 노출하지 않기 위해** 사진 분류·챗봇은 반드시 이 서버를 거칩니다(§클라이언트가 외부 API를 직접 호출하지 않음).
- **그림 분류는 외부 API가 아니라 서버 프로세스 내 CLIP 모델**(`@huggingface/transformers`, ONNX 변환된 `clip-vit-base-patch32`)을 서버 시작 시 1회 로드해 캐싱, 이후 요청마다 재사용합니다.
- `pool.on('error')`, `process.on('unhandledRejection')`으로 DB 커넥션 순간 오류나 처리 안 된 예외가 **서버 전체 다운으로 번지지 않도록** 방어 처리되어 있습니다(Render 재배포 시 재시작 루프 방지).

---

## 4. 데이터 저장 방식 — 정규화 테이블 vs 잔존 key-value

`server/db.js`는 원래 `user_state` 테이블 하나에 계정 진행도를 전부 JSON으로 몰아넣던 방식에서, 실제로 쓰이는 개념 단위(도감 등록/미션/친구 등)로 **정규화된 테이블**로 재설계되었습니다.

**정규화된 전용 테이블**
- `users`, `habitat`, `species` — 계정/서식지/종 마스터
- `representative_character` — 대표 캐릭터(알/유충/번데기/성체) 상태
- `user_habitat_layout` — 목장 내 서식지 대객체 위치
- `user_species_record` — 도감 등록(금/은/동 등급)
- `mission_definition`, `user_mission_pool`, `user_mission_progress` — 미션/업적/칭호
- `user_progress_counter` — 업적 카운터(탐험 횟수, 친구 방문 등)
- `friend_request`, `friendship`, `guestbook` — 친구/방명록

**여전히 `user_state`(key-value) 테이블에 남아있는 것**
- `bagItems`(가방 아이템), `placements`(목장 인테리어 배치), `leaves`, `growthPoints` 등

이렇게 나뉜 이유: `Shop.jsx`가 아직 서버가 아니라 정적 `mockData.js`를 직접 쓰고 있어 상점 카탈로그 테이블(`shop_item`)을 연결해도 아무도 읽지 않고, 배치(placements)는 클라이언트가 서버 응답을 기다리지 않고 즉석에서 id를 만들어 바로 쓰는 방식이라 서버가 id를 발급하는 정규화 테이블과 맞지 않기 때문입니다. `shop_item`/`bag_item`/`ranch_placement`/`gacha_pull`/`purchase_history` 테이블은 나중에 상점을 실제 서버 연동으로 바꿀 때를 위한 뼈대만 만들어두고, 현재는 시딩·배선 모두 하지 않은 상태입니다.

**주의**: 새로운 사용자 필드를 추가할 때 `saveUserState`를 호출하는 것만으로는 저장되지 않습니다 — `server/index.js`의 `/api/state/:uid/:key` 라우트가 허용하는 키인지 확인해야 하며, 정규화 테이블 대상 데이터라면 해당 테이블/라우트를 따로 만들어야 합니다.

---

## 5. 기능별 구현 상세

### 5.1 인증 (로그인/회원가입)
- **프론트**: `pages/auth/Login.jsx`, `Signup.jsx` + 폼(`LoginForm.jsx`, `SignupForm.jsx`). 성공 시 `AuthContext.login(user)`로 sessionStorage에 저장 후 `/ranch` 이동. 회원가입 성공 시 `state:{firstLogin:true}`를 전달해 알 획득 연출+튜토리얼을 트리거.
- **백엔드**: `/api/signup`(uid 발급, `hashPassword`로 scrypt 해시 저장), `/api/login`(`verifyPassword`로 timing-safe 비교).
- 세션은 토큰 없이 sessionStorage 기반 — 탭을 닫으면 로그아웃됩니다(보호 라우트는 `ProtectedRoute.jsx`가 처리).

### 5.2 목장 & 서식지 (대객체)
- **프론트**: `pages/Ranch.jsx`가 허브. `RanchCamera`(팬/줌) 안에 `RanchMapScene`(서식지 대객체 렌더 + 날씨 반영), `PlacedItemsLayer`(배치 인테리어), `RandomInsectEffect`, `EggFirstRevealEffect`가 레이어드. 서식지별 상세는 `pages/RanchHabitat.jsx`(완전 커스텀 전체화면). 대객체 위치/크기는 편집 모드에서 드래그·슬라이더로 조정.
- **백엔드**: 대객체(서식지) 위치는 `user_habitat_layout` 테이블(`pos_x`/`pos_y`/`scale`), 목장 화면 진입 시 `fetchUserState`로 불러오고 드래그 종료 시 `saveUserState`로 저장. 서식지 안 곤충 위치(`RanchHabitat.jsx`)는 서버가 아니라 **localStorage**에만 저장.
- 친구 목장 읽기 전용 버전은 `FriendRanch.jsx`/`FriendRanchHabitat.jsx`가 `/api/ranch/:uid`로 조회.

### 5.3 탐험 — AI 곤충 인식 (사진/그림)
- **프론트**: `pages/Exploration.jsx`. 상태 머신(`idle → photoUpload/drawingChoice → ... → loading → candidates → success/lowConfidence`)으로 흐름 제어. 그림은 `DrawingCanvas.jsx`로 캔버스에 직접 그리거나 파일 업로드.
- **백엔드**:
  - 사진: `/api/classify-insect` → iNaturalist Computer Vision API에 업로드 이미지 전달 → 응답을 80종 마스터 데이터(`insectSpecies.js`)와 학명(`sciMatches`) 매칭 → 상위 3개 후보 반환.
  - 그림: `/api/predict-drawing` → 먼저 `analyzeDrawingBuffer`(sharp)로 빈 캔버스(잉크 픽셀 10개 미만) 여부 검사 → CLIP 모델(`clipPredictor.js`)로 그림 임베딩과 80종 텍스트/기준 임베딩의 코사인 유사도 계산 → 후보 반환. 사용자가 입력한 한글 특징 설명은 `getDescriptionBoost()`로 후보 순위에 소폭(최대 20점) 가점만 부여(이미지 인식 결과를 텍스트만으로 뒤집지는 않음).
- 등록 성공 시 `RegisteredPhotosContext`에 반영 → `user_species_record`에 저장(사진=금, 그림=은 등급).

### 5.4 도감 (FieldGuide)
- **프론트**: `pages/FieldGuide.jsx`. 정적 `INSECT_SPECIES`(80종) + `RegisteredPhotosContext`(등록 현황)를 합쳐 렌더. 등급(금/사진, 은/그림, 동/랜덤곤충)에 따라 다른 이미지 표시, 미등록 종은 잠금 아이콘. 먹이사슬 피라미드(`FoodPyramid.jsx`)는 별도 모달.
- **백엔드**: 별도 조회 API 없음 — 등록 현황은 로그인 시 `RegisteredPhotosContext`가 서버(`user_species_record`)에서 통째로 읽어와 프론트에서 필터링. 친구 도감은 `/api/field-guide/:uid`(읽기 전용).

### 5.5 미션 (일일/주간/업적/칭호)
- **프론트**: `pages/Quests.jsx` + `QuestsContext`. 정적 데이터(`dailyMissions.js`/`weeklyMissions.js`/`achievementMissions.js`/`titles.js`)가 미션 정의(제목/목표/보상)를 담고, `QuestsContext`가 진행도를 관리. 다른 기능(탐험 등록, 친구 방문 등)에서 `reportMissionEvent()`로 이벤트를 쏘면 `QuestsContext`가 구독해 진행도 자동 갱신.
- **백엔드**: `mission_definition`(마스터, `scripts/seed-supabase.js`로 시딩) + `user_mission_pool`(계정별 무작위 배정 — 업적/칭호는 전체 목록을 다 보여주도록 현재 `RANDOM_ACHIEVEMENT_COUNT = 전체 개수`) + `user_mission_progress`(진행도/완료/수령 여부). 일일은 날짜, 주간은 주차 시작일을 `period_key`로 구분해 자동 리셋.
- 보상 수령 시 나뭇잎/성장포인트는 `CurrencyContext`, 칭호/배지는 `QuestsContext`가 반영.

### 5.6 친구 & 방명록
- **프론트**: `pages/Friends.jsx`(검색/요청/목록), `pages/FriendRanch.jsx`/`FriendRanchHabitat.jsx`/`FriendFieldGuide.jsx`(읽기 전용 방문).
- **백엔드**: `friend_request`(pending/accepted/rejected 상태), `friendship`(양방향 관계), `guestbook`(방문 기록 메시지). uid 검색은 `/api/users/:uid`.

### 5.7 상점 & 가방
- **프론트**: `pages/Shop.jsx`(탭: 추천/재화/뽑기/아이템, `GachaModal.jsx`), `pages/Bag.jsx`(보유 아이템 → 목장 배치). 상점 카탈로그는 **정적 `mockData.js`** — 서버 연동 안 됨.
- **백엔드**: 가방 아이템/배치만 `user_state`의 `bagItems`/`placements` 키로 저장(§4). 가방 용량 확장권 구매 시 `bagCapacity`도 같은 방식으로 저장. 실제 결제(캐시 충전)는 미구현(효과음만 재생).

### 5.8 AI 말벗 챗봇
- **프론트**: `pages/AiCompanion.jsx`. 도감의 "~에 대해 알아보기"에서 `insectId` 쿼리로 진입하면 그 곤충을 주제로 3인칭 설명. Web Speech API로 음성 인식/TTS 지원. 대화는 sessionStorage에 임시 저장(페이지 이탈 시 삭제, 서버 영속화 없음).
- **백엔드**: `/chat` → OpenAI API(`OPENAI_MODEL`, 기본 `gpt-4o-mini`) 프록시. 실패 시 프론트에서 키워드 매칭 기반 로컬 폴백 응답(인사/위험단어차단/색/서식지/먹이 등)으로 항상 답변 제공 — 에러 배너 없이 대화가 끊기지 않도록 설계.

### 5.9 퀴즈
- **프론트**: `pages/Quiz.jsx`. `RegisteredPhotosContext`에서 등록된 종만 문제로 출제(4지선다 3문제). 하루 1회 제한은 `quizAvailability.js`(localStorage 기반 `isQuizCompletedToday`/`markQuizCompletedToday`)로 프론트에서만 판단 — 서버 검증 없음.
- **백엔드**: 별도 API 없음. 보상(나뭇잎/성장포인트)은 `CurrencyContext`가 로컬에서 적용 후 `user_state`에 저장.

### 5.10 프로필 / 배지·칭호 / 대표 캐릭터
- **프론트**: `pages/Profile.jsx`(보기/편집 겸용, URL로 모드 구분). 배지/칭호는 최대 5개 장착 중 1개를 대표로 지정하는 3단계 순환(미장착→장착→대표). 대표 캐릭터(알→유충→번데기→성체) 규칙은 `data/representativeCharacter.js`.
- **백엔드**: 대표 캐릭터는 `representative_character` 테이블(`stage`, `larva_category`, 성체 확정 시 `species_id` 고정). 자기소개/장착 배지·칭호 ID는 `user_state`에 저장. 성체가 될 때 `larva_category`에 맞는 도감 종 중 하나가 무작위로 `species_id`로 뽑혀 고정됩니다(`createRepresentativeCharacter`).

### 5.11 알림/공지, 날씨, 사운드, 튜토리얼 (공통 인프라)
- **알림/공지**: `AnnouncementBoard.jsx`(공용 컴포넌트) — 정적 공지 내용을 모달로 표시, `AppHeader`와 Ranch 양쪽에서 열림. 서버 연동 없음.
- **날씨**: `api/weather.js`가 Open-Meteo API를 직접 호출(자체 백엔드 프록시 없음), `weatherCode`를 맑음/흐림/비/눈/안개/뇌우 이펙트로 매핑해 목장 배경 연출에 반영. `Geolocation` API로 위치 획득.
- **동네 지도**: `api/googleMaps.js`(Google Maps JS SDK 동적 로드) + `api/inaturalist.js`(iNaturalist 공개 관찰기록 API를 프론트에서 직접 호출해 지도 마커로 변환 — 이 호출은 인증 토큰이 필요 없어 서버 프록시를 거치지 않음).
- **사운드**: `utils/sound.js`/`sfx.js` + `BackgroundMusicController.jsx`/`ButtonSoundController.jsx`/`SoundAssetPreloader.jsx`(공용 컴포넌트, App.jsx 레벨에 상시 마운트). 볼륨 설정은 localStorage.
- **튜토리얼**: `TutorialContext` + `TutorialOverlay`(공용 컴포넌트). 신규 가입(`firstLogin`) 또는 재시작 버튼으로 진입, 단계는 localStorage로 관리.

---

## 6. 요약 — "이 기능은 서버에 저장되나?"

| 기능 | 저장 위치 |
|---|---|
| 로그인/계정 | Postgres (`users`) |
| 도감 등록(금/은/동) | Postgres (`user_species_record`) |
| 미션/업적/칭호 진행도 | Postgres (`user_mission_progress`) |
| 대표 캐릭터 성장 단계 | Postgres (`representative_character`) |
| 서식지(대객체) 위치 | Postgres (`user_habitat_layout`) |
| 친구/방명록 | Postgres (`friend_request`, `friendship`, `guestbook`) |
| 나뭇잎/성장포인트, 가방 아이템, 인테리어 배치, 가방 용량, 자기소개, 장착 배지·칭호 | Postgres (`user_state`, key-value) |
| 서식지 내부 곤충 위치 | 브라우저 localStorage (서버 미저장) |
| 퀴즈 1일 1회 제한 | 브라우저 localStorage (서버 검증 없음) |
| 튜토리얼 진행 단계, 사운드 볼륨 | 브라우저 localStorage |
| 상점 카탈로그 | 정적 코드(`mockData.js`) — 서버·DB 미연동 |
| AI 챗봇 대화 내역 | sessionStorage(임시), 서버 영속화 없음 |
