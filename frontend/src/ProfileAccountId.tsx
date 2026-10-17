import { useRef, useState } from 'react';

/** A stable account identifier that someone else can paste into people search. */
export function ProfileAccountId({ accountId }: { accountId: string }) {
  const value = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<{ id: string; message: string } | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(accountId);
      setStatus({ id: accountId, message: 'UUID copied.' });
    } catch {
      if (value.current) {
        const range = document.createRange();
        range.selectNodeContents(value.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus({ id: accountId, message: 'UUID selected. Use your device’s copy action.' });
    }
  }
  return (
    <div className="profile-account-id">
      <span className="profile-account-id-label">Account UUID</span>
      <div className="profile-account-id-row">
        <code ref={value}>{accountId}</code>
        <button type="button" className="text-link" onClick={() => void copy()}>
          Copy UUID
        </button>
      </div>
      <span className="profile-account-id-status" role="status">
        {status?.id === accountId ? status.message : ''}
      </span>
    </div>
  );
}
