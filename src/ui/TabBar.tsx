import { useEffect, useRef, useState } from 'react';
import { useDoc } from '../store/documentStore';
import { closeTab, moveTab, newTab, renameTab, switchTab, tabName, useWorkspace } from '../store/workspaceStore';
import { useUi } from '../store/uiStore';
import { reopenClosedTab } from '../store/workspaceStore';

/** Browser-style tabs: one diagram per tab. */
export function TabBar() {
  const order = useWorkspace((s) => s.order);
  const activeId = useWorkspace((s) => s.activeId);
  useWorkspace((s) => s.parked); // re-render when a parked tab is renamed
  useDoc(); // re-render when the active tab's name changes
  const [editing, setEditing] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const close = (id: string) => {
    const name = tabName(id);
    closeTab(id);
    useUi.getState().showToast(`Closed “${name}”`, { label: 'Reopen', run: reopenClosedTab });
  };

  return (
    <nav className="tabbar" aria-label="Open diagrams">
      <div className="tabbar-mark" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="6" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><circle cx="11" cy="10" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
      </div>
      <div className="tabs" role="tablist" onDragOver={(e) => e.preventDefault()}>
        {order.map((id, i) => {
          const active = id === activeId;
          return (
            <div
              key={id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={`tab ${active ? 'active' : ''} ${dragId === id ? 'dragging' : ''} ${dropIndex === i && dragId !== id ? 'drop-before' : ''}`}
              title={tabName(id)}
              draggable={editing !== id}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  close(id);
                } else if (e.button === 0) switchTab(id);
              }}
              onDoubleClick={() => setEditing(id)}
              onDragStart={(e) => {
                setDragId(id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/x-tab', id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setDropIndex(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dropIndex !== null) {
                  const from = order.indexOf(dragId);
                  moveTab(dragId, dropIndex > from ? dropIndex - 1 : dropIndex);
                }
                setDragId(null);
                setDropIndex(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropIndex(null);
              }}
            >
              {editing === id ? (
                <TabNameInput
                  initial={tabName(id)}
                  onDone={(name) => {
                    if (name !== null && name.trim()) renameTab(id, name.trim());
                    setEditing(null);
                  }}
                />
              ) : (
                <span className="tab-name">{tabName(id)}</span>
              )}
              <button
                className="tab-close"
                title="Close tab"
                aria-label={`Close ${tabName(id)}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => close(id)}
              >
                ×
              </button>
            </div>
          );
        })}
        <button className="tab-new" title="New diagram" aria-label="New diagram" onClick={() => newTab()}>
          +
        </button>
      </div>
    </nav>
  );
}

function TabNameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      ref={ref}
      className="tab-input"
      value={v}
      aria-label="Diagram name"
      onChange={(e) => setV(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(v);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(v)}
    />
  );
}
