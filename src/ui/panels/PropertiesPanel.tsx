/** Right sidebar: properties of the selection, or drawing settings when nothing is selected. */
import { useUi } from '../../store/uiStore';
import { BubbleProps } from './BubbleProps';
import { CategoryPanel } from './CategoryPanel';
import { ConnectionProps } from './ConnectionProps';
import { DrawingPanel } from './DrawingPanel';
import { GraphicPanel } from './GraphicPanel';
import { NodeOverlaps, OverlapProps } from './OverlapProps';
import { OverlapSettingsPanel } from './OverlapSettingsPanel';
import { ShortcutsHelp } from './ShortcutsHelp';

export function PropertiesPanel() {
  const { nodes, connections, overlaps } = useUi((s) => s.selection);
  return (
    <aside className="sidebar">
      {nodes.length > 0 ? (
        <>
          <BubbleProps ids={nodes} />
          <NodeOverlaps ids={nodes} />
        </>
      ) : overlaps.length > 0 ? (
        <OverlapProps keys={overlaps} />
      ) : connections.length > 0 ? (
        <ConnectionProps ids={connections} />
      ) : (
        <>
          <DrawingPanel />
          <GraphicPanel />
          <OverlapSettingsPanel />
          <ShortcutsHelp />
        </>
      )}
      <CategoryPanel />
    </aside>
  );
}
