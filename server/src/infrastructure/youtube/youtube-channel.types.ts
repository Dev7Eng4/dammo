export interface YoutubeChannelMetadata {
  name: string;
  handle: string;
  niche: string;
  channelId?: string;
  description?: string;
  videoCount?: number;
  subscriberCount?: number;
  thumbnailUrl?: string;
  /** Channel avatar (square) URL taken from yt-dlp's thumbnails. */
  avatarUrl?: string;
  categories?: string[];
}

export type YoutubeChannelVideoStatus = 'Published' | 'Prepared' | 'Created' | 'Uploaded' | 'Error' | 'Pending';

export interface YoutubeChannelVideo {
  id: string;
  title: string;
  url: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: number;
  /** ISO timestamp of publication when YouTube reports it (approximate for older videos). */
  publishedAt?: string;
  status?: YoutubeChannelVideoStatus;
  localFolder?: 'uploads';
  /** Prepared/Created video whose title or thumbnail is missing locally. */
  missingTitleOrThumbnail?: boolean;
}

export interface YtdlpVideoEntry {
  id?: string;
  title?: string;
  webpage_url?: string;
  url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  duration?: number;
  /** YYYYMMDD; only present with the `youtubetab:approximate_date` extractor arg in flat mode. */
  upload_date?: string;
  /** Unix seconds. */
  timestamp?: number;
  release_timestamp?: number;
}

export interface YtdlpChannelThumbnail {
  id?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface YtdlpChannelResponse {
  id?: string;
  title?: string;
  channel?: string;
  channel_id?: string;
  channel_url?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  description?: string;
  playlist_count?: number;
  channel_follower_count?: number;
  thumbnail?: string;
  thumbnails?: YtdlpChannelThumbnail[];
  categories?: string[];
  entries?: YtdlpVideoEntry[];
}
