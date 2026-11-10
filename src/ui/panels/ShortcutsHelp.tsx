/** Keyboard and mouse reference. Keep in sync with hooks/useKeyboardShortcuts.ts and canvas/tools. */
import { useDoc } from '../../store/documentStore';
import { formatLengthCompact } from '../../model/units';
import { Section } from '../controls/Controls';

export function ShortcutsHelp() {
  const step = formatLengthCompact(useDoc().settings.snap.radiusIncrementFt);
  const rows: [string, string][] = [
    ['V / B / C / S', 'Select / Bubble / Connect / Shape'],
    ['Shape tool', 'Drag freehand or click points; double-click a gap to fill it'],
    ['Scroll', `Zoom (over selected bubble: resize ${step})`],
    ['Space + drag', 'Pan (or middle mouse)'],
    ['Shift + click', 'Add to selection'],
    ['Click name / area', 'Edit it in place (selected bubble; or double-click)'],
    ['Arrows', 'Nudge 1′ (Shift 10′)'],
    ['Ctrl C / X / V', 'Copy / Cut / Paste at cursor'],
    ['Ctrl ⇧V', 'Paste style onto selection'],
    ['Ctrl D / A', 'Duplicate / Select all'],
    ['Ctrl Z / ⇧Z', 'Undo / Redo'],
    ['F / Ctrl 0', 'Fit / 100% (true size)'],
    ['Del', 'Delete'],
  ];
  return (
    <Section title="Shortcuts">
      <dl className="shortcuts">
        {rows.map(([keys, what]) => (
          <div key={keys} className="shortcut-row">
            <dt>{keys}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
