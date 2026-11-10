import type { LabelSecondary, StrokeStyle, StyleKey, StyleProps } from '../../model/types';
import { Checkbox, ColorField, Field, NumberField, Section, SelectField, Slider, type OverrideMark } from '../controls/Controls';

const fmtPt = (v: number) => `${+v.toFixed(2)} pt`;
const parsePt = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

export interface StyleSource {
  /** shared value across the edited items, or null when mixed */
  get: <K extends StyleKey>(k: K) => StyleProps[K] | null;
  set: <K extends StyleKey>(k: K, v: StyleProps[K]) => void;
  /** displayed outline color (auto resolved), null when mixed */
  strokeColor: string | null;
  /** present only when editing elements that inherit from a category */
  override?: (k: StyleKey) => OverrideMark;
}

/** Every visual property of a bubble. Used for elements, categories and the default style. */
export function StyleFields({ src, compact }: { src: StyleSource; compact?: boolean }) {
  const o = src.override;
  const stroke = src.get('stroke');
  const auto = stroke === null ? (src.strokeColor === null ? null : true) : false;
  const Wrap = compact ? CompactGroup : Section;

  return (
    <>
      <Wrap title="Fill">
        <Field label="Color" override={o?.('fill')}>
          <ColorField value={src.get('fill')} onChange={(c) => src.set('fill', c)} />
        </Field>
        <Field label="Opacity" override={o?.('fillOpacity')}>
          <Slider min={0} max={1} step={0.05} value={src.get('fillOpacity')} onChange={(v) => src.set('fillOpacity', v)} />
        </Field>
      </Wrap>

      <Wrap title="Outline">
        <Field label="Color" override={o?.('stroke')}>
          <span className="stack">
            <Checkbox label="Auto (darker fill)" checked={auto} onChange={(v) => src.set('stroke', v ? null : src.strokeColor ?? '#666666')} />
            {auto === false && <ColorField value={src.strokeColor} onChange={(c) => src.set('stroke', c)} />}
          </span>
        </Field>
        <Field label="Weight" override={o?.('strokeWeightPt')}>
          <NumberField
            value={src.get('strokeWeightPt')}
            format={fmtPt}
            parse={parsePt}
            step={0.25}
            min={0}
            max={12}
            onCommit={(v) => src.set('strokeWeightPt', v)}
          />
        </Field>
        <Field label="Style" override={o?.('strokeStyle')}>
          <SelectField<StrokeStyle>
            value={src.get('strokeStyle')}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
            onChange={(v) => src.set('strokeStyle', v)}
          />
        </Field>
      </Wrap>

      <Wrap title="Label">
        <Field label="Size" override={o?.('labelSizePt')}>
          <NumberField
            value={src.get('labelSizePt')}
            format={fmtPt}
            parse={parsePt}
            step={1}
            min={3}
            max={72}
            onCommit={(v) => src.set('labelSizePt', v)}
          />
        </Field>
        <Field label="Color" override={o?.('labelColor')}>
          <ColorField value={src.get('labelColor')} onChange={(c) => src.set('labelColor', c)} />
        </Field>
        <Field label="Weight" override={o?.('labelBold')}>
          <SelectField<'bold' | 'regular'>
            value={src.get('labelBold') === null ? null : src.get('labelBold') ? 'bold' : 'regular'}
            options={[
              { value: 'bold', label: 'Bold' },
              { value: 'regular', label: 'Regular' },
            ]}
            onChange={(v) => src.set('labelBold', v === 'bold')}
          />
        </Field>
        <Field label="Show below" override={o?.('labelSecondary')}>
          <SelectField<LabelSecondary>
            value={src.get('labelSecondary')}
            options={[
              { value: 'none', label: 'Name only' },
              { value: 'radius', label: 'Radius' },
              { value: 'area', label: 'Area' },
            ]}
            onChange={(v) => src.set('labelSecondary', v)}
          />
        </Field>
      </Wrap>

      <Wrap title="Sketch">
        <Field label="Amount" hint="Multiplies the drawing's sketch character. 0% draws this cleanly." override={o?.('sketchAmount')}>
          <Slider min={0} max={2} step={0.1} value={src.get('sketchAmount')} onChange={(v) => src.set('sketchAmount', v)} />
        </Field>
      </Wrap>
    </>
  );
}

function CompactGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="compact-group">
      <h4>{title}</h4>
      {children}
    </div>
  );
}
