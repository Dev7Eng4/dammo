import { Outlet } from 'react-router-dom'
import { ProxyExpiryWarningModal } from '../components/proxy-manager/ProxyExpiryWarningModal'
import { TaskQueuePopup } from '../components/task-queue/TaskQueuePopup'
import { TooltipProvider } from '../components/ui'
import { Sidebar } from './Sidebar'

/**
 * Inset layout: the sidebar sits directly on a darker "frame" and the page
 * content lives in a floating, rounded panel (Linear / Vercel style).
 */
export function AppLayout() {
  return (
    <TooltipProvider>
      <div className="flex h-svh overflow-hidden bg-frame">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col py-2 pr-2">
          <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-[0_1px_2px_rgb(0_0_0/0.12),0_8px_24px_-8px_rgb(0_0_0/0.25)]">
            {/* soft warm light from the top edge — gives depth without noise */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_srgb,var(--color-primary-500)_9%,transparent),transparent)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary-500/40 to-transparent"
            />
            <div className="relative flex min-h-0 flex-1 flex-col">
              <Outlet />
            </div>
          </main>
        </div>
        <TaskQueuePopup />
        <ProxyExpiryWarningModal />
      </div>
    </TooltipProvider>
  )
}
