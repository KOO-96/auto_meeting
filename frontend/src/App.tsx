import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/protected-route'
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
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
