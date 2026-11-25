/**
 * `Preparing`: a remake channel's video started from a script the skill wrote ahead (remake-ready/): its folder
 * has the script and the source transcript, and the user finishes voice, scenes, title and thumbnail in the
 * production tabs. It becomes `Prepared` once all of those exist.
 */
export type VideoPrepareStatus = 'Preparing' | 'Prepared' | 'Created' | 'Uploaded' | 'Error';

export interface VideoPrepareItem {
  id: string;
  videoId: string;
  title: string;
  status: VideoPrepareStatus;
}
