import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, Lock } from 'lucide-react'
import { useAuth } from '../../router/AuthContext'
import { apiUrl } from '../../api/apiBase'
import AuthToast from './AuthToast'

export default function LoginForm() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!id || !password) {
      setStatus('error')
      setToast({ type: 'error', message: '아이디와 비밀번호를 입력해주세요.' })
      return
    }
    setStatus('loading')
    setToast(null)
    try {
      const response = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: id, password }),
      })
      if (!response.ok) {
        setStatus('error')
        setToast({ type: 'error', message: '아이디 또는 비밀번호가 일치하지 않아요.' })
        return
      }
      const { user } = await response.json()
      setStatus('idle')
      login(user)
      navigate('/ranch')
    } catch {
      setStatus('error')
      setToast({ type: 'error', message: '로그인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.' })
    }
  }

  return (
    <>
      <AuthToast type={toast?.type} message={toast?.message} />

      <div className="mx-auto mb-2 flex w-fit items-center rounded-full bg-gradient-to-b from-lime-300 to-lime-500 px-5 py-2 shadow-[0_4px_0_0_#3f6212]">
        <h2 className="whitespace-nowrap font-['Jua'] text-base font-bold text-bark-800">
          로그인하고 탐험을 시작해요!
        </h2>
      </div>

      <form className="flex flex-col gap-2.5" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-bark-800">아이디</span>
          <div className="flex items-center gap-2 rounded-2xl border-2 border-emerald-400/80 bg-white/70 px-4 py-3">
            <User size={22} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="아이디를 입력해주세요"
              autoComplete="username"
              className="w-full bg-transparent text-base text-bark-800 outline-none placeholder:text-bark-400"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-bold text-bark-800">비밀번호</span>
          <div className="flex items-center gap-2 rounded-2xl border-2 border-emerald-400/80 bg-white/70 px-4 py-3">
            <Lock size={22} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력해주세요"
              autoComplete="current-password"
              className="w-full bg-transparent text-base text-bark-800 outline-none placeholder:text-bark-400"
            />
          </div>
        </label>

        <button
          type="submit"
          disabled={status === 'loading'}
          className="mt-1 flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-lime-500 to-emerald-700 px-4 py-3.5 text-lg font-extrabold text-white shadow-[0_6px_0_0_#3f6212] [text-shadow:0_1px_2px_rgba(0,0,0,0.25)] transition-transform active:translate-y-1.5 active:shadow-[0_2px_0_0_#3f6212] disabled:opacity-60"
        >
          {status === 'loading' ? '로그인 중...' : '로그인'}
        </button>

        <Link
          to="/signup"
          className="flex items-center justify-center rounded-2xl border-2 border-lime-400 bg-lime-100/90 py-3 text-base font-bold text-emerald-900 shadow-sm transition-all hover:bg-lime-200"
        >
          처음이신가요? 회원가입하기
        </Link>
      </form>
    </>
  )
}
