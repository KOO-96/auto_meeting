import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Renderer error boundary caught an error.', error, errorInfo)
  }

  private reload = (): void => {
    window.location.reload()
  }

  private goHome = (): void => {
    this.setState({ error: null })
    window.location.hash = '#/'
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <section className="w-full max-w-xl rounded-md border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-destructive">
            화면을 표시하는 중 오류가 발생했습니다.
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-card-foreground">
            앱 화면을 다시 불러와주세요.
          </h1>
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
          <div className="mt-5 flex gap-2">
            <Button type="button" onClick={this.reload}>
              다시 불러오기
            </Button>
            <Button type="button" variant="outline" onClick={this.goHome}>
              대시보드로 이동
            </Button>
          </div>
        </section>
      </main>
    )
  }
}
