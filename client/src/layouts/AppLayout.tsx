import { Outlet } from 'react-router-dom';
import { ProxyExpiryWarningModal } from '../components/proxy-manager/ProxyExpiryWarningModal';
import { TaskQueuePopup } from '../components/task-queue/TaskQueuePopup';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain p-6">
          <Outlet />
        </main>
      </div>
      <TaskQueuePopup />
      <ProxyExpiryWarningModal />
    </div>
  );
}
