import type { Id, LabelSecondary, StrokeStyle } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { resolveFill, resolveStroke, totalArea } from '../../model/selectors';
import { shapeArea, shapeSize } from '../../model/geometry';
import { MIN_RADIUS_FT } from '../../model/defaults';
import { formatArea, formatFeetInches, formatLengthCompact, parseLength } from '../../model/units';
import { Checkbox, ColorField, common, Field, NumberField, ReadOnly, Section, SelectField, Slider, TextField } from '../controls/Controls';

const fmtPt = (v: number) => `${+v.toFixed(2)} pt`;
const parsePt = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

export function BubbleProps({ ids }: { ids: Id[] }) {
  const doc = useDoc();
  const nodes = ids.map((id) => doc.nodes[id]).filter(Boolean);
  if (nodes.length === 0) return null;
  const single = nodes.length === 1;
  const upd = A.updateNodes;

  const radius = common(nodes, (n) => shapeSize(n.shape));
  const followCat = common(nodes, (n) => n.style.fill === null);
  const autoStroke = common(nodes, (n) => n.style.stroke === null);

  return (
    <>
      <Section title={single ? 'Bubble' : `${nodes.length} bubbles`}>
        <Field label="Name">
          <TextField value={common(nodes, (n) => n.name)} onChange={(v) => upd(ids, (n) => void (n.name = v), 'name')} />
        </Field>
        <Field label="Category">
          <SelectField
            value={common(nodes, (n) => n.categoryId ?? '__none')}
            options={[
              { value: '__none', label: 'None' },
              ...doc.categoryOrder.map((id) => ({ value: id, label: doc.categories[id].name })),
            ]}
            onChange={(v) => upd(ids, (n) => void (n.categoryId = v === '__none' ? null : v))}
          />
        </Field>
      </Section>

      <Section title="Size">
        <Field label="Radius" hint={`Type 12.5 or 12'-6"`}>
          <NumberField
            value={radius}
            format={formatFeetInches}
            parse={(s) => parseLength(s)}
            step={doc.settings.snap.radiusIncrementFt}
            min={MIN_RADIUS_FT}
            onCommit={(v) => A.setRadius(ids, v)}
          />
        </Field>
        <Field label="Diameter">
          <ReadOnly value={radius === null ? '—' : formatFeetInches(radius * 2)} />
        </Field>
        <Field label={single ? 'Area' : 'Total area'}>
          <ReadOnly value={single ? formatArea(shapeArea(nodes[0].shape)) : formatArea(totalArea(doc, ids))} />
        </Field>
      </Section>

      <Section title="Fill">
        <Checkbox
          label="Follow category color"
          checked={followCat}
          onChange={(v) =>
            upd(ids, (n) => {
              n.style.fill = v ? null : resolveFill(n as any, doc);
            })
          }
        />
        <Field label="Color">
          <ColorField
            value={common(nodes, (n) => resolveFill(n, doc))}
            onChange={(c) => upd(ids, (n) => void (n.style.fill = c), 'fill')}
          />
        </Field>
        <Field label="Opacity">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={common(nodes, (n) => n.style.fillOpacity)}
            onChange={(v) => upd(ids, (n) => void (n.style.fillOpacity = v), 'opacity')}
          />
        </Field>
      </Section>

      <Section title="Outline">
        <Checkbox
          label="Auto color (darker fill)"
          checked={autoStroke}
          onChange={(v) =>
            upd(ids, (n) => {
              n.style.stroke = v ? null : resolveStroke(n as any, doc);
            })
          }
        />
        <Field label="Color">
          <ColorField
            value={common(nodes, (n) => resolveStroke(n, doc))}
            onChange={(c) => upd(ids, (n) => void (n.style.stroke = c), 'stroke')}
          />
        </Field>
        <Field label="Weight">
          <NumberField
            value={common(nodes, (n) => n.style.strokeWeightPt)}
            format={fmtPt}
            parse={parsePt}
            step={0.25}
            min={0}
            max={12}
            onCommit={(v) => upd(ids, (n) => void (n.style.strokeWeightPt = v))}
          />
        </Field>
        <Field label="Style">
          <SelectField<StrokeStyle>
            value={common(nodes, (n) => n.style.strokeStyle)}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
            ]}
            onChange={(v) => upd(ids, (n) => void (n.style.strokeStyle = v))}
          />
        </Field>
      </Section>

      <Section title="Label">
        <Field label="Font size">
          <NumberField
            value={common(nodes, (n) => n.label.fontSizePt)}
            format={fmtPt}
            parse={parsePt}
            step={1}
            min={3}
            max={72}
            onCommit={(v) => upd(ids, (n) => void (n.label.fontSizePt = v))}
          />
        </Field>
        <Field label="Show below">
          <SelectField<LabelSecondary>
            value={common(nodes, (n) => n.label.secondary)}
            options={[
              { value: 'none', label: 'Name only' },
              { value: 'radius', label: 'Radius' },
              { value: 'area', label: 'Area' },
            ]}
            onChange={(v) => upd(ids, (n) => void (n.label.secondary = v))}
          />
        </Field>
      </Section>

      <div className="button-row">
        <button className="btn" onClick={A.duplicateSelection}>Duplicate</button>
        <button className="btn" onClick={() => A.bringToFront(ids)}>To front</button>
        <button className="btn danger" onClick={A.deleteSelection}>Delete</button>
      </div>
      <p className="tip">
        Tip: scroll over a selected bubble to resize ±{formatLengthCompact(doc.settings.snap.radiusIncrementFt)} (Shift: ±1").
      </p>
    </>
  );
}
