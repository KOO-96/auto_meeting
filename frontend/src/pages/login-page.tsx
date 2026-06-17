import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Activity, LockKeyhole, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { getElectronAPI } from '@/lib/electron'
import { useAuthStore } from '@/stores/auth-store'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일을 입력해주세요.'),
  password: z.string().min(1, '비밀번호를 입력해주세요.'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const setAuth = useAuthStore((state) => state.setAuth)
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@company.local',
      password: 'password',
    },
  })
  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: async (payload) => {
      setAuth(payload)
      await getElectronAPI()
        ?.writeAppLog({
          level: 'info',
          scope: 'auth.login',
          message: 'login succeeded',
          metadata: { email: payload.user.email },
        })
        .catch(() => undefined)
      navigate('/', { replace: true })
    },
    onError: async (error) => {
      await getElectronAPI()
        ?.writeAppLog({
          level: 'error',
          scope: 'auth.login',
          message: 'login failed',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        })
        .catch(() => undefined)
    },
  })

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="grid min-h-screen grid-cols-[minmax(420px,0.95fr)_minmax(480px,1.05fr)] bg-background">
      <section className="flex flex-col justify-between bg-[#14212b] p-10 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/60">Company Brain</p>
            <h1 className="text-2xl font-semibold">Lite</h1>
          </div>
        </div>
        <div className="max-w-md">
          <p className="text-sm font-medium text-white/60">Meeting Workspace</p>
          <p className="mt-3 text-4xl font-semibold leading-tight">
            회의 전용 워크스페이스
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border border-white/10 bg-white/10 p-3">
            <p className="text-white/60">Storage</p>
            <p className="mt-1 font-semibold">Local</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/10 p-3">
            <p className="text-white/60">Runtime</p>
            <p className="mt-1 font-semibold">Electron</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/10 p-3">
            <p className="text-white/60">AI</p>
            <p className="mt-1 font-semibold">vLLM</p>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <p className="text-sm text-muted-foreground">Company Brain Lite</p>
            <CardTitle className="text-2xl">로그인</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) =>
                loginMutation.mutate(values),
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    className="pl-9"
                    autoComplete="email"
                    {...form.register('email')}
                  />
                </div>
                {form.formState.errors.email ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    className="pl-9"
                    autoComplete="current-password"
                    {...form.register('password')}
                  />
                </div>
                {form.formState.errors.password ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              {loginMutation.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {loginMutation.error instanceof Error
                    ? loginMutation.error.message
                    : '로그인에 실패했습니다.'}
                </p>
              ) : null}

              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                로그인
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
