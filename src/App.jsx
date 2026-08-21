import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './router/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { BagProvider } from './context/BagContext'
import { RegisteredPhotosProvider } from './context/RegisteredPhotosContext'
import { QuestsProvider } from './context/QuestsContext'
import { TutorialProvider } from './context/TutorialContext'
import ProtectedRoute from './router/ProtectedRoute'
import GrowthStageModal from './components/common/GrowthStageModal'
import BackgroundMusicController from './components/common/BackgroundMusicController'
import ButtonSoundController from './components/common/ButtonSoundController'
import SoundAssetPreloader from './components/common/SoundAssetPreloader'
import LoadingOverlay from './components/common/LoadingOverlay'

import AuthRouteLayout from './pages/auth/AuthRouteLayout'

// 라우트 단위 코드 스플리팅: 접속한 화면의 JS만 받아오도록 페이지를 전부 지연 로드한다.
// (예: /login만 열어도 목장·상점·퀴즈 등 다른 페이지 JS까지 같이 받아오는 걸 막는다.)
const Login = lazy(() => import('./pages/auth/Login'))
const Signup = lazy(() => import('./pages/auth/Signup'))
const Ranch = lazy(() => import('./pages/Ranch'))
const RanchHabitat = lazy(() => import('./pages/RanchHabitat'))
const Exploration = lazy(() => import('./pages/Exploration'))
const FieldGuide = lazy(() => import('./pages/FieldGuide'))
const Quests = lazy(() => import('./pages/Quests'))
const Friends = lazy(() => import('./pages/Friends'))
const FriendRanch = lazy(() => import('./pages/FriendRanch'))
const FriendRanchHabitat = lazy(() => import('./pages/FriendRanchHabitat'))
const FriendFieldGuide = lazy(() => import('./pages/FriendFieldGuide'))
const Shop = lazy(() => import('./pages/Shop'))
const Bag = lazy(() => import('./pages/Bag'))
const AiCompanion = lazy(() => import('./pages/AiCompanion'))
const Quiz = lazy(() => import('./pages/Quiz'))
const Profile = lazy(() => import('./pages/Profile'))

export default function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
      <QuestsProvider>
      <BagProvider>
      <RegisteredPhotosProvider>
      <TutorialProvider>
      <BackgroundMusicController />
      <ButtonSoundController />
      <SoundAssetPreloader />
      <GrowthStageModal />
      <Suspense fallback={<LoadingOverlay />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route element={<AuthRouteLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>

        <Route path="/ranch" element={<ProtectedRoute><Ranch /></ProtectedRoute>} />
        <Route path="/ranch/:habitatId" element={<ProtectedRoute><RanchHabitat /></ProtectedRoute>} />
        <Route path="/exploration" element={<ProtectedRoute><Exploration /></ProtectedRoute>} />
        <Route path="/field-guide" element={<ProtectedRoute><FieldGuide /></ProtectedRoute>} />
        <Route path="/quests" element={<ProtectedRoute><Quests /></ProtectedRoute>} />
        <Route path="/friends" element={<ProtectedRoute><Friends /></ProtectedRoute>} />
        <Route path="/friends/ranch/:uid" element={<ProtectedRoute><FriendRanch /></ProtectedRoute>} />
        <Route path="/friends/ranch/:uid/:habitatId" element={<ProtectedRoute><FriendRanchHabitat /></ProtectedRoute>} />
        <Route path="/friends/field-guide/:uid" element={<ProtectedRoute><FriendFieldGuide /></ProtectedRoute>} />
        <Route path="/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
        <Route path="/bag" element={<ProtectedRoute><Bag /></ProtectedRoute>} />
        <Route path="/ai-companion" element={<ProtectedRoute><AiCompanion /></ProtectedRoute>} />
        <Route path="/quiz" element={<ProtectedRoute><Quiz /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/profile/edit" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
      </TutorialProvider>
      </RegisteredPhotosProvider>
      </BagProvider>
      </QuestsProvider>
      </CurrencyProvider>
    </AuthProvider>
  )
}
