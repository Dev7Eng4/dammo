export interface YoutubeChannelMetadata {
  name: string;
  handle: string;
  niche: string;
  channelId?: string;
  description?: string;
  videoCount?: number;
  subscriberCount?: number;
  thumbnailUrl?: string;
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
  status?: YoutubeChannelVideoStatus;
  localFolder?: 'uploads';
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
  categories?: string[];
  entries?: YtdlpVideoEntry[];
}
