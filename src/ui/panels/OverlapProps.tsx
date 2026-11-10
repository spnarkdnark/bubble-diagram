import type { OverlapMode } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { findOverlaps, OVERLAP_MODE_LABELS } from '../../model/overlaps';
import { Section, SelectField } from '../controls/Controls';

const MODES = Object.keys(OVERLAP_MODE_LABELS) as OverlapMode[];
const DEFAULT = '__default';

/** Mode picker for overlaps: "Drawing default" or an explicit override. */
export function OverlapModeSelect({ keys }: { keys: string[] }) {
  const doc = useDoc();
  const vals = keys.map((k) => doc.overlaps[k]?.mode ?? DEFAULT);
  const value = vals.every((v) => v === vals[0]) ? vals[0] : null;
  return (
    <SelectField<string>
      value={value}
      options={[
        { value: DEFAULT, label: `Default (${OVERLAP_MODE_LABELS[doc.settings.overlap.mode]})` },
        ...MODES.map((m) => ({ value: m, label: OVERLAP_MODE_LABELS[m] })),
      ]}
      onChange={(v) => A.setOverlapMode(keys, v === DEFAULT ? null : (v as OverlapMode))}
    />
  );
}

export function OverlapProps({ keys }: { keys: string[] }) {
  const doc = useDoc();
  const live = new Set(findOverlaps(doc).map((o) => o.key));
  const names = (k: string) =>
    k
      .split('|')
      .map((id) => doc.nodes[id]?.name ?? '?')
      .join(' ↔ ');
  return (
    <Section title={keys.length === 1 ? 'Overlap' : `${keys.length} overlaps`}>
      {keys.map((k) => (
        <p key={k} className="muted small">
          {names(k)}
          {!live.has(k) && ' (no longer overlapping)'}
        </p>
      ))}
      <OverlapModeSelect keys={keys} />
      <p className="tip flush">
        Overlapping bubbles read as spaces with a direct relationship. Pick how this one is drawn, or leave it on the
        drawing default.
      </p>
    </Section>
  );
}

/** Overlaps involving the selected bubbles, each with its own mode picker. */
export function NodeOverlaps({ ids }: { ids: string[] }) {
  const doc = useDoc();
  const set = new Set(ids);
  const list = findOverlaps(doc).filter((o) => set.has(o.a) || set.has(o.b));
  if (list.length === 0) return null;
  return (
    <Section title={`Overlaps (${list.length})`}>
      {list.map((o) => {
        const other = set.has(o.a) && !set.has(o.b) ? o.b : set.has(o.b) && !set.has(o.a) ? o.a : null;
        const label = other ? doc.nodes[other].name : `${doc.nodes[o.a].name} ↔ ${doc.nodes[o.b].name}`;
        return (
          <div key={o.key} className="field">
            <span className="field-label ellipsis" title={label}>
              {label}
            </span>
            <span className="field-control">
              <OverlapModeSelect keys={[o.key]} />
            </span>
          </div>
        );
      })}
    </Section>
  );
}
