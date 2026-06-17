import type { YoutubeChannelVideo } from '../../types/youtubeChannel';

interface YoutubeChannelVideosTableProps {
  videos: YoutubeChannelVideo[];
  loading?: boolean;
  error?: string | null;
  onCommentClick?: (video: YoutubeChannelVideo) => void;
}

function formatCount(count?: number | null): string {
  if (count == null) return '—';
  return count.toLocaleString();
}

function truncateLink(url: string, max = 44) {
  const display = url.replace('https://', '');
  if (display.length <= max) return display;
  return display.slice(0, max) + '...';
}

export function YoutubeChannelVideosTable({
  videos,
  loading,
  error,
  onCommentClick,
}: YoutubeChannelVideosTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">TITLE</th>
              <th className="min-w-52 pb-3 pr-4 font-medium">LINK</th>
              <th className="pb-3 pr-4 font-medium">VIEWS</th>
              <th className="pb-3 pr-4 font-medium">LIKES</th>
              <th className="pb-3 font-medium">COMMENTS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={5} className="py-3">
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
            <th className="min-w-52 pb-3 pr-4 font-medium">LINK</th>
            <th className="pb-3 pr-4 font-medium">VIEWS</th>
            <th className="pb-3 pr-4 font-medium">LIKES</th>
            <th className="pb-3 font-medium">COMMENTS</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-neutral-100">{video.title}</td>
              <td className="min-w-52 py-3 pr-4 font-mono text-xs text-neutral-500">
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-400 hover:underline"
                >
                  {truncateLink(video.url)}
                </a>
              </td>
              <td className="py-3 pr-4 text-neutral-300">{formatCount(video.viewCount)}</td>
              <td className="py-3 pr-4 text-neutral-300">{formatCount(video.likeCount)}</td>
              <td className="py-3 text-neutral-300">
                {video.commentCount != null && video.commentCount > 0 && onCommentClick ? (
                  <button
                    type="button"
                    onClick={() => onCommentClick(video)}
                    className="cursor-pointer text-secondary-400 hover:text-secondary-300 hover:underline"
                  >
                    {formatCount(video.commentCount)}
                  </button>
                ) : (
                  formatCount(video.commentCount)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
