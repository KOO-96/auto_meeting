import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/protected-route'
import { useAuthStore } from '@/stores/auth-store'
import { ChangePasswordPage } from '@/pages/change-password-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { LoginPage } from '@/pages/login-page'
import { MeetingCreatePage } from '@/pages/meeting-create-page'
import { MeetingDetailPage } from '@/pages/meeting-detail-page'
import { MeetingListPage } from '@/pages/meeting-list-page'
import { MeetingSessionPage } from '@/pages/meeting-session-page'
import { ParticipantsPage } from '@/pages/participants-page'
import { ProcessingStatusPage } from '@/pages/processing-status-page'
import { SettingsPage } from '@/pages/settings-page'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App(): React.JSX.Element {
  // Auth tokens rehydrate asynchronously from the encrypted secure store.
  // Wait for hydration before routing so we don't flash the login page.
  const hasHydrated = useAuthStore((state) => state.hasHydrated)

  if (!hasHydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-muted-foreground">
        불러오는 중…
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<DashboardPage />} />
            <Route path="/meetings" element={<MeetingListPage />} />
            <Route path="/meetings/new" element={<MeetingCreatePage />} />
            <Route path="/meetings/:meetingId" element={<MeetingDetailPage />} />
            <Route
              path="/meetings/:meetingId/session"
              element={<MeetingSessionPage />}
            />
            <Route
              path="/meetings/:meetingId/status"
              element={<ProcessingStatusPage />}
            />
            <Route path="/participants" element={<ParticipantsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}

export default App
