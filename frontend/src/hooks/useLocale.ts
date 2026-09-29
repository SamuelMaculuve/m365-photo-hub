import { useTranslation } from 'react-i18next'

/** Língua activa ('pt' | 'en') para formatação Intl. */
export function useLocale(): 'pt' | 'en' {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? 'en' : 'pt'
}
