import type { YoutubeChannelVideo } from '../../infrastructure/youtube/youtube-channel.types.js';
import type { VideoPrepareItem } from './video-prepare.types.js';

function prepareItemToVideo(item: VideoPrepareItem): YoutubeChannelVideo {
  return {
    id: item.videoId,
    title: item.title,
    url: `https://www.youtube.com/watch?v=${item.videoId}`,
    status: item.status,
  };
}

export function mergeChannelVideos(
  published: YoutubeChannelVideo[],
  prepare: VideoPrepareItem[],
  uploadedFromFolder: YoutubeChannelVideo[] = [],
): YoutubeChannelVideo[] {
  const publishedIds = new Set(published.map(video => video.id));
  const uploadedFolderIds = new Set(uploadedFromFolder.map(video => video.id));

  const publishedWithStatus = published.map(video => ({
    ...video,
    status: 'Published' as const,
    ...(uploadedFolderIds.has(video.id) ? { localFolder: 'uploads' as const } : {}),
  }));

  const uploadedOnly = uploadedFromFolder
    .filter(video => !publishedIds.has(video.id))
    .map(video => ({
      ...video,
      status: 'Published' as const,
      localFolder: 'uploads' as const,
    }));

  const prepareVideos = prepare
    .filter(item => item.status !== 'Uploaded')
    .map(prepareItemToVideo);

  const draftVideos = prepareVideos.filter(video => video.status === 'Error');
  const preparedVideos = prepareVideos.filter(video => video.status === 'Prepared');
  const createdVideos = prepareVideos.filter(video => video.status === 'Created');

  const publishedInUploads = publishedWithStatus.filter(video => video.localFolder === 'uploads');
  const publishedRemoteOnly = publishedWithStatus.filter(video => video.localFolder !== 'uploads');

  return [
    ...draftVideos,
    ...preparedVideos,
    ...createdVideos,
    ...publishedInUploads,
    ...uploadedOnly,
    ...publishedRemoteOnly,
  ];
}
