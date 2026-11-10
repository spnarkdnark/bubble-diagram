import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { totalArea } from '../../model/selectors';
import { formatArea, formatFeetInches } from '../../model/units';
import { Field, ReadOnly, Section, SelectField, TextField } from '../controls/Controls';

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
        <Field label="Total area">
          <ReadOnly value={formatArea(totalArea(doc))} />
        </Field>
      </Section>
      <Section title="Shortcuts">
        <dl className="shortcuts">
          <dt>V / B / C</dt><dd>Select / Bubble / Connect</dd>
          <dt>Scroll</dt><dd>Zoom (over selected bubble: resize {formatFeetInches(doc.settings.snap.radiusIncrementFt)})</dd>
          <dt>Space + drag</dt><dd>Pan (or middle mouse)</dd>
          <dt>Shift + click</dt><dd>Add to selection</dd>
          <dt>Arrows</dt><dd>Nudge 1′ (Shift 10′)</dd>
          <dt>Ctrl D / A</dt><dd>Duplicate / Select all</dd>
          <dt>Ctrl Z / ⇧Z</dt><dd>Undo / Redo</dd>
          <dt>F / Ctrl 0</dt><dd>Fit / 100% (true size)</dd>
          <dt>Del</dt><dd>Delete</dd>
        </dl>
      </Section>
    </>
  );
}

