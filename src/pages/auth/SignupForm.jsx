import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, Lock, Sprout } from 'lucide-react'
import { useAuth } from '../../router/AuthContext'
import { apiUrl } from '../../api/apiBase'
import AuthToast from './AuthToast'

export default function SignupForm() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username || !password || !nickname) return
    setToast(null)
    try {
      const response = await fetch(apiUrl('/api/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, nickname }),
      })
      if (!response.ok) {
        const { error } = await response.json().catch(() => ({}))
        setToast({ type: 'error', message: error === 'USERNAME_TAKEN' ? '이미 사용 중인 아이디예요.' : '회원가입 중 문제가 발생했어요.' })
        return
      }
      const { user } = await response.json()
      login(user)
      navigate('/ranch', { state: { firstLogin: true } })
    } catch {
      setToast({ type: 'error', message: '회원가입 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.' })
    }
  }

  return (
    <>
      <AuthToast type={toast?.type} message={toast?.message} />

      <div className="mx-auto mb-2 flex w-fit items-center rounded-full bg-gradient-to-b from-lime-300 to-lime-500 px-5 py-2 shadow-[0_4px_0_0_#3f6212]">
        <h2 className="whitespace-nowrap font-['Jua'] text-base font-bold text-bark-800">
          닉네임을 정하고 알을 만나보세요
        </h2>
      </div>

      <form className="flex flex-col gap-2.5" onSubmit={handleSubmit} noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-bark-800">아이디</span>
          <div className="flex items-center gap-2 rounded-2xl border-2 border-emerald-400/80 bg-white/70 px-4 py-3">
            <User size={22} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
              autoComplete="new-password"
              className="w-full bg-transparent text-base text-bark-800 outline-none placeholder:text-bark-400"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-bold text-bark-800">닉네임</span>
          <div className="flex items-center gap-2 rounded-2xl border-2 border-emerald-400/80 bg-white/70 px-4 py-3">
            <Sprout size={22} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임을 입력해주세요"
              className="w-full bg-transparent text-base text-bark-800 outline-none placeholder:text-bark-400"
            />
          </div>
        </label>

        <button
          type="submit"
          className="mt-1 flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-lime-500 to-emerald-700 px-4 py-3.5 text-lg font-extrabold text-white shadow-[0_6px_0_0_#3f6212] [text-shadow:0_1px_2px_rgba(0,0,0,0.25)] transition-transform active:translate-y-1.5 active:shadow-[0_2px_0_0_#3f6212] disabled:opacity-60 disabled:active:translate-y-0 disabled:active:shadow-[0_6px_0_0_#3f6212]"
        >
          가입하고 알 만나기
        </button>

        <Link
          to="/login"
          className="flex items-center justify-center rounded-2xl border-2 border-lime-400 bg-lime-100/90 py-3 text-base font-bold text-emerald-900 shadow-sm transition-all hover:bg-lime-200"
        >
          이미 계정이 있으신가요? 로그인
        </Link>
      </form>
    </>
  )
}
