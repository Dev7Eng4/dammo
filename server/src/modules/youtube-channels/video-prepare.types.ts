export type VideoPrepareStatus = 'Prepared' | 'Created' | 'Uploaded' | 'Error';

export interface VideoPrepareItem {
  id: string;
  videoId: string;
  title: string;
  status: VideoPrepareStatus;
}
