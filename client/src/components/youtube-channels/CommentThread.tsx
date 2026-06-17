import { useState } from 'react';
import type { YoutubeVideoComment } from '../../types/youtubeChannel';

interface CommentThreadProps {
  comment: YoutubeVideoComment;
  depth?: number;
}

function countReplies(comment: YoutubeVideoComment): number {
  if (!comment.replies?.length) return 0;
  return comment.replies.reduce((total, reply) => total + 1 + countReplies(reply), 0);
}

function CommentAvatar({ name, thumbnail }: { name: string; thumbnail?: string }) {
  const initial = name.charAt(0).toUpperCase();

  if (thumbnail) {
    return (
      <img
        src={thumbnail}
        alt=""
        className="size-8 shrink-0 rounded-full bg-surface-elevated object-cover"
      />
    );
  }

  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-neutral-400">
      {initial}
    </div>
  );
}

function CommentBody({ comment }: { comment: YoutubeVideoComment }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-neutral-100">{comment.author}</span>
        {comment.timestamp ? (
          <span className="text-xs text-neutral-500">{comment.timestamp}</span>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{comment.text}</p>
      {comment.likeCount != null && comment.likeCount > 0 ? (
        <p className="mt-1.5 text-xs text-neutral-500">{comment.likeCount.toLocaleString()} likes</p>
      ) : null}
    </div>
  );
}

export function CommentThread({ comment, depth = 0 }: CommentThreadProps) {
  const [showReplies, setShowReplies] = useState(false);
  const replyCount = countReplies(comment);
  const hasReplies = replyCount > 0;

  return (
    <div className={depth > 0 ? 'mt-3' : ''}>
      <div className="flex gap-3">
        <CommentAvatar name={comment.author} thumbnail={comment.authorThumbnail} />
        <CommentBody comment={comment} />
      </div>

      {hasReplies ? (
        <div className="mt-2 ml-11">
          <button
            type="button"
            onClick={() => setShowReplies((open) => !open)}
            className="text-xs font-medium text-secondary-400 hover:text-secondary-300"
          >
            {showReplies ? 'Ẩn phản hồi' : `Xem ${replyCount.toLocaleString()} phản hồi`}
          </button>

          {showReplies ? (
            <div className="mt-2 border-l border-border pl-4">
              {comment.replies?.map((reply) => (
                <CommentThread key={reply.id} comment={reply} depth={depth + 1} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
