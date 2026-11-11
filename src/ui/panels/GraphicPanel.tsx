import type { FillStyle, LabelFont, Paper } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { PRESETS } from '../../render/sketch';
import { PAPER_LABELS } from '../../render/paper';
import { LABEL_FONTS } from '../../render/scene';
import { Field, Section, SelectField, Slider } from '../controls/Controls';

export const PRESET_OPTIONS = [
  ...PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: 'custom', label: 'Custom' },
];

export function GraphicPanel() {
  const g = useDoc().settings.graphic;
  return (
    <Section
      title="Graphic standards"
      actions={
        <button className="btn ghost small" title="Same settings, different random strokes" onClick={A.redrawHand}>
          New hand
        </button>
      }
    >
      <p className="tip flush">Shared by every tab, like the category standards.</p>
      <Field label="Preset">
        <SelectField value={g.preset} options={PRESET_OPTIONS} onChange={(v) => v !== 'custom' && A.applyPreset(v)} />
      </Field>
      <Field label="Line wobble" hint="Circles drawn slightly out of round, like a hand would">
        <Slider min={0} max={1} step={0.05} value={g.wobble} onChange={(v) => A.tuneGraphic({ wobble: v })} />
      </Field>
      <Field label="Overshoot" hint="The stroke runs past where it closes, and past line ends">
        <Slider min={0} max={1} step={0.05} value={g.overshoot} onChange={(v) => A.tuneGraphic({ overshoot: v })} />
      </Field>
      <Field label="Passes" hint="Re-traced strokes">
        <Slider
          min={1}
          max={3}
          step={1}
          value={g.passes}
          format={(v) => String(v)}
          onChange={(v) => A.tuneGraphic({ passes: v })}
        />
      </Field>
      <Field label="Pressure" hint="Line weight swells and tapers">
        <Slider min={0} max={1} step={0.05} value={g.pressure} onChange={(v) => A.tuneGraphic({ pressure: v })} />
      </Field>
      <Field label="Fill">
        <SelectField<FillStyle>
          value={g.fillStyle}
          options={[
            { value: 'flat', label: 'Flat' },
            { value: 'wash', label: 'Watercolor wash' },
            { value: 'hatch', label: 'Marker hatch' },
            { value: 'pencil', label: 'Colored pencil' },
          ]}
          onChange={(v) => A.tuneGraphic({ fillStyle: v })}
        />
      </Field>
      <Field label="Fill offset" hint="Fill sits slightly off the outline">
        <Slider min={0} max={1} step={0.05} value={g.fillOffset} onChange={(v) => A.tuneGraphic({ fillOffset: v })} />
      </Field>
      <Field label="Paper">
        <SelectField<Paper>
          value={g.paper}
          options={(Object.keys(PAPER_LABELS) as Paper[]).map((p) => ({ value: p, label: PAPER_LABELS[p] }))}
          onChange={(v) => A.tuneGraphic({ paper: v })}
        />
      </Field>
      <Field label="Lettering">
        <SelectField<LabelFont>
          value={g.labelFont}
          options={(Object.keys(LABEL_FONTS) as LabelFont[]).map((f) => ({ value: f, label: LABEL_FONTS[f].label }))}
          onChange={(v) => A.setGraphic({ labelFont: v }, false)}
        />
      </Field>
      <p className="tip flush">Each category can scale this up or down with its Sketch amount.</p>
    </Section>
  );
}
