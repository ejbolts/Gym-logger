import { useEffect, useId, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useSheetDismiss } from './useSheetDismiss';

export function PopupDialog({
  title,
  kicker,
  className = '',
  closeLabel,
  style,
  swipeToDismiss = false,
  onClose,
  children,
}: {
  title: string;
  kicker?: string;
  className?: string;
  closeLabel?: string;
  style?: CSSProperties;
  swipeToDismiss?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useSheetDismiss(dialogRef, swipeToDismiss, onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`popup-dialog ${className}`.trim()}
      style={style}
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header>
        <div>
          {kicker && <p className="section-kicker">{kicker}</p>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button
          type="button"
          className="popup-dialog-close"
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          {closeLabel ?? '×'}
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
