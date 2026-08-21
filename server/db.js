import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

// Supabase Session pooler를 쓴다 — 계속 떠 있는 Express 서버에 맞고, 모든 쿼리가 비동기다.
// Supabase 무료 플랜의 세션 풀러는 전체 동시 접속을 15개로 제한한다(EMAXCONNSESSION). max를
// 이 한도보다 여유 있게 낮춰서, 배포 재시작이 겹치거나(죽은 이전 프로세스의 커넥션이 아직 안
// 풀린 채로 새 프로세스가 뜨는 순간) 반영이 안 되어도 한도를 넘기지 않게 한다. 혹시 순간적으로
// 넘겨도 index.js의 process.on('unhandledRejection')와 pool.on('error') 덕분에 그 요청만
// 실패하고 서버 전체가 죽지는 않는다.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 })

// pg.Pool은 유휴 커넥션이 네트워크 문제로 끊기면 'error' 이벤트를 낸다. 리스너가 없으면
// Node가 이걸 uncaught exception으로 취급해서 서버 프로세스 전체가 죽는다 — 일시적인
// 네트워크 끊김 한 번에 로그인/친구요청 등 전부 응답 불가 상태가 됐던 원인.
pool.on('error', (err) => {
  console.error('[db] idle client error (server가 계속 떠 있도록 무시함):', err.message)
})

// "Little Biologist ERD (재설계)"를 실제 DB에 적용한 스키마. user_state 하나에 계정 진행도를
// 전부 JSON으로 몰아넣던 예전 방식을 버리고, 실제 쓰이는 개념(도감 등록/미션/친구 등) 단위로
// 정규화했다. 딱 하나 예외: bagItems/placements는 여전히 user_state에 남겨둔다 — Shop.jsx가
// 애초에 서버가 아니라 정적 mockData를 직접 쓰고 있어 상점 카탈로그 테이블을 지금 연결해도
// 아무도 안 읽고, 배치(placements)는 클라이언트가 서버 응답을 기다리지 않고 즉석에서 id를
//만들어 바로 쓰는 방식이라 서버가 id를 발급하는 정규화 테이블과 안 맞는다(scripts/seed-supabase.js
// 주석 참고). shop_item/bag_item/ranch_placement/gacha_pull/purchase_history는 나중에
// Shop.jsx를 실제 서버 연동으로 바꿀 때를 위한 뼈대로만 만들어두고, 이번엔 시딩도 배선도 안 한다.
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id                BIGSERIAL PRIMARY KEY,
      uid               VARCHAR(20) NOT NULL UNIQUE,
      username          VARCHAR(50) NOT NULL UNIQUE,
      password_hash     VARCHAR(255) NOT NULL,
      nickname          VARCHAR(50) NOT NULL,
      bio               VARCHAR(60),
      leaves            INTEGER NOT NULL DEFAULT 0,
      growth_points     INTEGER NOT NULL DEFAULT 0,
      bag_capacity      INTEGER NOT NULL DEFAULT 30,
      total_login_days  INTEGER NOT NULL DEFAULT 1,
      last_login_date   VARCHAR(10),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS habitat (
      id           BIGSERIAL PRIMARY KEY,
      code         VARCHAR(30) NOT NULL UNIQUE,
      name         VARCHAR(50) NOT NULL,
      description  VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS species (
      id               BIGINT PRIMARY KEY,
      habitat_id       BIGINT NOT NULL REFERENCES habitat(id),
      name             VARCHAR(100) NOT NULL,
      scientific_name  VARCHAR(150),
      feature          TEXT,
      image_url        VARCHAR(255) NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_species_habitat ON species(habitat_id);

    -- species_id: 성체가 됐을 때 고정되는 실제 도감 종 id(문자열로 저장). larva_category:
    -- 유충 단계에서 어떤 유충 원화(public/representative-character/larva/*.png, 17종류)를
    -- 쓸지 — 성체가 될 때 이 값에 맞는 도감 종 중 하나가 species_id로 뽑혀 고정된다.
    CREATE TABLE IF NOT EXISTS representative_character (
      id             BIGSERIAL PRIMARY KEY,
      user_id        BIGINT NOT NULL UNIQUE REFERENCES users(id),
      species_index  INTEGER NOT NULL,
      stage          VARCHAR(20) NOT NULL DEFAULT 'egg',
      larva_category VARCHAR(30),
      species_id     TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE representative_character ADD COLUMN IF NOT EXISTS larva_category VARCHAR(30);
    ALTER TABLE representative_character ADD COLUMN IF NOT EXISTS species_id TEXT;

    CREATE TABLE IF NOT EXISTS user_habitat_layout (
      user_id     BIGINT NOT NULL REFERENCES users(id),
      habitat_id  BIGINT NOT NULL REFERENCES habitat(id),
      pos_x       REAL NOT NULL,
      pos_y       REAL NOT NULL,
      scale       REAL NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, habitat_id)
    );

    -- 금(사진)/은(그림)/동(랜덤곤충) 등급은 photo_url/sketch_url/bronze_unlocked 존재 여부로 판단한다.
    CREATE TABLE IF NOT EXISTS user_species_record (
      user_id               BIGINT NOT NULL REFERENCES users(id),
      species_id            BIGINT NOT NULL REFERENCES species(id),
      bronze_unlocked       BOOLEAN NOT NULL DEFAULT false,
      photo_url             TEXT,
      sketch_url            TEXT,
      first_registered_at   VARCHAR(10) NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
      PRIMARY KEY (user_id, species_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_species_record_user ON user_species_record(user_id);

    -- daily/weekly/achievement/title/event 공용 미션 마스터(고정 시드 데이터, scripts/seed-supabase.js).
    -- code는 dailyMissions.js 등 프론트 데이터 파일의 문자열 id를 그대로 담는다 — 앱 전체가
    -- 미션을 이 문자열로만 참조하기 때문에 숫자 PK만으로는 클라이언트 요청을 못 알아본다.
    CREATE TABLE IF NOT EXISTS mission_definition (
      id                 BIGSERIAL PRIMARY KEY,
      code               VARCHAR(40) NOT NULL UNIQUE,
      type               VARCHAR(20) NOT NULL CHECK (type IN ('daily', 'weekly', 'achievement', 'title', 'event')),
      title              VARCHAR(100) NOT NULL,
      description        VARCHAR(255) NOT NULL,
      event_key          VARCHAR(50),
      goal               INTEGER NOT NULL,
      reward_leaf        INTEGER NOT NULL DEFAULT 0,
      badge_name         VARCHAR(100),
      title_text         VARCHAR(50),
      permanent          BOOLEAN NOT NULL DEFAULT false,
      distinct_tracking  BOOLEAN NOT NULL DEFAULT false
    );

    CREATE INDEX IF NOT EXISTS idx_mission_definition_type ON mission_definition(type);

    -- 업적/칭호 중 계정마다 무작위 12개를 골라 고정해두는 표(daily/weekly는 후보가 적어서
    -- 매번 새로 뽑고 이 표를 쓰지 않는다).
    CREATE TABLE IF NOT EXISTS user_mission_pool (
      user_id                BIGINT NOT NULL REFERENCES users(id),
      mission_definition_id  BIGINT NOT NULL REFERENCES mission_definition(id),
      PRIMARY KEY (user_id, mission_definition_id)
    );

    -- period_key: 일일=날짜('2026-08-06'), 주간=주차 시작일, 업적/칭호=''(계정당 한 번만 진행).
    CREATE TABLE IF NOT EXISTS user_mission_progress (
      user_id                BIGINT NOT NULL REFERENCES users(id),
      mission_definition_id  BIGINT NOT NULL REFERENCES mission_definition(id),
      period_key             VARCHAR(20) NOT NULL DEFAULT '',
      progress               INTEGER NOT NULL DEFAULT 0,
      total                  INTEGER NOT NULL DEFAULT 0,
      done                   BOOLEAN NOT NULL DEFAULT false,
      claimed                BOOLEAN NOT NULL DEFAULT false,
      claimed_at             TIMESTAMPTZ,
      is_equipped            BOOLEAN NOT NULL DEFAULT false,
      equip_order            SMALLINT,
      seen_ids               INTEGER[],
      PRIMARY KEY (user_id, mission_definition_id, period_key)
    );

    CREATE INDEX IF NOT EXISTS idx_user_mission_progress_user ON user_mission_progress(user_id);

    -- achievementProgress의 정수 카운터 7개(explorations, friendVisits 등). 배열형 카운터
    -- (드로잉/사진/등록종/올랭크종)는 user_species_record에서 그때그때 계산하므로 여기 없다.
    CREATE TABLE IF NOT EXISTS user_progress_counter (
      user_id      BIGINT NOT NULL REFERENCES users(id),
      counter_key  VARCHAR(30) NOT NULL,
      value        INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, counter_key)
    );

    CREATE TABLE IF NOT EXISTS friend_request (
      id            BIGSERIAL PRIMARY KEY,
      requester_id  BIGINT NOT NULL REFERENCES users(id),
      target_id     BIGINT NOT NULL REFERENCES users(id),
      status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (requester_id, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_friend_request_target ON friend_request(target_id, status);

    CREATE TABLE IF NOT EXISTS friendship (
      user_id     BIGINT NOT NULL REFERENCES users(id),
      friend_id   BIGINT NOT NULL REFERENCES users(id),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS guestbook (
      id              BIGSERIAL PRIMARY KEY,
      ranch_owner_id  BIGINT NOT NULL REFERENCES users(id),
      visitor_id      BIGINT NOT NULL REFERENCES users(id),
      message         TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_guestbook_owner ON guestbook(ranch_owner_id);

    -- bagItems/placements 전용으로 범위를 좁힌 예전 방식의 잔존 key-value 저장소 (위 주석 참고).
    CREATE TABLE IF NOT EXISTS user_state (
      user_id     BIGINT NOT NULL REFERENCES users(id),
      key         TEXT NOT NULL,
      value       TEXT NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, key)
    );

    -- 아래 5개는 Shop.jsx가 실제로 서버와 통신하게 될 다음 단계를 위한 뼈대 — 지금은 시딩도
    -- 배선도 하지 않는다.
    CREATE TABLE IF NOT EXISTS shop_item (
      id           BIGSERIAL PRIMARY KEY,
      category     VARCHAR(20) NOT NULL CHECK (category IN ('recommend', 'interior')),
      theme        VARCHAR(20) CHECK (theme IN ('basic', 'winter', 'sea')),
      name         VARCHAR(100) NOT NULL,
      description  VARCHAR(255),
      price_leaf   INTEGER NOT NULL,
      image_url    VARCHAR(255) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bag_item (
      user_id       BIGINT NOT NULL REFERENCES users(id),
      shop_item_id  BIGINT NOT NULL REFERENCES shop_item(id),
      quantity      INTEGER NOT NULL DEFAULT 1,
      placed_count  INTEGER NOT NULL DEFAULT 0,
      acquired_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, shop_item_id)
    );

    CREATE TABLE IF NOT EXISTS ranch_placement (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL REFERENCES users(id),
      shop_item_id  BIGINT NOT NULL REFERENCES shop_item(id),
      pos_x         REAL NOT NULL,
      pos_y         REAL NOT NULL,
      scale         REAL NOT NULL DEFAULT 1,
      placed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gacha_pull (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL REFERENCES users(id),
      shop_item_id  BIGINT NOT NULL REFERENCES shop_item(id),
      pulled_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS purchase_history (
      id            BIGSERIAL PRIMARY KEY,
      user_id       BIGINT NOT NULL REFERENCES users(id),
      shop_item_id  BIGINT NOT NULL REFERENCES shop_item(id),
      price_leaf    INTEGER NOT NULL,
      purchased_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `)
}

// index.js가 라우트를 등록하기 전에(또는 첫 요청 전에) 스키마 준비가 끝나길 기다릴 수 있도록
// 프라미스 자체를 내보낸다.
export const dbReady = initSchema()

// uid는 계정당 최초 1회만 발급되고 이후 고정된다 (친구 추가용 공개 식별자).
export function generateUid() {
  return crypto.randomBytes(4).toString('hex')
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':')
  const candidate = crypto.scryptSync(password, salt, 64)
  const storedBuf = Buffer.from(hash, 'hex')
  if (candidate.length !== storedBuf.length) return false
  return crypto.timingSafeEqual(candidate, storedBuf)
}
