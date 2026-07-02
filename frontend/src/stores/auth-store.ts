import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { getElectronAPI } from '@/lib/electron'
import type { User } from '@/types/domain'

type AuthState = {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  hasHydrated: boolean
  setAuth: (payload: {
    user: User
    accessToken: string
    refreshToken: string
  }) => void
  logout: () => void
  setUser: (user: User) => void
  setHasHydrated: (value: boolean) => void
}

// Tokens are persisted through the Electron main process, where they are
// encrypted at rest with the OS keychain (safeStorage). This keeps bearer
// tokens out of renderer-accessible localStorage, so an XSS payload cannot
// read them. Outside Electron (plain browser) nothing is persisted.
const secureStorage: StateStorage = {
  getItem: async (name) => {
    const api = getElectronAPI()
    if (!api) {
      return null
    }
    return api.getSecureItem(name)
  },
  setItem: async (name, value) => {
    const api = getElectronAPI()
    if (!api) {
      return
    }
    await api.setSecureItem(name, value)
  },
  removeItem: async (name) => {
    const api = getElectronAPI()
    if (!api) {
      return
    }
    await api.removeSecureItem(name)
  },
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,
      setAuth: (payload) => {
        set(payload)
      },
      logout: () => {
        set({ user: null, accessToken: null, refreshToken: null })
      },
      setUser: (user) => {
        set({ user })
      },
      setHasHydrated: (value) => {
        set({ hasHydrated: value })
      },
    }),
    {
      name: 'company-brain-lite.auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => () => {
        // Always mark hydration complete, even if rehydration failed or the
        // store was empty, so the app never gets stuck on the loading screen.
        useAuthStore.getState().setHasHydrated(true)
      },
    },
  ),
)
