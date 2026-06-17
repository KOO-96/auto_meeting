import { FileText } from 'lucide-react'

export function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}): React.JSX.Element {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
      <FileText className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

