import { useEffect } from 'react';

interface Props {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, onDismiss, duration = 3000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="pointer-events-auto max-w-sm rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
        {message}
      </div>
    </div>
  );
}
