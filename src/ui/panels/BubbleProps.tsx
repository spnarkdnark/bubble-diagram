import type { BubbleNode, Id, StyleKey, StyleProps } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { baseStyle, resolveStyle } from '../../model/selectors';
import { formatLengthCompact } from '../../model/units';
import { common, Field, Section, SelectField, TextField } from '../controls/Controls';
import { SizeFields } from './SizeFields';
import { StyleFields, type StyleSource } from './StyleFields';

export function BubbleProps({ ids }: { ids: Id[] }) {
  const doc = useDoc();
  const nodes = ids.map((id) => doc.nodes[id]).filter(Boolean);
  if (nodes.length === 0) return null;
  const single = nodes.length === 1;
  const resolved = nodes.map((n) => resolveStyle(n, doc));
  const blobs = nodes.filter((n) => n.shape.kind === 'blob');
  const anyOverrides = nodes.some((n) => Object.keys(n.style).length > 0);
  const catId = common(nodes, (n) => n.categoryId);

  /** What a field shows: the element's own override, else the inherited category value
   * (for the outline that means `null` = auto, not the resolved color). */
  const shown = <K extends StyleKey>(n: BubbleNode, k: K): StyleProps[K] =>
    n.style[k] !== undefined ? (n.style[k] as StyleProps[K]) : baseStyle(n, doc)[k];

  const src: StyleSource = {
    get: (k) => common(nodes, (n) => shown(n, k)),
    set: (k, v) => A.setNodeStyle(ids, k, v),
    strokeColor: common(resolved, (s) => s.stroke),
    override: (k) => {
      const flags = nodes.map((n) => n.style[k] !== undefined);
      return {
        on: flags.every(Boolean) ? true : flags.some(Boolean) ? null : false,
        reset: () => A.resetNodeStyle(ids, [k]),
      };
    },
  };

  return (
    <>
      <Section title={single ? (blobs.length ? 'Shape' : 'Bubble') : `${nodes.length} elements`}>
        <Field label="Name">
          <TextField
            value={common(nodes, (n) => n.name)}
            onChange={(v) => A.updateNodes(ids, (n) => void (n.name = v), 'name')}
          />
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

      <SizeFields doc={doc} nodes={nodes} />

      <StyleFields src={src} />

      {anyOverrides && (
        <div className="button-row">
          <button className="btn" title="Remove this bubble's own style settings" onClick={() => A.resetNodeStyle(ids)}>
            Reset to category
          </button>
          {single && catId && (
            <button
              className="btn"
              title="Apply this bubble's look to every bubble in its category"
              onClick={() => A.makeCategoryStyle(ids[0])}
            >
              Make category style
            </button>
          )}
        </div>
      )}
      <div className="button-row">
        <button className="btn" onClick={A.duplicateSelection}>
          Duplicate
        </button>
        <button className="btn" onClick={() => A.bringToFront(ids)}>
          To front
        </button>
        <button className="btn danger" onClick={A.deleteSelection}>
          Delete
        </button>
      </div>
      <p className="tip">
        {blobs.length > 0 ? (
          'Drag a point to move it; near a bubble it snaps on (Alt: no snapping). Double-click a point to delete it, or the edge to add one.'
        ) : (
          <>
            A dot next to a setting means it overrides the category. Scroll over a selected bubble to resize ±
            {formatLengthCompact(doc.settings.snap.radiusIncrementFt)} (Shift: ±1").
          </>
        )}
      </p>
    </>
  );
}
