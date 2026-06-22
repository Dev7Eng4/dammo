import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { TaskQueueProvider } from './contexts/TaskQueueContext';
import { AppLayout } from './layouts/AppLayout';
import { ChromeProfilesPage } from './pages/ChromeProfilesPage';
import { DashboardPage } from './pages/DashboardPage';
import { GpmManagerPage } from './pages/GpmManagerPage';
import { MailAccountsPage } from './pages/MailAccountsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProxiesPage } from './pages/ProxiesPage';
import { PromptsPage } from './pages/PromptsPage';
import { RenderQueuePage } from './pages/RenderQueuePage';
import { SourceChannelDetailPage } from './pages/SourceChannelDetailPage';
import { SourceChannelsPage } from './pages/SourceChannelsPage';
import { TaskQueuePage } from './pages/TaskQueuePage';
import { VideoFactoryPage } from './pages/VideoFactoryPage';
import { YoutubeChannelDetailPage } from './pages/YoutubeChannelDetailPage';
import { YoutubeChannelsPage } from './pages/YoutubeChannelsPage';

export default function App() {
  return (
    <ToastProvider>
      <TaskQueueProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="mail-accounts" element={<MailAccountsPage />} />
              <Route path="youtube-channels" element={<YoutubeChannelsPage />} />
              <Route path="youtube-channels/:id" element={<YoutubeChannelDetailPage />} />
              <Route path="tiktok-accounts" element={<PlaceholderPage />} />
              <Route path="facebook-assets" element={<PlaceholderPage />} />
              <Route path="source-channels" element={<SourceChannelsPage />} />
              <Route path="source-channels/:id" element={<SourceChannelDetailPage />} />
              <Route path="prompts" element={<PromptsPage />} />
              <Route path="chrome-profiles" element={<ChromeProfilesPage />} />
              <Route path="gpm-manager" element={<GpmManagerPage />} />
              <Route path="proxies" element={<ProxiesPage />} />
              <Route path="launch-logs" element={<PlaceholderPage />} />
              <Route path="content-projects" element={<PlaceholderPage />} />
              <Route path="scripts" element={<PlaceholderPage />} />
              <Route path="datasets" element={<PlaceholderPage />} />
              <Route path="assets" element={<PlaceholderPage />} />
              <Route path="video-factory" element={<VideoFactoryPage />} />
              <Route path="video-factory/templates" element={<PlaceholderPage />} />
              <Route path="render-queue" element={<RenderQueuePage />} />
              <Route path="task-queue" element={<TaskQueuePage />} />
              <Route path="excel-import-export" element={<PlaceholderPage />} />
              <Route path="support" element={<PlaceholderPage />} />
              <Route path="logs" element={<PlaceholderPage />} />
              <Route path="workspace-settings" element={<PlaceholderPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TaskQueueProvider>
    </ToastProvider>
  );
}
