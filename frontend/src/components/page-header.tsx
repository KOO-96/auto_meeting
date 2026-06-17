import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h2 className="truncate text-2xl font-semibold tracking-normal">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
