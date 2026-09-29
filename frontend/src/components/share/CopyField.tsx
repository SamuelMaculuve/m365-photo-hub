import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCopy } from '@/hooks/useCopy'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CopyField({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation()
  const copy = useCopy()
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <Button variant="secondary" onClick={() => copy(value)}>
        <Copy /> {t('common.copy')}
      </Button>
    </div>
  )
}
