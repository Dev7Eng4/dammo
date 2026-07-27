import { Button } from '../ui';

interface ChromeProfilesToolbarProps {
  count: number;
  loading?: boolean;
  opening?: boolean;
  settingMain?: boolean;
  resetting?: boolean;
  canOpen?: boolean;
  canSetMain?: boolean;
  onAddProfile: () => void;
  onOpenProfile: () => void;
  onSetMainProfile: () => void;
  onResetSubProfiles: () => void;
  onRefresh: () => void;
}

export function ChromeProfilesToolbar({
  count,
  loading,
  opening,
  settingMain,
  resetting,
  canOpen,
  canSetMain,
  onAddProfile,
  onOpenProfile,
  onSetMainProfile,
  onResetSubProfiles,
  onRefresh,
}: ChromeProfilesToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-neutral-400">{count.toLocaleString()} profile</span>

      <div className="flex items-center gap-2">
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onRefresh}
          disabled={loading}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          Làm mới
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onOpenProfile}
          disabled={!canOpen || opening || loading || resetting || settingMain}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
          {opening ? 'Đang mở…' : 'Mở'}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onSetMainProfile}
          disabled={!canSetMain || settingMain || loading || resetting || opening}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          {settingMain ? 'Đang đặt…' : 'Đặt làm chính'}
        </Button>
        <Button
          variant="outlined"
          size="sm"
          className="rounded-lg"
          onClick={onResetSubProfiles}
          disabled={loading || resetting || opening || settingMain}
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          {resetting ? 'Đang đặt lại…' : 'Đặt lại profile phụ'}
        </Button>
        <Button size="sm" className="rounded-lg" onClick={onAddProfile} disabled={resetting}>
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Thêm profile
        </Button>
      </div>
    </div>
  );
}
