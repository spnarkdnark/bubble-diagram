import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { totalArea } from '../../model/selectors';
import { formatArea, formatLengthCompact } from '../../model/units';
import { Field, NumberField, ReadOnly, Section, SelectField, TextField } from '../controls/Controls';
import { findOverlaps, OVERLAP_MODE_LABELS } from '../../model/overlaps';
import { GraphicPanel } from './GraphicPanel';
import type { OverlapColor, OverlapMode, OverlapSettings } from '../../model/types';

const SNAP_OPTIONS = [
  { value: String(1 / 12), label: '1"' },
  { value: String(3 / 12), label: '3"' },
  { value: String(0.5), label: '6"' },
  { value: String(1), label: "1'-0\"" },
];

export function DrawingPanel() {
  const doc = useDoc();
  return (
    <>
      <Section title="Drawing">
        <Field label="Name">
          <TextField value={doc.meta.name} onChange={A.renameProject} />
        </Field>
        <Field label="Radius snap">
          <SelectField
            value={SNAP_OPTIONS.find((o) => Math.abs(parseFloat(o.value) - doc.settings.snap.radiusIncrementFt) < 1e-6)?.value ?? null}
            options={SNAP_OPTIONS}
            onChange={(v) => A.setSnapIncrement(parseFloat(v))}
          />
        </Field>
        <Field label="Bubbles">
          <ReadOnly value={String(doc.nodeOrder.length)} />
        </Field>
        <Field label="Connections">
          <ReadOnly value={String(Object.keys(doc.connections).length)} />
        </Field>
        <Field label="Overlaps" hint="Overlapping bubbles count as direct relationships">
          <ReadOnly value={`${findOverlaps(doc).length} direct`} />
        </Field>
        <Field label="Total area">
          <ReadOnly value={formatArea(totalArea(doc))} />
        </Field>
      </Section>
      <GraphicPanel />
      <Section title="Overlaps">
        <Field label="Treatment">
          <SelectField<OverlapMode>
            value={doc.settings.overlap.mode}
            options={(Object.keys(OVERLAP_MODE_LABELS) as OverlapMode[]).map((m) => ({ value: m, label: OVERLAP_MODE_LABELS[m] }))}
            onChange={(v) => A.setOverlapSettings({ mode: v })}
          />
        </Field>
        <Field label="Line weight">
          <NumberField
            value={doc.settings.overlap.weightPt}
            format={(v) => `${+v.toFixed(2)} pt`}
            parse={(s) => (Number.isFinite(parseFloat(s)) ? parseFloat(s) : null)}
            step={0.25}
            min={0.25}
            max={12}
            onCommit={(v) => A.setOverlapSettings({ weightPt: v })}
          />
        </Field>
        <Field label="Line color">
          <SelectField<OverlapColor>
            value={doc.settings.overlap.color}
            options={[
              { value: 'largest', label: 'Larger bubble' },
              { value: 'blend', label: 'Blend of both' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => A.setOverlapSettings({ color: v })}
          />
        </Field>
        {doc.settings.overlap.mode === 'merge' && (
          <Field label="Inner arcs">
            <SelectField<OverlapSettings['innerArcs']>
              value={doc.settings.overlap.innerArcs}
              options={[
                { value: 'hidden', label: 'Hidden' },
                { value: 'thin', label: 'Thin line' },
                { value: 'dashed', label: 'Dashed' },
              ]}
              onChange={(v) => A.setOverlapSettings({ innerArcs: v })}
            />
          </Field>
        )}
        <p className="tip flush">Select a bubble to set individual overlaps, or click an overlap's ◇ marker.</p>
      </Section>
      <Section title="Shortcuts">
        <dl className="shortcuts">
          <dt>V / B / C</dt><dd>Select / Bubble / Connect</dd>
          <dt>Scroll</dt><dd>Zoom (over selected bubble: resize {formatLengthCompact(doc.settings.snap.radiusIncrementFt)})</dd>
          <dt>Space + drag</dt><dd>Pan (or middle mouse)</dd>
          <dt>Shift + click</dt><dd>Add to selection</dd>
          <dt>Arrows</dt><dd>Nudge 1′ (Shift 10′)</dd>
          <dt>Ctrl C / X / V</dt><dd>Copy / Cut / Paste at cursor</dd>
          <dt>Ctrl ⇧V</dt><dd>Paste style onto selection</dd>
          <dt>Ctrl D / A</dt><dd>Duplicate / Select all</dd>
          <dt>Ctrl Z / ⇧Z</dt><dd>Undo / Redo</dd>
          <dt>F / Ctrl 0</dt><dd>Fit / 100% (true size)</dd>
          <dt>Del</dt><dd>Delete</dd>
        </dl>
      </Section>
    </>
  );
}

