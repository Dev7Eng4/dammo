export interface YoutubeVideoComment {
  id: string;
  text: string;
  author: string;
  authorThumbnail?: string;
  likeCount?: number;
  timestamp?: string;
  replies?: YoutubeVideoComment[];
}

export interface YtdlpCommentEntry {
  id?: string;
  text?: string;
  author?: string;
  author_thumbnail?: string;
  like_count?: number;
  timestamp?: number;
  _time_text?: string;
  parent?: string;
}

export interface YtdlpVideoWithCommentsResponse {
  comments?: YtdlpCommentEntry[];
}
