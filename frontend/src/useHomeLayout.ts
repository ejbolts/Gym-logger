import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { defaultHomeLayout } from './homeLayout';
import { useUserSession } from './userContext';

export function useHomeLayout(active = true) {
  const { user } = useUserSession();
  const [layout, setLayout] = useState(defaultHomeLayout);
  const [loaded, setLoaded] = useState(!user);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(defaultHomeLayout);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const editButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) return;
    setEditing(false);
    setDraft(defaultHomeLayout());
    setError(null);
    setMessage('');
  }, [active]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoaded(false);
    setLoadError(false);
    void api
      .getHomeLayout()
      .then((saved) => {
        if (!cancelled) {
          setLayout(saved);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, attempt]);

  function finish() {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  }

  return {
    layout,
    loaded,
    loadError,
    editing,
    draft,
    saving,
    error,
    message,
    editButton,
    retry: () => setAttempt((value) => value + 1),
    edit: () => {
      setDraft({
        order: [...layout.order],
        hidden: [...layout.hidden],
        widths: { ...layout.widths },
      });
      setError(null);
      setMessage('');
      setEditing(true);
    },
    cancel: () => {
      setError(null);
      setMessage('Changes cancelled.');
      finish();
    },
    change: setDraft,
    save: async () => {
      setSaving(true);
      setError(null);
      try {
        const saved = await api.saveHomeLayout(draft);
        setLayout(saved);
        setMessage('Home layout saved.');
        finish();
      } catch {
        setError('Could not save your layout. Your changes are still here. Try Save layout again.');
      } finally {
        setSaving(false);
      }
    },
  };
}
