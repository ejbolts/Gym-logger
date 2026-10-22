import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function NotificationDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), 8000);
    return () => window.clearTimeout(timer);
  }, [message]);

  return createPortal(
    <aside className="app-notification-toast" role="status" aria-live="polite" aria-atomic="true">
      <p>{message}</p>
      <button
        type="button"
        className="icon-button"
        aria-label="Close notification"
        onClick={onClose}
      >
        ×
      </button>
    </aside>,
    document.body,
  );
}
