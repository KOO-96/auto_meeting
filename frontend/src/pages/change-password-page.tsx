import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { LockKeyhole } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

const schema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력해주세요.'),
    newPassword: z.string().min(8, '새 비밀번호는 8자 이상이어야 합니다.'),
    confirmPassword: z.string().min(1, '새 비밀번호를 다시 입력해주세요.'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: '새 비밀번호가 일치하지 않습니다.',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
  })

type ChangePasswordForm = z.infer<typeof schema>

export function ChangePasswordPage(): React.JSX.Element {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: ChangePasswordForm) =>
      authApi.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: (updatedUser) => {
      setUser(updatedUser)
      navigate('/', { replace: true })
    },
  })

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Already rotated — no reason to stay here.
  if (!user.mustChangePassword) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Company Brain Lite</p>
          <CardTitle className="text-2xl">비밀번호 변경 필요</CardTitle>
          <p className="text-sm text-muted-foreground">
            초기 비밀번호를 사용 중입니다. 계속하려면 새 비밀번호로 변경해주세요.
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          >
            {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map(
              (field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={field}>
                    {field === 'currentPassword'
                      ? '현재 비밀번호'
                      : field === 'newPassword'
                        ? '새 비밀번호'
                        : '새 비밀번호 확인'}
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id={field}
                      type="password"
                      className="pl-9"
                      autoComplete={
                        field === 'currentPassword'
                          ? 'current-password'
                          : 'new-password'
                      }
                      {...form.register(field)}
                    />
                  </div>
                  {form.formState.errors[field] ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors[field]?.message}
                    </p>
                  ) : null}
                </div>
              ),
            )}

            {mutation.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : '비밀번호 변경에 실패했습니다.'}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              비밀번호 변경
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
