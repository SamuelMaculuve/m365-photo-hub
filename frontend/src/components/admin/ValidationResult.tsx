import { CheckCircle2, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LibraryValidation } from '@/types'

export function ValidationResult({ result }: { result: LibraryValidation }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="rounded-xl border border-border bg-surface-2 p-3">
      <p className={`mb-2 text-sm font-medium ${result.ok ? 'text-success' : 'text-danger'}`}>
        {result.ok ? t('admin.libraries.validOk') : t('admin.libraries.validFail')}
      </p>
      <ul className="space-y-1.5">
        {result.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-sm">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label={t('common.ok')} />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label={t('common.failed')} />
            )}
            <span>{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
