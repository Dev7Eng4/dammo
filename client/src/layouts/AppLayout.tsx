import { Outlet } from 'react-router-dom'
import { ProxyExpiryWarningModal } from '../components/proxy-manager/ProxyExpiryWarningModal'
import { TaskQueuePopup } from '../components/task-queue/TaskQueuePopup'
import { TooltipProvider } from '../components/ui'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <TooltipProvider>
      <div className="flex h-svh overflow-hidden bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>
        <TaskQueuePopup />
        <ProxyExpiryWarningModal />
      </div>
    </TooltipProvider>
  )
}
