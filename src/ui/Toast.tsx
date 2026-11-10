import { useEffect, useState } from 'react';
import { useUi } from '../store/uiStore';

export function Toast() {
  const toast = useUi((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), toast.action ? 7000 : 3200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className="toast" role="status">
      {toast.message}
      {toast.action && (
        <button
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            setVisible(false);
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
