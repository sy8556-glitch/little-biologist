import { useState } from 'react'
import FocusedLayout from '../components/common/FocusedLayout'
import LoadingOverlay from '../components/common/LoadingOverlay'
import ResultModal from '../components/common/ResultModal'
import ErrorState from '../components/common/ErrorState'
import EmptyState from '../components/common/EmptyState'
import InsectCard from '../components/common/InsectCard'
import DrawingCanvas from '../components/common/DrawingCanvas'
import { useNavigate } from 'react-router-dom'
import NeighborhoodMap from '../components/common/NeighborhoodMap'
import { NaturePage, NatureSectionTitle } from '../components/common/NatureUI'
import { Camera, Leaf, PencilLine } from 'lucide-react'
import { useRegisteredPhotos } from '../context/RegisteredPhotosContext'
import { useAuth } from '../router/AuthContext'
import { INSECT_SPECIES, getInsectSpecies, DEMO_ACCOUNT_USERNAME } from '../data/insectSpecies'
import { getInsectDrawingGuide } from '../data/insectDrawingGuides'
import { playSfx } from '../utils/sound'
import { SFX } from '../utils/sfx'
import { reportMissionEvent } from '../utils/missionEvents'

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 서버가 막 켜졌을 때는 CLIP 모델을 아직 불러오는 중이라 503을 반환한다. 그동안은 사용자에게
// 에러를 바로 보여주지 않고, 모델이 준비될 때까지 조용히 재시도한다.
async function requestPrediction(endpoint, formData) {
  let lastError
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch(endpoint, { method: 'POST', body: formData })
      if (response.ok || response.status !== 503) return response
      lastError = new Error('CLIP model is still loading')
    } catch (error) {
      lastError = error
    }
    await wait(2000)
  }
  throw lastError || new Error('Prediction server is unavailable')
}

const HINTS = [
  '다른 계절에 다시 찾아보자!',
  '날개 모양을 더 가까이 찍어보자!',
  '다리 개수를 잘 볼 수 있게 밝은 곳에서 찍어보자!',
]

// 직접 그린 그림은 사진과 달리 색/질감 정보가 부족해서, 아이가 보기 형태로 고른 특징이
// CLIP 판독을 크게 보정해준다 (server/clipPredictor.js의 하드 필터·힌트 매칭과 연결됨).
const DRAWING_HINT_OPTIONS = {
  wings: ['없어요', '한 쌍이에요', '두 쌍이에요', '투명해요', '크고 넓어요', '잘 모르겠어요'],
  head: ['작아요', '커요', '눈이 커요', '뿔이 있어요', '뿔이 없어요', '더듬이가 길어요', '잘 모르겠어요'],
  color: ['빨간색', '노란색', '초록색', '갈색', '검은색', '여러 색이에요', '잘 모르겠어요'],
  pattern: ['점이 있어요', '줄무늬가 있어요', '얼룩이 있어요', '반짝여요', '무늬가 없어요', '잘 모르겠어요'],
  legs: ['6개예요', '뒷다리가 길어요', '앞다리가 낫처럼 보여요', '다리가 아주 많아요', '짧고 작아요', '잘 모르겠어요'],
}

// exploration.md Classification Pipeline 참고: 이미지 검증 → 위치 권한 → 후보 조회 →
// 이미지 분석 → 결합 → 신뢰도 판정 → 사용자 확인 → 등록.
// 상태: idle / loading / success / empty(후보 없음) / error(신뢰도 미달·API 실패)
export default function Exploration() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isDemoAccount = user?.username === DEMO_ACCOUNT_USERNAME
  const { registerGoldPhoto, registerSilverSketch } = useRegisteredPhotos()
  const [status, setStatus] = useState('idle')
  const [candidates, setCandidates] = useState([])
  const [candidatePage, setCandidatePage] = useState(0)
  // [수정] 이전에는 렌더링 중(JSX 안)에서 Math.random()을 직접 호출해서
  // 무관한 리렌더링에도 힌트 문구가 계속 바뀌는 React purity 규칙 위반이 있었다.
  // 이제는 결과가 확정되는 이벤트 핸들러 안에서 한 번만 뽑아 상태로 고정한다.
  const [hint, setHint] = useState(HINTS[0])
  const [photoFile, setPhotoFile] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [drawingFile, setDrawingFile] = useState(null)
  const [drawingFileError, setDrawingFileError] = useState('')
  const [drawingDescription, setDrawingDescription] = useState('')
  const [drawingHints, setDrawingHints] = useState({ wings: '', head: '', color: '', pattern: '', legs: '' })
  const [traceQuery, setTraceQuery] = useState('')
  const [tracedSpecies, setTracedSpecies] = useState(null)
  const [isDrawingGuideOpen, setIsDrawingGuideOpen] = useState(true)
  const [registeredName, setRegisteredName] = useState('')
  const [registeredSpeciesId, setRegisteredSpeciesId] = useState(null)

  // 은 등급이 아직 등록되지 않은 종만 "객체 지정해서 그리기" 목록에 보여준다 — 이미 그림으로
  // 등록한 종을 또 고를 필요가 없기 때문이다.
  const traceableSpecies = getInsectSpecies(isDemoAccount).filter((species) => {
    if (species.registeredRanks?.silver) return false
    const query = traceQuery.trim()
    return !query || species.name.includes(query)
  })

  function selectTraceSpecies(species) {
    setTracedSpecies(species)
    setStatus('traceReference')
  }

  function handlePhotoFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setPhotoError('PNG 또는 JPG 파일만 올릴 수 있어요.')
      return
    }

    setPhotoError('')
    setPhotoFile((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
  }

  function handleDrawingFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setDrawingFileError('PNG 또는 JPG 파일만 올릴 수 있어요.')
      return
    }

    setDrawingFileError('')
    setDrawingFile((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return { file, previewUrl: URL.createObjectURL(file) }
    })
  }

  function goBackToIdle() {
    if (photoFile?.previewUrl) URL.revokeObjectURL(photoFile.previewUrl)
    if (drawingFile?.previewUrl) URL.revokeObjectURL(drawingFile.previewUrl)
    setPhotoFile(null)
    setPhotoError('')
    setDrawingFile(null)
    setDrawingFileError('')
    setDrawingDescription('')
    setDrawingHints({ wings: '', head: '', color: '', pattern: '', legs: '' })
    setTraceQuery('')
    setTracedSpecies(null)
    setCandidates([])
    setCandidatePage(0)
    setStatus('idle')
  }

  function goBackToPhotoUpload() {
    goBackToIdle()
    setStatus('photoUpload')
  }

  // "이 중에는 없어요" 버튼 — 다음 3개를 마저 보여주고, 더 이상 없으면 아직 안 보여준 종
  // 중에서 무작위로 몇 개를 추가 후보로 채운다. 이 추가 후보는 실제 분석 결과가 아니라서
  // 신뢰도를 매길 수 없으므로 confidence를 null로 두고 화면에는 "추가 후보"로 표시한다.
  function showMoreCandidates() {
    if ((candidatePage + 1) * 3 < candidates.length) {
      setCandidatePage((page) => page + 1)
      return
    }
    const shownNames = new Set(candidates.map((candidate) => candidate.name))
    const additionalCandidates = getInsectSpecies(isDemoAccount)
      .filter((species) => !shownNames.has(species.name))
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((species, index) => ({
        id: `additional-${species.id}-${index}`,
        name: species.name,
        confidence: null,
      }))
    if (!additionalCandidates.length) {
      setHint('더 추천할 후보가 없어요. 사진을 다시 올려보세요.')
      setStatus('lowConfidence')
      return
    }
    setCandidates((current) => [...current, ...additionalCandidates])
    setCandidatePage((page) => page + 1)
  }

  async function handleUpload(method) {
    setStatus('loading')

    // 사진 기록은 iNaturalist Computer Vision API 프록시로, 직접 그리기는 CLIP 멀티모달
    // 서비스(server/clipPredictor.js)로 분석한다 — 그림은 사진과 달리 색/질감 정보가 부족해서
    // 보기형 특징(drawingHints)을 함께 보내 판독을 보정한다.
    const uploadedFile = method === 'photo' ? photoFile : method === 'drawing-freehand' ? drawingFile : null
    if (uploadedFile) {
      try {
        const formData = new FormData()
        formData.append(method === 'drawing-freehand' ? 'file' : 'image', uploadedFile.file)
        if (method === 'drawing-freehand') {
          const selectedHints = Object.entries(drawingHints)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}: ${value}`)
          const hintText = [...selectedHints, drawingDescription.trim()].filter(Boolean).join('. ')
          formData.append('hint_text', hintText)
        }

        const endpoint = method === 'drawing-freehand' ? '/api/predict-drawing' : '/api/classify-insect'
        const response = await requestPrediction(endpoint, formData)
        if (!response.ok) {
          const body = await response.json().catch(() => null)
          if (body?.error === 'FILE_TOO_LARGE') {
            setHint('파일이 너무 커요. 조금 더 작은 파일로 다시 시도해주세요.')
          } else if (body?.error === 'EMPTY_DRAWING') {
            setHint('그림이 아직 너무 비어 있어요. 곤충의 윤곽이 보이게 조금 더 그려 주세요.')
          } else if (body?.error === 'CLIP_UNAVAILABLE') {
            setHint('AI 모델을 준비하지 못했어요. 서버를 다시 시작해주세요.')
          } else if (response.status === 404) {
            setHint('이전 버전 서버에 연결되어 있어요. 실행 중인 서버를 모두 종료하고 npm run dev를 다시 실행해주세요.')
          } else {
            setHint(body?.message || '분석 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.')
          }
          setStatus('lowConfidence')
          return
        }
        const data = await response.json()

        if (method === 'drawing-freehand' && data.engine_version !== 'node-clip-v2-hard-filter') {
          setHint('이전 버전 서버에 연결되어 있어요. 모든 Node 서버를 종료하고 npm run dev를 다시 실행해주세요.')
          setStatus('lowConfidence')
          return
        }

        const resultCandidates = data.predictions?.map((c) => ({ id: c.insect_id, name: c.ko_name, confidence: c.confidence })) ?? data.candidates
        if (resultCandidates?.length) {
          setCandidates(resultCandidates.map((c, i) => ({ id: `${c.id ?? c.name}-${i}`, name: c.name ?? c.ko_name, confidence: c.confidence })))
          setCandidatePage(0)
          setStatus('candidates')
        } else {
          setHint(HINTS[Math.floor(Math.random() * HINTS.length)])
          setStatus('lowConfidence')
        }
      } catch (err) {
        console.error('[exploration] 분석 요청 실패:', err)
        setHint('AI 서버에 연결하지 못했어요. npm run dev가 실행 중인지 확인해주세요.')
        setStatus('lowConfidence')
      }
      return
    }

    setTimeout(() => {
      const success = Math.random() > 0.3
      if (success) {
        setCandidates([
          { id: 'stag-beetle', name: '사슴벌레', confidence: 92 },
          { id: 'wide-stag-beetle', name: '넓적사슴벌레', confidence: 61 },
        ])
        setCandidatePage(0)
        setStatus('candidates')
      } else {
        setHint(HINTS[Math.floor(Math.random() * HINTS.length)])
        setStatus('lowConfidence')
      }
      void method
    }, 900)
  }

  function handleTraceDrawingComplete(dataUrl) {
    if (tracedSpecies) registerSilverSketch(tracedSpecies.id, dataUrl)
    playSfx(SFX.registerSilver)
    reportMissionEvent({ type: 'exploration_complete' })
    setRegisteredName(tracedSpecies?.name ?? '')
    setRegisteredSpeciesId(tracedSpecies?.id ?? null)
    setStatus('success')
  }

  async function confirmCandidate(candidate) {
    const species = INSECT_SPECIES.find((s) => s.name === candidate.name)
    // showMoreCandidates()가 채워 넣는 추가 후보는 getInsectSpecies(데모 계정 포함)에서 뽑히므로,
    // 일반 계정 도감(INSECT_SPECIES)에는 없는 데모 전용 종일 수 있다 — 이 경우를 안내한다.
    if (!species) {
      setHint('아직 우리 도감에 등록되지 않은 생물이에요. 다른 후보를 골라보거나 사진을 다시 올려보세요.')
      setStatus('lowConfidence')
      return
    }
    if (species && photoFile) {
      const dataUrl = await readFileAsDataUrl(photoFile.file)
      registerGoldPhoto(species.id, dataUrl)
      playSfx(SFX.registerGold)
    } else if (species && drawingFile) {
      const dataUrl = await readFileAsDataUrl(drawingFile.file)
      registerSilverSketch(species.id, dataUrl)
      playSfx(SFX.registerSilver)
    }
    reportMissionEvent({ type: 'exploration_complete' })
    setRegisteredName(candidate.name)
    setRegisteredSpeciesId(species?.id ?? null)
    setStatus('success')
  }

  return (
    <FocusedLayout>
      <NaturePage>
        <NatureSectionTitle
          iconSrc="/ui/explore.png"
          title="탐험"
          description="우리 동네를 탐험하고 다양한 생물들을 발견해보세요!"
          aside={<span className="flex items-center gap-1"><Leaf size={16} /> 생태 관찰 노트</span>}
        />

      {status === 'idle' && (
        <div className="flex flex-col gap-5">
          <NeighborhoodMap />
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStatus('photoUpload')}
              className="nature-card flex flex-col items-center gap-2 text-center hover:shadow-soft"
            >
              <span className="exploration-action-logo" aria-hidden="true">
                <Camera size={32} />
              </span>
              <span className="font-semibold text-ink-900">사진으로 기록하기</span>
              <span className="text-xs text-ink-700/70">카메라로 찍은 사진으로 생물을 알아봐요</span>
            </button>
            <button
              type="button"
              onClick={() => setStatus('drawingChoice')}
              className="nature-card flex flex-col items-center gap-2 text-center hover:shadow-soft"
            >
              <span className="exploration-action-logo" aria-hidden="true">
                <PencilLine size={32} />
              </span>
              <span className="font-semibold text-ink-900">그림으로 기록하기</span>
              <span className="text-xs text-ink-700/70">그림을 그려 나만의 관찰 노트를 완성해요</span>
            </button>
          </div>
        </div>
      )}

      {status === 'photoUpload' && (
        <div>
          <button
            type="button"
            onClick={goBackToIdle}
            className="mb-3 text-xs font-semibold text-ink-700/60 hover:text-ink-900"
          >
            ← 뒤로
          </button>
          <div className="rounded-xl border border-ivory-200 bg-white p-6 shadow-card">
            <label
              htmlFor="photo-upload-input"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ivory-200 p-8 text-center hover:border-leaf-500"
            >
              {photoFile ? (
                <img
                  src={photoFile.previewUrl}
                  alt="선택한 사진 미리보기"
                  className="max-h-48 rounded-lg object-contain"
                />
              ) : (
                <>
                  <span className="exploration-action-logo exploration-action-logo--plain" aria-hidden="true">
                    <Camera size={34} />
                  </span>
                  <span className="font-semibold text-ink-900">사진 파일을 선택해주세요</span>
                  <span className="text-xs text-ink-700/70">PNG 또는 JPG 파일만 올릴 수 있어요</span>
                </>
              )}
            </label>
            <input
              id="photo-upload-input"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handlePhotoFileChange}
              className="sr-only"
            />
            {photoFile && <p className="mt-2 text-center text-xs text-ink-700/70">{photoFile.file.name}</p>}
            {photoError && <p className="mt-2 text-center text-xs text-red-500">{photoError}</p>}
            <button
              type="button"
              onClick={() => handleUpload('photo')}
              disabled={!photoFile}
              className="mt-4 w-full rounded-full bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600 disabled:bg-ivory-200 disabled:text-ink-700/50"
            >
              이 사진으로 분석하기
            </button>
          </div>
        </div>
      )}

      {status === 'drawingUpload' && (
        <div>
          <button
            type="button"
            onClick={() => setStatus('drawingChoice')}
            className="mb-3 text-xs font-semibold text-ink-700/60 hover:text-ink-900"
          >
            ← 뒤로
          </button>
          <div className="rounded-xl border border-ivory-200 bg-white p-6 shadow-card">
            <label
              htmlFor="drawing-upload-input"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ivory-200 p-8 text-center hover:border-leaf-500"
            >
              {drawingFile ? (
                <img
                  src={drawingFile.previewUrl}
                  alt="선택한 그림 미리보기"
                  className="max-h-48 rounded-lg object-contain"
                />
              ) : (
                <>
                  <span className="exploration-action-logo exploration-action-logo--plain" aria-hidden="true">
                    <PencilLine size={34} />
                  </span>
                  <span className="font-semibold text-ink-900">그린 그림 파일을 선택해주세요</span>
                  <span className="text-xs text-ink-700/70">PNG 또는 JPG 파일만 올릴 수 있어요</span>
                </>
              )}
            </label>
            <input
              id="drawing-upload-input"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleDrawingFileChange}
              className="sr-only"
            />
            {drawingFile && <p className="mt-2 text-center text-xs text-ink-700/70">{drawingFile.file.name}</p>}
            {drawingFileError && <p className="mt-2 text-center text-xs text-red-500">{drawingFileError}</p>}

            <label htmlFor="drawing-description-input" className="mt-4 block text-xs font-semibold text-ink-700/80">
              곤충 특징을 골라주세요 (선택)
            </label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Object.entries(DRAWING_HINT_OPTIONS).map(([key, options]) => {
                const labels = { wings: '날개', head: '머리', color: '색상', pattern: '무늬/얼룩', legs: '다리모양' }
                return (
                  <label key={key} className="flex items-center gap-2 rounded-lg bg-ivory-50 px-3 py-2 text-xs font-semibold text-ink-700">
                    <span className="w-16 shrink-0">{labels[key]}</span>
                    <select
                      value={drawingHints[key]}
                      onChange={(event) => setDrawingHints((current) => ({ ...current, [key]: event.target.value }))}
                      className="min-w-0 flex-1 rounded-md border border-ivory-200 bg-white px-2 py-1.5 font-normal outline-none focus:border-leaf-500"
                    >
                      <option value="">선택하기</option>
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                )
              })}
            </div>
            <textarea
              id="drawing-description-input"
              value={drawingDescription}
              onChange={(event) => setDrawingDescription(event.target.value)}
              placeholder="추가로 기억나는 특징을 적어도 좋아요"
              rows={3}
              maxLength={300}
              className="mt-1.5 w-full resize-none rounded-xl border border-ivory-200 bg-white px-3 py-2 text-sm outline-none focus:border-leaf-500"
            />
            <p className="mt-1 text-xs text-ink-700/50">
              발견한 곤충의 특징을 적어주면 AI가 그림을 판독할 때 참고할 수 있어요.
            </p>

            <button
              type="button"
              onClick={() => handleUpload('drawing-freehand')}
              disabled={!drawingFile}
              className="mt-4 w-full rounded-full bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600 disabled:bg-ivory-200 disabled:text-ink-700/50"
            >
              이 그림으로 분석하기
            </button>
          </div>
        </div>
      )}

      {status === 'drawingChoice' && (
        <div>
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="mb-3 text-xs font-semibold text-ink-700/60 hover:text-ink-900"
          >
            ← 뒤로
          </button>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setStatus('drawingUpload')}
              className="nature-card flex flex-col items-center gap-2 text-center hover:shadow-soft"
            >
              <span className="exploration-action-logo exploration-action-logo--plain" aria-hidden="true">
                <PencilLine size={34} />
              </span>
              <span className="font-semibold text-ink-900">직접 그리기</span>
              <span className="text-xs text-ink-700/70">빈 도화지에 자유롭게 그려요</span>
            </button>
            <button
              type="button"
              onClick={() => setStatus('traceSelect')}
              className="nature-card flex flex-col items-center gap-2 text-center hover:shadow-soft"
            >
              <span className="exploration-action-logo exploration-action-logo--plain" aria-hidden="true">
                <Camera size={34} />
              </span>
              <span className="font-semibold text-ink-900">객체 지정해서 그리기</span>
              <span className="text-xs text-ink-700/70">생물을 고르고 따라 그리며 기록해요</span>
            </button>
          </div>
        </div>
      )}

      {status === 'traceSelect' && (
        <div>
          <button
            type="button"
            onClick={() => setStatus('drawingChoice')}
            className="mb-3 text-xs font-semibold text-ink-700/60 hover:text-ink-900"
          >
            ← 뒤로
          </button>
          <p className="mb-3 font-semibold text-ink-900">따라 그릴 곤충을 골라주세요</p>
          <input
            type="text"
            value={traceQuery}
            onChange={(event) => setTraceQuery(event.target.value)}
            placeholder="곤충 이름으로 검색..."
            aria-label="곤충 이름으로 검색"
            className="mb-3 w-full rounded-full border border-ivory-200 bg-white px-4 py-2 text-sm outline-none focus:border-leaf-500"
          />
          {traceableSpecies.length === 0 ? (
            <EmptyState title="더 고를 곤충이 없어요" description="은 등급으로 등록되지 않은 곤충을 모두 찾았어요!" />
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
              {traceableSpecies.map((species) => (
                <InsectCard
                  key={species.id}
                  name={species.name}
                  image={species.image}
                  rank={species.representativeRank}
                  // 도감 등록 여부와 별개로 따라그리기 선택 목록은 전부 잠금 없이 보여준다 — 아직
                  // 등록 안 한 곤충을 골라 그리는 게 이 기능의 목적이라, "미수집 곤충" 잠금 표시가
                  // 여기서는 오히려 혼란을 준다.
                  registered
                  onClick={() => selectTraceSpecies(species)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'traceReference' && tracedSpecies && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStatus('traceSelect')}
              className="text-xs font-semibold text-ink-700/60 hover:text-ink-900"
            >
              ← 다른 곤충 고르기
            </button>
            {getInsectDrawingGuide(tracedSpecies.name) && (
              <button
                type="button"
                onClick={() => setIsDrawingGuideOpen((open) => !open)}
                className="rounded-full bg-ivory-100 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ivory-200"
              >
                {isDrawingGuideOpen ? '가이드라인 숨기기' : '가이드라인 보기'}
              </button>
            )}
          </div>
          <div className="rounded-xl border border-ivory-200 bg-white p-6 shadow-card">
            <p className="mb-3 text-center font-semibold text-ink-900">
              {tracedSpecies.name}을(를) 따라 그려보세요
            </p>
            {isDrawingGuideOpen && getInsectDrawingGuide(tracedSpecies.name) && (
              <ul className="mb-4 list-disc space-y-1 rounded-xl bg-leaf-50 p-4 pl-8 text-sm leading-relaxed text-ink-700/85">
                {getInsectDrawingGuide(tracedSpecies.name).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <DrawingCanvas
              backgroundImage={tracedSpecies.defaultUrl ?? tracedSpecies.image}
              altText={`${tracedSpecies.name} 따라 그리기 참고 이미지`}
              onComplete={handleTraceDrawingComplete}
              traceMode
            />
          </div>
        </div>
      )}

      {status === 'loading' && (
        <LoadingOverlay
          message={tracedSpecies ? `${tracedSpecies.name} 그림을 확인하고 있어요...` : 'AI가 생물을 분석하고 있어요...'}
        />
      )}

      {status === 'candidates' && (
        <div className="rounded-xl bg-white p-5 shadow-card">
          <p className="mb-3 font-semibold text-ink-900">이 생물이 맞을까요?</p>
          <ul className="flex flex-col gap-2">
            {candidates.slice(candidatePage * 3, candidatePage * 3 + 3).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => confirmCandidate(c)}
                  className="flex w-full items-center justify-between rounded-xl border border-ivory-200 px-4 py-3 text-left hover:border-leaf-500"
                >
                  <span className="font-medium text-ink-900">{c.name}</span>
                  <span className="text-xs text-ink-700/70">
                    {c.confidence == null ? '추가 후보' : `일치율 ${c.confidence}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={showMoreCandidates}
              className="rounded-full bg-leaf-500 px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-600"
            >
              이 중에는 없어요
            </button>
            <button
              type="button"
              onClick={goBackToPhotoUpload}
              className="rounded-full bg-ivory-100 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ivory-200"
            >
              사진 다시 올리기
            </button>
          </div>
          <p className="mt-3 text-xs text-ink-700/60">
            신뢰도 70% 미만 후보는 확정 등록되지 않아요. 확실한 후보를 골라주세요.
          </p>
        </div>
      )}

      {status === 'lowConfidence' && (
        <ErrorState
          title="아직은 확신이 없어요"
          description={hint}
          onRetry={() => setStatus('idle')}
        />
      )}

      <ResultModal
        open={status === 'success'}
        imageSrc="/ui/field-guide-success.png"
        title="도감에 등록했어요!"
        description={registeredName ? `${registeredName} 카드가 도감에 추가됐어요.` : '새로운 카드가 도감에 추가됐어요.'}
        confirmLabel="도감에서 확인하기"
        onConfirm={() => navigate('/field-guide', { state: { selectedSpeciesId: registeredSpeciesId } })}
      />
      </NaturePage>
    </FocusedLayout>
  )
}
