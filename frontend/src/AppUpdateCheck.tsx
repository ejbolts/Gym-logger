import type { UpdateCheckStatus } from './useAppUpdates';

export function AppUpdateCheck({
  available,
  status,
  onCheck,
}: {
  available: boolean;
  status: UpdateCheckStatus;
  onCheck: () => void;
}) {
  const message =
    status === 'error'
      ? 'Could not check for updates. Check your connection and try again.'
      : available
        ? 'An update is available. Use the refresh arrow above when you are ready.'
        : status === 'current'
          ? 'You are using the latest version.'
          : null;
  return (
    <div className="release-update-check">
      <button
        type="button"
        className="profile-secondary release-settings-action"
        disabled={status === 'checking'}
        onClick={onCheck}
      >
        {status === 'checking' ? 'Checking for updates…' : 'Check for updates'}
      </button>
      <p role="status">{message}</p>
    </div>
  );
}
