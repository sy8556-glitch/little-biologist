import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthScreen } from './authVisuals'
import LoadingOverlay from '../../components/common/LoadingOverlay'

// /login, /signup가 이 레이아웃 아래에서 전환된다. AuthScreen(배경+로고+카드
// 틀)은 여기서 한 번만 마운트되어 라우트가 바뀌어도 리마운트되지 않으므로
// 제목/로고는 그대로 있고, 카드 안 내용(Outlet)만 부드럽게 크로스페이드된다.
export default function AuthRouteLayout() {
  const location = useLocation()

  return (
    <AuthScreen>
      <motion.div layout transition={{ layout: { duration: 0.22, ease: 'easeOut' } }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Suspense fallback={<LoadingOverlay />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AuthScreen>
  )
}
