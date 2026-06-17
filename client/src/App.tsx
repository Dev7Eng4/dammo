import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { ChromeProfilesPage } from './pages/ChromeProfilesPage';
import { DashboardPage } from './pages/DashboardPage';
import { MailAccountsPage } from './pages/MailAccountsPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { RenderQueuePage } from './pages/RenderQueuePage';
import { SourceChannelDetailPage } from './pages/SourceChannelDetailPage';
import { SourceChannelsPage } from './pages/SourceChannelsPage';
import { VideoFactoryPage } from './pages/VideoFactoryPage';
import { YoutubeChannelDetailPage } from './pages/YoutubeChannelDetailPage';
import { YoutubeChannelsPage } from './pages/YoutubeChannelsPage';

export default function App() {
  return (
    <ToastProvider>
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
            <Route path="chrome-profiles" element={<ChromeProfilesPage />} />
            <Route path="content-projects" element={<PlaceholderPage />} />
            <Route path="video-factory" element={<VideoFactoryPage />} />
            <Route path="render-queue" element={<RenderQueuePage />} />
            <Route path="excel-import-export" element={<PlaceholderPage />} />
            <Route path="workspace-settings" element={<PlaceholderPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
