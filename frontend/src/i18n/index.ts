import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from './locales/pt.json'
import en from './locales/en.json'

export const SUPPORTED_LOCALES = ['pt', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
const STORAGE_KEY = 'fotos.locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'pt' || saved === 'en') return saved
  } catch {
    /* armazenamento indisponível */
  }
  return 'pt'
}

export function isLocale(v: unknown): v is Locale {
  return v === 'pt' || v === 'en'
}

export async function setLocale(locale: Locale): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    /* ignorar */
  }
  if (i18n.language !== locale) await i18n.changeLanguage(locale)
}

void i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en } },
  lng: initialLocale(),
  fallbackLng: 'pt',
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: { escapeValue: false },
  returnNull: false,
})

const syncHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng.startsWith('en') ? 'en' : 'pt'
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
