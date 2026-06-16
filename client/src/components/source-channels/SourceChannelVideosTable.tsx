import type { SourceChannelVideo } from '../../types/sourceChannel';

interface SourceChannelVideosTableProps {
  videos: SourceChannelVideo[];
  loading?: boolean;
  error?: string | null;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatViews(count?: number): string {
  if (count === undefined) return '—';
  return count.toLocaleString();
}

function truncateLink(url: string, max = 32) {
  const display = url.replace('https://', '');
  if (display.length <= max) return display;
  return display.slice(0, max) + '...';
}

export function SourceChannelVideosTable({ videos, loading, error }: SourceChannelVideosTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">TITLE</th>
              <th className="pb-3 pr-4 font-medium">LINK</th>
              <th className="pb-3 pr-4 font-medium">VIEWS</th>
              <th className="pb-3 font-medium">DURATION</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={4} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No videos found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">TITLE</th>
            <th className="pb-3 pr-4 font-medium">LINK</th>
            <th className="pb-3 pr-4 font-medium">VIEWS</th>
            <th className="pb-3 font-medium">DURATION</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-neutral-100">{video.title}</td>
              <td className="py-3 pr-4 font-mono text-xs text-neutral-500">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-400 hover:underline"
                >
                  {truncateLink(video.url)}
                </a>
              </td>
              <td className="py-3 pr-4 text-neutral-300">{formatViews(video.viewCount)}</td>
              <td className="py-3 text-neutral-300">{formatDuration(video.duration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
