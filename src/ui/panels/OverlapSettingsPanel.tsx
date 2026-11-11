/** Drawing-wide default for how overlapping bubbles are drawn. */
import type { OverlapColor, OverlapMode, OverlapSettings } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { OVERLAP_MODE_LABELS } from '../../model/overlaps';
import { formatPt, parsePt } from '../../model/units';
import { Field, NumberField, Section, SelectField } from '../controls/Controls';

const MODE_OPTIONS = (Object.keys(OVERLAP_MODE_LABELS) as OverlapMode[]).map((m) => ({
  value: m,
  label: OVERLAP_MODE_LABELS[m],
}));

export function OverlapSettingsPanel() {
  const ov = useDoc().settings.overlap;
  return (
    <Section title="Overlap standards">
      <p className="tip flush">Shared by every tab. Individual overlaps can still be changed by clicking their ◇.</p>
      <Field label="Treatment">
        <SelectField<OverlapMode>
          value={ov.mode}
          options={MODE_OPTIONS}
          onChange={(mode) => A.setOverlapSettings({ mode })}
        />
      </Field>
      <Field label="Line weight">
        <NumberField
          value={ov.weightPt}
          format={formatPt}
          parse={parsePt}
          step={0.25}
          min={0.25}
          max={12}
          onCommit={(weightPt) => A.setOverlapSettings({ weightPt })}
        />
      </Field>
      <Field label="Line color">
        <SelectField<OverlapColor>
          value={ov.color}
          options={[
            { value: 'largest', label: 'Larger bubble' },
            { value: 'blend', label: 'Blend of both' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(color) => A.setOverlapSettings({ color })}
        />
      </Field>
      <Field label="Inner arcs" hint="For merged outlines: how the arcs inside the merged shape are drawn">
        <SelectField<OverlapSettings['innerArcs']>
          value={ov.innerArcs}
          options={[
            { value: 'hidden', label: 'Hidden' },
            { value: 'thin', label: 'Thin line' },
            { value: 'dashed', label: 'Dashed' },
          ]}
          onChange={(innerArcs) => A.setOverlapSettings({ innerArcs })}
        />
      </Field>
      <p className="tip flush">Select a bubble to set individual overlaps, or click an overlap's ◇ marker.</p>
    </Section>
  );
}
