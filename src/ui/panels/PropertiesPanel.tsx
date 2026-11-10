import { useUi } from '../../store/uiStore';
import { BubbleProps } from './BubbleProps';
import { CategoryPanel } from './CategoryPanel';
import { ConnectionProps } from './ConnectionProps';
import { DrawingPanel } from './DrawingPanel';

export function PropertiesPanel() {
  const sel = useUi((s) => s.selection);
  return (
    <aside className="sidebar">
      {sel.nodes.length > 0 && <BubbleProps ids={sel.nodes} />}
      {sel.nodes.length === 0 && sel.connections.length > 0 && <ConnectionProps ids={sel.connections} />}
      {sel.nodes.length === 0 && sel.connections.length === 0 && <DrawingPanel />}
      <CategoryPanel />
    </aside>
  );
}
