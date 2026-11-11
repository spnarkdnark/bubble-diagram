/** Drawing-wide settings and totals (shown when nothing is selected). */
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { totalArea } from '../../model/selectors';
import { isSizable } from '../../model/geometry';
import { findOverlaps } from '../../model/overlaps';
import { formatArea, formatFeetInches, parseLength } from '../../model/units';
import { Field, NumberField, ReadOnly, Section, SelectField, TextField } from '../controls/Controls';

const SNAP_OPTIONS = [
  { value: String(1 / 12), label: '1"' },
  { value: String(3 / 12), label: '3"' },
  { value: String(0.5), label: '6"' },
  { value: String(1), label: '1\'-0"' },
];

export function DrawingPanel() {
  const doc = useDoc();
  const nodes = Object.values(doc.nodes);
  const snap = SNAP_OPTIONS.find((o) => Math.abs(parseFloat(o.value) - doc.settings.snap.radiusIncrementFt) < 1e-6);
  return (
    <Section title="Drawing">
      <Field label="Name">
        <TextField value={doc.meta.name} onChange={A.renameProject} />
      </Field>
      <Field label="Size snap" hint="Resize step for a circle's radius or half a square's side (wheel and handle)">
        <SelectField
          value={snap?.value ?? null}
          options={SNAP_OPTIONS}
          onChange={(v) => A.setSnapIncrement(parseFloat(v))}
        />
      </Field>
      <Field label="Shape gap" hint="Default distance between new shapes and the bubbles they hug">
        <NumberField
          value={doc.settings.shapeGapFt}
          format={formatFeetInches}
          parse={parseLength}
          step={0.5}
          min={0}
          onCommit={A.setShapeGapDefault}
        />
      </Field>
      <Field label="Bubbles">
        <ReadOnly value={String(nodes.filter((n) => isSizable(n.shape)).length)} />
      </Field>
      <Field label="Shapes">
        <ReadOnly value={String(nodes.filter((n) => n.shape.kind === 'blob').length)} />
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
  );
}
