import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage } from '@huggingface/transformers'
import { INSECT_SPECIES } from '../src/data/insectSpecies.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Transformers.js runs the ONNX-converted equivalent of openai/clip-vit-base-patch32.
// The Xenova repository contains the browser/Node-compatible ONNX files.
const MODEL_ID = process.env.CLIP_MODEL_ID || 'Xenova/clip-vit-base-patch32'
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TRAINED_MODEL_PATH = path.join(ROOT_DIR, 'training', 'sketch-model.json')

const ENGLISH_NAMES = {
  1: 'rhinoceros beetle', 2: 'one-horned rhinoceros beetle', 3: 'bronze beetle', 4: 'Gideon rhinoceros beetle', 5: 'white-spotted flower chafer',
  6: 'flea beetle', 7: 'poplar leaf beetle', 8: 'blue leaf beetle', 9: 'willow leaf beetle', 10: 'saw stag beetle', 11: 'Dorcus stag beetle',
  12: 'flat stag beetle', 13: 'small stag beetle', 14: 'seven-spotted ladybug', 15: 'tortoise ladybug', 16: 'twenty-eight-spotted ladybug',
  18: 'spotted longhorn beetle', 19: 'great longhorn beetle', 20: 'oak longhorn beetle', 21: 'pine sawyer beetle', 22: 'mulberry longhorn beetle',
  23: 'beautiful ground beetle', 24: 'jewel beetle', 25: 'tiger beetle', 26: 'dung beetle', 27: 'firefly', 28: 'Asian swallowtail butterfly',
  29: 'cabbage white butterfly', 30: 'peacock butterfly', 31: 'yellow butterfly', 32: 'glasswing butterfly', 33: 'owl butterfly', 34: 'silkworm moth',
  35: 'tiger moth', 36: 'sphinx moth', 37: 'moth caterpillar', 38: 'western honey bee', 39: 'Asian honey bee', 40: 'bumblebee', 41: 'giant hornet',
  42: 'yellowjacket', 43: 'paper wasp', 44: 'Japanese carpenter ant', 45: 'spiny ant', 46: 'fire ant', 47: 'big-headed ant', 48: 'cicada',
  49: 'large cicada', 50: 'evening cicada', 51: 'robust cicada', 52: 'lanternfly', 53: 'brown marmorated stink bug', 54: 'jewel stink bug',
  55: 'water strider', 56: 'giant water bug', 57: 'water bug', 58: 'diving beetle', 59: 'flatid planthopper', 60: 'scarlet dragonfly',
  61: 'king dragonfly', 62: 'wandering glider', 63: 'giant dragonfly', 64: 'damselfly', 65: 'demoiselle damselfly', 66: 'praying mantis',
  67: 'wide-bellied mantis', 68: 'Chinese mantis', 69: 'rice grasshopper', 70: 'grasshopper', 71: 'katydid', 72: 'cricket', 73: 'bell cricket',
  74: 'camel cricket', 75: 'mole cricket', 76: 'stick insect', 77: 'earwig', 78: 'pill bug', 79: 'earthworm', 80: 'house centipede',
}

function englishDescription(id, name) {
  if ([14, 15, 16].includes(Number(id))) return `${name}; a rounded beetle with red, yellow, or brown wing covers and black spots`
  if (Number(id) >= 28 && Number(id) <= 37) return `${name}; a butterfly or moth with broad wings, stripes, spots, eye marks, or transparent patches`
  if (Number(id) >= 38 && Number(id) <= 47) return `${name}; a bee, wasp, or ant with six legs, antennae, and yellow, black, or brown bands or hair`
  if (Number(id) >= 48 && Number(id) <= 54) return `${name}; a long-bodied insect with wings, antennae, and brown, green, black, or colorful markings`
  if (Number(id) >= 55 && Number(id) <= 65) return `${name}; a water insect or dragonfly with clear veined wings or a smooth dark body and six legs`
  if (Number(id) >= 66 && Number(id) <= 68) return `${name}; a green or brown insect with a triangular head and large front legs shaped like scythes`
  if (Number(id) >= 69 && Number(id) <= 75) return `${name}; a brown or green insect with six legs and enlarged jumping hind legs or long antennae`
  if (Number(id) >= 76 && Number(id) <= 80) return `${name}; a wingless insect or arthropod with a long, segmented, or many-legged body`
  return `${name}; a beetle with six legs, antennae, hard wing covers, and a rounded or elongated body`
}

const SPECIES = INSECT_SPECIES.filter((species) => Number(species.id) <= 80).slice(0, 79).map((species) => ({
  id: species.id,
  ko_name: species.name,
  en_name: ENGLISH_NAMES[species.id] || 'insect',
  description: englishDescription(species.id, ENGLISH_NAMES[species.id] || 'insect'),
}))

const HINT_TRANSLATIONS = {
  '없어요': 'no visible wings', '한 쌍이에요': 'one pair of wings', '두 쌍이에요': 'two pairs of wings', '투명해요': 'transparent wings', '크고 넓어요': 'large broad wings',
  '작아요': 'a small head', '커요': 'a large head', '눈이 커요': 'large eyes', '뿔이 있어요': 'horns on the head', '더듬이가 길어요': 'long antennae',
  '빨간색': 'red body', '노란색': 'yellow body', '초록색': 'green body', '갈색': 'brown body', '검은색': 'black body', '여러 색이에요': 'many colors',
  '점이 있어요': 'black spots', '줄무늬가 있어요': 'stripes', '얼룩이 있어요': 'blotches or patches', '반짝여요': 'shiny or metallic body', '무늬가 없어요': 'plain body',
  '6개예요': 'six legs', '뒷다리가 길어요': 'long jumping hind legs', '앞다리가 낫처럼 보여요': 'large front legs shaped like scythes', '다리가 아주 많아요': 'many legs', '짧고 작아요': 'short small legs',
}

// Child-facing hints are evidence as well as hard constraints. Beetles can
// have hidden wings under their wing covers, so they remain eligible when a
// child says "no visible wings". Flying butterflies, bees, wasps and
// dragonflies are removed in that case.
const NO_VISIBLE_WINGS_IDS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  37, 44, 45, 46, 47, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
])
const HORN_OR_LARGE_MANDIBLE_IDS = new Set([1, 2, 4, 10, 11, 12, 13, 66, 67, 68])

function getHardConstraintIndexes(hintText) {
  const hint = hintText.toLowerCase()
  let allowed = SPECIES.map((_, index) => index)
  if (/(?:(날개|wings)\s*:\s*)(없어요|no visible wings|none)/i.test(hint)) {
    allowed = allowed.filter((index) => NO_VISIBLE_WINGS_IDS.has(Number(SPECIES[index].id)))
  }
  if (/(?:(머리|head)\s*:\s*)(뿔이 있어요|horns? on the head|large front legs shaped like scythes)/i.test(hint)) {
    allowed = allowed.filter((index) => HORN_OR_LARGE_MANDIBLE_IDS.has(Number(SPECIES[index].id)))
  }
  if (/(?:(머리|head)\s*:\s*)(뿔이 없어요|no horns?)/i.test(hint)) {
    allowed = allowed.filter((index) => !HORN_OR_LARGE_MANDIBLE_IDS.has(Number(SPECIES[index].id)))
  }
  // Only activate a hard filter when it still leaves enough candidates for a
  // useful Top 5. This prevents one mistaken child selection from producing
  // an empty result.
  return allowed.length >= 5 ? new Set(allowed) : null
}

function translateHint(hintText) {
  return hintText.split(/([.!?,:\n])/).map((part) => HINT_TRANSLATIONS[part.trim()] || part).join('').replace(/wings\s*:/gi, 'wings:').replace(/head\s*:/gi, 'head:').replace(/color\s*:/gi, 'color:').replace(/pattern\s*:/gi, 'pattern:').replace(/legs\s*:/gi, 'legs:')
}

function normalize(values) {
  const data = values.data ?? values
  const dims = values.dims || [data.length]
  const width = dims[dims.length - 1]
  const output = new Float32Array(data.length)
  for (let row = 0; row < data.length / width; row += 1) {
    let norm = 0
    for (let col = 0; col < width; col += 1) norm += data[row * width + col] ** 2
    norm = Math.sqrt(norm) || 1
    for (let col = 0; col < width; col += 1) output[row * width + col] = data[row * width + col] / norm
  }
  return { data: output, rows: data.length / width, width }
}

function dotRows(left, right, row) {
  let score = 0
  for (let i = 0; i < left.width; i += 1) score += left.data[row * left.width + i] * right.data[i]
  return score
}

function softmax(values) {
  const max = Math.max(...values)
  const exp = values.map((value) => Math.exp(value - max))
  const total = exp.reduce((sum, value) => sum + value, 0)
  return exp.map((value) => value / total)
}

// 여러 청크의 normalize() 결과({data, rows, width})를 하나로 이어 붙인다 — 한 번에 큰 배치로
// 넣지 않고 작은 묶음으로 나눠 처리한 뒤 합칠 때 공통으로 쓴다.
function concatNormalizedChunks(chunks) {
  if (!chunks.length) return null
  return {
    data: Float32Array.from(chunks.flatMap((chunk) => Array.from(chunk.data))),
    rows: chunks.reduce((sum, chunk) => sum + chunk.rows, 0),
    width: chunks[0].width,
  }
}

// 텍스트도 79개를 한 번에(그것도 candidatePrompts/descriptions 두 묶음을 Promise.all로 동시에)
// 배치 처리하면 트랜스포머 activation 메모리가 그만큼 쌓인다 — 이미지와 같은 이유로 작은
// 묶음으로 나눠 순차 처리한다(동시에 X, 하나씩).
const TEXT_BATCH_SIZE = 8
async function embedTextsInBatches(textModel, tokenizer, texts) {
  const chunks = []
  for (let start = 0; start < texts.length; start += TEXT_BATCH_SIZE) {
    const batch = texts.slice(start, start + TEXT_BATCH_SIZE)
    const output = await textModel(tokenizer(batch, { padding: true, truncation: true }))
    chunks.push(normalize(output.text_embeds))
  }
  return concatNormalizedChunks(chunks)
}

let predictorPromise

export function getClipPredictor() {
  if (!predictorPromise) {
    predictorPromise = (async () => {
      // CLIP ViT-B/32는 fp32 그대로 불러오면 가중치만 ~600MB라 Render 무료 플랜의 512MB RAM
      // 한도를 그 자체로 넘겨서 OOM으로 계속 죽었다(Events 로그: "Ran out of memory (used
      // over 512MB)") — q8(int8 양자화) 버전을 불러와 가중치 용량을 4분의 1 수준으로 줄인다.
      const [processor, tokenizer, textModel, visionModel] = await Promise.all([
        AutoProcessor.from_pretrained(MODEL_ID),
        AutoTokenizer.from_pretrained(MODEL_ID),
        CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
        CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
      ])
      const candidatePrompts = SPECIES.map((item) => `a child's drawing of a ${item.en_name}, a doodle or sketch`)
      const descriptions = SPECIES.map((item) => item.description)
      // 79개를 한 번에(그것도 두 묶음을 Promise.all로 동시에) 배치 처리하면 트랜스포머 activation
      // 메모리가 그만큼 쌓여서, 가중치를 q8로 줄여도 시작 시점 메모리가 크게 튄다(Events 로그:
      // OOM + status 137 강제종료). 텍스트·이미지 모두 작은 묶음으로 순차 처리해 최대 메모리
      // 사용량을 배치 크기만큼으로 제한한다 — 동시에 두 개를 처리하지도 않는다.
      const candidateFeatures = await embedTextsInBatches(textModel, tokenizer, candidatePrompts)
      const descriptionFeatures = await embedTextsInBatches(textModel, tokenizer, descriptions)

      const REFERENCE_BATCH_SIZE = 8
      const referenceEmbeddingChunks = []
      for (let start = 0; start < SPECIES.length; start += REFERENCE_BATCH_SIZE) {
        const batchSpecies = SPECIES.slice(start, start + REFERENCE_BATCH_SIZE)
        const batchImages = []
        for (const species of batchSpecies) {
          const id = String(species.id).padStart(2, '0')
          const imagePath = path.join(ROOT_DIR, 'public', 'insects-original', `${id}.png`)
          try { batchImages.push(await RawImage.read(imagePath)) } catch { /* 이미지 없는 종은 건너뜀 */ }
        }
        if (!batchImages.length) continue
        const batchOutput = await visionModel(await processor(batchImages))
        referenceEmbeddingChunks.push(normalize(batchOutput.image_embeds))
      }
      const referenceFeatures = concatNormalizedChunks(referenceEmbeddingChunks)
      let trainedSketchModel = null
      try { trainedSketchModel = JSON.parse(await fs.readFile(TRAINED_MODEL_PATH, 'utf8')) } catch { /* training data is optional */ }
      return { processor, tokenizer, textModel, visionModel, candidateFeatures, descriptionFeatures, referenceFeatures, trainedSketchModel }
    })()
  }
  return predictorPromise
}

export async function predictDrawing(buffer, hintText = '') {
  const predictor = await getClipPredictor()
  const imageFeatures = await embedImage(buffer, predictor)
  const imageLogits = SPECIES.map((_, index) => dotRows(imageFeatures, { data: predictor.candidateFeatures.data.slice(index * predictor.candidateFeatures.width, (index + 1) * predictor.candidateFeatures.width), width: predictor.candidateFeatures.width }, 0) * 100)
  const imageScores = softmax(imageLogits)
  const referenceScores = predictor.referenceFeatures ? softmax(SPECIES.map((_, index) => dotRows(imageFeatures, { data: predictor.referenceFeatures.data.slice(index * predictor.referenceFeatures.width, (index + 1) * predictor.referenceFeatures.width), width: predictor.referenceFeatures.width }, 0) * 100)) : imageScores
  let finalScores = imageScores.map((score, index) => referenceScores[index] * 0.6 + score * 0.4)
  const constraintIndexes = hintText.trim() ? getHardConstraintIndexes(hintText) : null
  if (hintText.trim()) {
    const hintOutput = await predictor.textModel(predictor.tokenizer([translateHint(hintText)], { padding: true, truncation: true }))
    const hintFeatures = normalize(hintOutput.text_embeds)
    const textScores = SPECIES.map((_, index) => (dotRows(hintFeatures, { data: predictor.descriptionFeatures.data.slice(index * predictor.descriptionFeatures.width, (index + 1) * predictor.descriptionFeatures.width), width: predictor.descriptionFeatures.width }, 0) + 1) / 2)
    finalScores = finalScores.map((score, index) => score * 0.75 + textScores[index] * 0.25)
  }
  if (predictor.trainedSketchModel?.total_samples > 0 && predictor.trainedSketchModel?.classes?.length === SPECIES.length) {
    const learnedScores = softmax(predictor.trainedSketchModel.classes.map((item) => dotRows(imageFeatures, { data: Float32Array.from(item.centroid), width: predictor.candidateFeatures.width }, 0) * 100))
    finalScores = finalScores.map((score, index) => score * 0.75 + learnedScores[index] * 0.25)
  }
  if (constraintIndexes) {
    finalScores = finalScores.map((score, index) => constraintIndexes.has(index) ? score : -Infinity)
  }
  const scoreTotal = finalScores.reduce((sum, score) => sum + (Number.isFinite(score) ? Math.max(0, score) : 0), 0) || 1
  finalScores = finalScores.map((score) => Number.isFinite(score) ? Math.max(0, score) / scoreTotal : 0)
  return [...finalScores.keys()].sort((a, b) => finalScores[b] - finalScores[a]).slice(0, 5).map((index) => ({
    insect_id: SPECIES[index].id,
    ko_name: SPECIES[index].ko_name,
    en_name: SPECIES[index].en_name,
    confidence: Number((finalScores[index] * 100).toFixed(2)),
  }))
}

async function embedImage(buffer, predictor) {
  predictor ||= await getClipPredictor()
  const image = await RawImage.read(new Blob([buffer]))
  const imageOutput = await predictor.visionModel(await predictor.processor(image))
  return normalize(imageOutput.image_embeds)
}

export { embedImage }

export { SPECIES }
