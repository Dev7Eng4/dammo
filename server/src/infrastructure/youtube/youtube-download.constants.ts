/** yt-dlp format selectors for YouTube video download (720p MP4 only). */
export const YOUTUBE_VIDEO_DOWNLOAD_FORMATS = ['bestvideo[height=720][ext=mp4][vcodec^=avc][fps=30]'] as const;

export const YOUTUBE_VIDEO_DOWNLOAD_FORMAT_LABELS = ['720p MP4 H.264 fps<=30', '720p MP4'] as const;
