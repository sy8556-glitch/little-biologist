// public/ 안의 정적 이미지들을 실제 렌더 크기에 맞게 리사이즈 + 재압축한다.
// 파일 경로/확장자는 그대로 유지한 채(같은 경로에 덮어쓰기) 픽셀 수만 줄이므로 소스 코드의
// 이미지 참조는 하나도 고칠 필요가 없다. 원본은 git에 커밋돼 있어 문제가 생기면
// `git checkout -- public/<폴더>`로 즉시 되돌릴 수 있다.
//
// IMAGE/ 폴더(프로젝트 루트, 399MB)는 대부분 디자인 원본/참고 자료이고 실제 앱에서 쓰이는 건
// RanchHabitat.jsx/FriendRanchHabitat.jsx가 import하는 서식지 배경 6장과 RanchMapScene.jsx가
// new URL(...)로 참조하는 날씨 구름 4장, 총 10개뿐이다(빌드 결과 dist/assets에서 확인). 폴더
// 전체를 건드리지 않고 이 10개 파일만 같은 방식으로 처리한다.
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const PUBLIC_DIR = path.resolve(import.meta.dirname, '..', 'public')
const IMAGE_DIR = path.resolve(import.meta.dirname, '..', 'IMAGE')

const EXTRA_FILES = [
  { rel: 'forest.png', maxDim: null },
  { rel: 'pond.png', maxDim: null },
  { rel: 'soil.png', maxDim: null },
  { rel: 'street.png', maxDim: null },
  { rel: 'field_flower.png', maxDim: null },
  { rel: 'field_tree.png', maxDim: null },
  { rel: '날씨 반영/구름 많음1.png', maxDim: 700 },
  { rel: '날씨 반영/구름 많음2.png', maxDim: 700 },
  { rel: '날씨 반영/구름 많음3.png', maxDim: 700 },
  { rel: '날씨 반영/구름 많음4.png', maxDim: 700 },
]

// 폴더별 목표 "긴 변" 길이(px). 실제 화면 렌더 크기의 2~2.5배로 잡아 레티나 디스플레이까지 커버.
// null이면 리사이즈 없이 재압축만 한다(이미 풀블리드로 적정 해상도인 배경류).
const RESIZE_RULES = [
  { test: (rel) => rel.startsWith('ui/food-pyramid/'), maxDim: 1400 },
  { test: (rel) => rel.startsWith('ui/leaf.png'), skip: true }, // 이미 128px, 처리 불필요
  { test: (rel) => rel.startsWith('ui/'), maxDim: 200 },
  { test: (rel) => rel.startsWith('interior/'), maxDim: 240 },
  { test: (rel) => rel.startsWith('badges/'), maxDim: 160 },
  { test: (rel) => rel.startsWith('currency/'), maxDim: 600 },
  { test: (rel) => rel.startsWith('representative-character/'), maxDim: 480 },
  { test: (rel) => rel.startsWith('feature-backgrounds/'), maxDim: null },
  { test: (rel) => rel.startsWith('gacha/'), maxDim: null },
  { test: (rel) => rel.startsWith('effects/'), maxDim: null },
  { test: (rel) => rel.startsWith('images/'), maxDim: null },
]

// 절대 건드리지 않는 폴더 — 곤충 원본 사진은 목장/피라미드에 계속 쓰이는 고정 원본이라 제외.
const EXCLUDE_PREFIXES = ['insects-original/']

const MIN_SIZE_BYTES = 200 * 1024 // 이미 충분히 작은 파일은 건드릴 필요 없음

function findRule(relPath) {
  const normalized = relPath.split(path.sep).join('/')
  return RESIZE_RULES.find((rule) => rule.test(normalized))
}

async function collectPngFiles(dir, baseDir = dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectPngFiles(fullPath, baseDir)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      files.push(path.relative(baseDir, fullPath))
    }
  }
  return files
}

async function optimizeFile(relPath) {
  const normalized = relPath.split(path.sep).join('/')
  if (EXCLUDE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return { relPath, skipped: 'excluded' }

  const rule = findRule(normalized)
  if (!rule || rule.skip) return { relPath, skipped: 'no-rule' }

  const fullPath = path.join(PUBLIC_DIR, relPath)
  const before = (await stat(fullPath)).size
  if (before < MIN_SIZE_BYTES) return { relPath, skipped: 'already-small', before }

  let pipeline = sharp(fullPath)
  if (rule.maxDim) {
    pipeline = pipeline.resize({ width: rule.maxDim, height: rule.maxDim, fit: 'inside', withoutEnlargement: true })
  }
  const buffer = await pipeline.png({ quality: 80, compressionLevel: 9 }).toBuffer()
  await sharp(buffer).toFile(fullPath)
  const after = (await stat(fullPath)).size

  return { relPath, before, after }
}

async function optimizeExtraFile(baseDir, rel, maxDim) {
  const fullPath = path.join(baseDir, rel)
  const before = (await stat(fullPath)).size
  if (before < MIN_SIZE_BYTES) return { relPath: rel, skipped: 'already-small', before }

  let pipeline = sharp(fullPath)
  if (maxDim) {
    pipeline = pipeline.resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
  }
  const buffer = await pipeline.png({ quality: 80, compressionLevel: 9 }).toBuffer()
  await sharp(buffer).toFile(fullPath)
  const after = (await stat(fullPath)).size

  return { relPath: rel, before, after }
}

async function main() {
  const onlyFolder = process.argv[2] // 예: node scripts/optimize-images.js interior
  const searchRoot = onlyFolder ? path.join(PUBLIC_DIR, onlyFolder) : PUBLIC_DIR
  const relBase = onlyFolder ? onlyFolder : ''

  const allFiles = await collectPngFiles(searchRoot, PUBLIC_DIR)
  const targetFiles = relBase ? allFiles.filter((f) => f.split(path.sep).join('/').startsWith(relBase)) : allFiles

  let totalBefore = 0
  let totalAfter = 0
  let processed = 0
  let skipped = 0

  for (const relPath of targetFiles) {
    const result = await optimizeFile(relPath)
    if (result.skipped) {
      skipped += 1
      continue
    }
    totalBefore += result.before
    totalAfter += result.after
    processed += 1
    console.log(`${result.relPath}: ${(result.before / 1024).toFixed(0)}KB -> ${(result.after / 1024).toFixed(0)}KB`)
  }

  if (!onlyFolder) {
    for (const { rel, maxDim } of EXTRA_FILES) {
      const result = await optimizeExtraFile(IMAGE_DIR, rel, maxDim)
      if (result.skipped) {
        skipped += 1
        continue
      }
      totalBefore += result.before
      totalAfter += result.after
      processed += 1
      console.log(`IMAGE/${result.relPath}: ${(result.before / 1024).toFixed(0)}KB -> ${(result.after / 1024).toFixed(0)}KB`)
    }
  }

  console.log('---')
  console.log(`처리됨: ${processed}, 스킵됨: ${skipped}`)
  console.log(`합계: ${(totalBefore / 1024 / 1024).toFixed(2)}MB -> ${(totalAfter / 1024 / 1024).toFixed(2)}MB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
