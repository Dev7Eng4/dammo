import { useState } from 'react';
import { isAbortError } from '../../api/http';
import { fetchYoutubeVideoComments } from '../../api/youtubeChannels';
import { Drawer } from '../ui';
import { CommentThread } from './CommentThread';
import { useAbortableEffect } from '../../hooks';
import type { YoutubeChannelVideo, YoutubeVideoComment } from '../../types/youtubeChannel';

interface VideoCommentsDrawerProps {
  open: boolean;
  channelId: string;
  video: YoutubeChannelVideo | null;
  onClose: () => void;
}

function countAllComments(comments: YoutubeVideoComment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + (comment.replies ? countAllComments(comment.replies) : 0),
    0,
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="size-8 shrink-0 rounded-full bg-neutral-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-neutral-800" />
            <div className="h-4 w-full rounded bg-neutral-800" />
            <div className="h-4 w-3/4 rounded bg-neutral-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VideoCommentsDrawer({ open, channelId, video, onClose }: VideoCommentsDrawerProps) {
  const [comments, setComments] = useState<YoutubeVideoComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useAbortableEffect(
    async (signal) => {
      if (!video) return;

      setLoading(true);
      setError(null);
      setComments([]);

      try {
        const data = await fetchYoutubeVideoComments(channelId, video.id, { signal });
        setComments(data.items);
      } catch (err) {
        if (isAbortError(err)) return;
        setComments([]);
        setError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [channelId, video?.id],
    { enabled: open && Boolean(video) },
  );

  if (!video) return null;

  const totalComments = countAllComments(comments);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Comments"
      subtitle={video.title}
    >
      <div className="p-4">
        {!loading && !error ? (
          <p className="mb-4 text-xs text-neutral-500">
            {totalComments > 0
              ? `${totalComments.toLocaleString()} comments`
              : 'No comments on this video'}
          </p>
        ) : null}

        {loading ? <CommentsSkeleton /> : null}

        {error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-danger">{error}</p>
          </div>
        ) : null}

        {!loading && !error && comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-neutral-400">No comments found.</p>
          </div>
        ) : null}

        {!loading && !error && comments.length > 0 ? (
          <div className="space-y-5">
            {comments.map((comment) => (
              <CommentThread key={comment.id} comment={comment} />
            ))}
          </div>
        ) : null}
      </div>
    </Drawer>
  );
}
