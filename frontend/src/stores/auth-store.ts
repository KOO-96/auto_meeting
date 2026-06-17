import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/domain'

type AuthState = {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (payload: {
    user: User
    accessToken: string
    refreshToken: string
  }) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (payload) => {
        set(payload)
      },
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    {
      name: 'company-brain-lite.auth',
    },
  ),
)

