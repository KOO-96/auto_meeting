import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { participantsApi } from '@/lib/api'
import type { UserRole } from '@/types/domain'

export function ParticipantsPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: 'password',
    department: '',
    position: '',
    role: 'member' as UserRole,
  })
  const participantsQuery = useQuery({
    queryKey: ['participants', query],
    queryFn: () => participantsApi.search(query),
  })
  const createMutation = useMutation({
    mutationFn: participantsApi.create,
    onSuccess: async () => {
      setForm({
        name: '',
        email: '',
        password: 'password',
        department: '',
        position: '',
        role: 'member',
      })
      await queryClient.invalidateQueries({ queryKey: ['participants'] })
    },
  })
  const participants = participantsQuery.data ?? []

  return (
    <div>
      <PageHeader
        title="참여자 관리"
        description="MVP에서는 검색과 추가를 중심으로 제공합니다."
      />

      <div className="grid grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>참여자 검색</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름, 이메일, 부서 검색"
                className="pl-9"
              />
            </div>

            <div className="divide-y divide-border rounded-lg border border-border">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="grid grid-cols-[1fr_1fr_120px] items-center px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{participant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {participant.email}
                    </p>
                  </div>
                  <span>{participant.department ?? '-'}</span>
                  <span>{participant.role === 'admin' ? '관리자' : '멤버'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>참여자 추가</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                createMutation.mutate({
                  name: form.name,
                  email: form.email,
                  department: form.department || null,
                  position: form.position || null,
                  role: form.role,
                  password: form.password,
                })
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={form.name}
                  required
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participant-email">이메일</Label>
                <Input
                  id="participant-email"
                  type="email"
                  value={form.email}
                  required
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">초기 비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  required
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">부서</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      department: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">직책</Label>
                <Input
                  id="position"
                  value={form.position}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      position: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">역할</Label>
                <Select
                  id="role"
                  value={form.role}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      role: event.target.value as UserRole,
                    }))
                  }
                >
                  <option value="member">멤버</option>
                  <option value="admin">관리자</option>
                </Select>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                등록 사용자 추가
              </Button>
              {createMutation.error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : '참여자 등록에 실패했습니다.'}
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
