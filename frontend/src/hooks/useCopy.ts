import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from '@/components/ui/toast'

export function useCopy() {
  const { t } = useTranslation()
  return useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t('common.copied'))
      } catch {
        toast.error(t('common.copyFailed'))
      }
    },
    [t],
  )
}
