import { useEffect, useRef, useState } from 'react';
import { useUi } from '../store/uiStore';
import { importCsv, newProject, openProject, saveProject } from '../io/fileActions';

export interface MenuItem {
  label: string;
  kbd?: string;
  onClick: () => void;
  separator?: boolean;
}

export function Menu({ label, items, primary }: { label: string; items: MenuItem[]; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={`btn ${primary ? 'primary' : ''}`} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it, i) => (
            <div key={i}>
              {it.separator && <div className="menu-sep" />}
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
              >
                <span>{it.label}</span>
                {it.kbd && <span className="kbd">{it.kbd}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FileMenu() {
  return (
    <div className="group">
      <Menu
        label="File"
        items={[
          { label: 'New diagram', onClick: newProject },
          { label: 'Open…', kbd: 'Ctrl O', onClick: openProject },
          { label: 'Save', kbd: 'Ctrl S', onClick: saveProject },
          { label: 'Import CSV…', onClick: importCsv, separator: true },
        ]}
      />
      <button className="btn primary" onClick={() => useUi.getState().setExportOpen(true)}>
        Export
      </button>
    </div>
  );
}
