import type { Id, StyleKey } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { resolveStyle, totalArea } from '../../model/selectors';
import { nodeArea, shapeSize } from '../../model/geometry';
import { MIN_RADIUS_FT } from '../../model/defaults';
import { formatArea, formatFeetInches, formatLengthCompact, parseLength } from '../../model/units';
import { common, Field, NumberField, ReadOnly, Section, SelectField, TextField } from '../controls/Controls';
import { StyleFields, type StyleSource } from './StyleFields';

export function BubbleProps({ ids }: { ids: Id[] }) {
  const doc = useDoc();
  const nodes = ids.map((id) => doc.nodes[id]).filter(Boolean);
  if (nodes.length === 0) return null;
  const single = nodes.length === 1;
  const resolved = nodes.map((n) => resolveStyle(n, doc));
  const radius = common(nodes, (n) => shapeSize(n.shape));
  const anyOverrides = nodes.some((n) => Object.keys(n.style).length > 0);
  const catId = common(nodes, (n) => n.categoryId);

  const src: StyleSource = {
    get: <K extends StyleKey>(k: K) => common(nodes, (n) => (n.style[k] !== undefined ? n.style[k] : resolveStyle(n, doc)[k])) as any,
    set: (k, v) => A.setNodeStyle(ids, k, v),
    strokeColor: common(resolved, (s) => s.stroke),
    override: (k) => {
      const flags = nodes.map((n) => n.style[k] !== undefined);
      return { on: flags.every(Boolean) ? true : flags.some(Boolean) ? null : false, reset: () => A.resetNodeStyle(ids, [k]) };
    },
  };
  // for the auto-outline checkbox, "get('stroke')" must reflect the resolved (possibly inherited) choice
  const getRaw = src.get;
  src.get = ((k: StyleKey) =>
    k === 'stroke'
      ? common(nodes, (n) => (n.style.stroke !== undefined ? n.style.stroke : (doc.categories[n.categoryId ?? '']?.style ?? doc.settings.defaultStyle).stroke))
      : getRaw(k)) as StyleSource['get'];

  return (
    <>
      <Section title={single ? 'Bubble' : `${nodes.length} bubbles`}>
        <Field label="Name">
          <TextField value={common(nodes, (n) => n.name)} onChange={(v) => A.updateNodes(ids, (n) => void (n.name = v), 'name')} />
        </Field>
        <Field label="Category">
          <SelectField
            value={common(nodes, (n) => n.categoryId ?? '__none')}
            options={[
              { value: '__none', label: 'None' },
              ...doc.categoryOrder.map((id) => ({ value: id, label: doc.categories[id].name })),
            ]}
            onChange={(v) => A.updateNodes(ids, (n) => void (n.categoryId = v === '__none' ? null : v))}
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
          <ReadOnly value={single ? formatArea(nodeArea(nodes[0], doc)) : formatArea(totalArea(doc, ids))} />
        </Field>
      </Section>

      <StyleFields src={src} />

      {anyOverrides && (
        <div className="button-row">
          <button className="btn" title="Remove this bubble's own style settings" onClick={() => A.resetNodeStyle(ids)}>
            Reset to category
          </button>
          {single && catId && (
            <button className="btn" title="Apply this bubble's look to every bubble in its category" onClick={() => A.makeCategoryStyle(ids[0])}>
              Make category style
            </button>
          )}
        </div>
      )}
      <div className="button-row">
        <button className="btn" onClick={A.duplicateSelection}>Duplicate</button>
        <button className="btn" onClick={() => A.bringToFront(ids)}>To front</button>
        <button className="btn danger" onClick={A.deleteSelection}>Delete</button>
      </div>
      <p className="tip">
        A dot next to a setting means it overrides the category. Scroll over a selected bubble to resize ±
        {formatLengthCompact(doc.settings.snap.radiusIncrementFt)} (Shift: ±1").
      </p>
    </>
  );
}
