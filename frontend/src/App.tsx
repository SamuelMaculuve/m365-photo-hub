import { useState, type ReactNode } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { createQueryClient } from '@/lib/queryClient'
import { createAppRouter } from '@/routes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'

export function AppProviders({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [qc] = useState(() => client ?? createQueryClient())
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider delayDuration={400}>
        {children}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default function App() {
  const [router] = useState(createAppRouter)
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
