import {
  Activity,
  CircleDot,
  FileText,
  FolderOpen,
  LogOut,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from './ui/button'
import { useAuthStore } from '@/stores/auth-store'
import { authApi } from '@/lib/api'
import { getElectronAPI } from '@/lib/electron'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: '대시보드', icon: Activity },
  { to: '/meetings/new', label: '새 회의', icon: Plus },
  { to: '/meetings', label: '회의록', icon: FileText },
  { to: '/participants', label: '참여자', icon: Users },
  { to: '/settings', label: '설정', icon: Settings },
]

export function AppShell(): React.JSX.Element {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = async (): Promise<void> => {
    await authApi.logout(refreshToken).catch(() => undefined)
    await getElectronAPI()
      ?.writeAppLog({
        level: 'info',
        scope: 'auth.logout',
        message: 'logout requested',
        metadata: { email: user?.email ?? null },
      })
      .catch(() => undefined)
    logout()
    navigate('/login', { replace: true })
  }

  const openLogs = async (): Promise<void> => {
    await getElectronAPI()?.openLogDirectory().catch(() => undefined)
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-[252px] shrink-0 flex-col border-r border-[#24333f] bg-[#14212b] text-white">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-white/55">
                Company Brain
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-normal">Lite</h1>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white',
                    isActive &&
                      'bg-white text-[#10202a] shadow-[0_8px_20px_rgba(0,0,0,0.18)]',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="rounded-md border border-white/10 bg-white/10 px-3 py-3">
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="truncate text-xs text-white/55">
              {user?.email}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm bg-emerald-400/15 px-2 py-1 text-xs font-medium text-emerald-100">
              <CircleDot className="h-3 w-3" />
              {user?.role ?? 'member'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={openLogs}
            >
              <FolderOpen className="h-4 w-4" />
              로그
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center border-b border-border bg-card/95 px-6 shadow-[0_1px_0_rgba(16,24,40,0.03)]">
          <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            회의록 화면에서 제목, 프로젝트, 참석자를 검색합니다.
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
