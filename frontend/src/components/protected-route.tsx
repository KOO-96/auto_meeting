import { Navigate } from 'react-router-dom'
import { AppShell } from './app-shell'
import { useAuthStore } from '@/stores/auth-store'

export function ProtectedRoute(): React.JSX.Element {
  const user = useAuthStore((state) => state.user)

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <AppShell />
}

