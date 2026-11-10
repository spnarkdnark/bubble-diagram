import type { ConnectionType, Id } from '../../model/types';
import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { CONNECTION_STYLES } from '../../model/defaults';
import { common, Section } from '../controls/Controls';

const TYPES: ConnectionType[] = ['strong', 'near', 'visual'];

export function LinePreview({ type }: { type: ConnectionType }) {
  const st = CONNECTION_STYLES[type];
  return (
    <svg width="36" height="10" aria-hidden>
      <line x1="2" y1="5" x2="34" y2="5" stroke="currentColor" strokeWidth={st.weightPt} strokeDasharray={st.style === 'dashed' ? '4 3' : undefined} />
    </svg>
  );
}

export function ConnectionProps({ ids }: { ids: Id[] }) {
  const doc = useDoc();
  const conns = ids.map((id) => doc.connections[id]).filter(Boolean);
  if (conns.length === 0) return null;
  const type = common(conns, (c) => c.type);
  const single = conns.length === 1 ? conns[0] : null;

  return (
    <Section title={single ? 'Connection' : `${conns.length} connections`}>
      {single && (
        <p className="muted small">
          {doc.nodes[single.from]?.name} ↔ {doc.nodes[single.to]?.name}
        </p>
      )}
      <div className="segmented vertical">
        {TYPES.map((t) => (
          <button key={t} className={`seg ${type === t ? 'active' : ''}`} onClick={() => A.setConnectionType(ids, t)}>
            <LinePreview type={t} />
            {CONNECTION_STYLES[t].label}
          </button>
        ))}
      </div>
      <div className="button-row">
        <button className="btn danger" onClick={A.deleteSelection}>Delete</button>
      </div>
    </Section>
  );
}
