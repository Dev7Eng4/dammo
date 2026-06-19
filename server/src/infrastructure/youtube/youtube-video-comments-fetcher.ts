import { youtubeDl } from 'youtube-dl-exec';
import { getYoutubeDlCommonOptions } from './youtube-dl-auth.js';
import type {
  YoutubeVideoComment,
  YtdlpCommentEntry,
  YtdlpVideoWithCommentsResponse,
} from './youtube-comment.types.js';

function buildVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function mapCommentEntry(entry: YtdlpCommentEntry): YoutubeVideoComment | null {
  const id = entry.id?.trim();
  const text = entry.text?.trim();
  if (!id || !text) return null;

  return {
    id,
    text,
    author: entry.author?.trim() || 'Anonymous',
    authorThumbnail: entry.author_thumbnail,
    likeCount: entry.like_count,
    timestamp: entry._time_text ?? (entry.timestamp != null ? String(entry.timestamp) : undefined),
  };
}

function sortByTimestamp(a: YoutubeVideoComment, b: YoutubeVideoComment): number {
  const ta = Number(a.timestamp);
  const tb = Number(b.timestamp);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

function sortCommentTree(comments: YoutubeVideoComment[]): void {
  comments.sort(sortByTimestamp);
  for (const comment of comments) {
    if (comment.replies?.length) {
      sortCommentTree(comment.replies);
    }
  }
}

function nestComments(flat: YtdlpCommentEntry[]): YoutubeVideoComment[] {
  const mapped = flat
    .map(mapCommentEntry)
    .filter((comment): comment is YoutubeVideoComment => comment !== null);

  const byId = new Map<string, YoutubeVideoComment>();
  for (const comment of mapped) {
    byId.set(comment.id, { ...comment, replies: [] });
  }

  const roots: YoutubeVideoComment[] = [];

  for (const entry of flat) {
    const id = entry.id?.trim();
    if (!id) continue;

    const comment = byId.get(id);
    if (!comment) continue;

    const parent = entry.parent ?? 'root';
    if (parent === 'root') {
      roots.push(comment);
      continue;
    }

    const parentComment = byId.get(parent);
    if (!parentComment) {
      roots.push(comment);
      continue;
    }

    parentComment.replies = parentComment.replies ?? [];
    parentComment.replies.push(comment);
  }

  for (const comment of byId.values()) {
    if (comment.replies?.length === 0) {
      delete comment.replies;
    }
  }

  sortCommentTree(roots);
  return roots;
}

export async function fetchYoutubeVideoComments(videoId: string): Promise<YoutubeVideoComment[]> {
  try {
    const raw = await youtubeDl(buildVideoUrl(videoId), {
      ...getYoutubeDlCommonOptions(),
      dumpSingleJson: true,
      skipDownload: true,
      noWarnings: true,
      getComments: true,
    } as Parameters<typeof youtubeDl>[1]);

    const data = raw as YtdlpVideoWithCommentsResponse;
    return nestComments(data.comments ?? []);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown yt-dlp error';
    throw new Error(message);
  }
}
