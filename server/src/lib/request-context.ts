import { AsyncLocalStorage } from 'node:async_hooks'
import type { Locale } from './i18n'

/** Dados do pedido actual acessíveis fora dos handlers (ex.: língua das mensagens de validação). */
export const requestContext = new AsyncLocalStorage<{ locale: Locale }>()
export const currentLocale = (): Locale => requestContext.getStore()?.locale ?? 'pt'
