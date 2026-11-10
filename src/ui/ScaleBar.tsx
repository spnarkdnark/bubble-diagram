import { useDoc } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import { getScale, pxPerFt } from '../model/units';

const NICE_FT = [1, 2, 4, 5, 8, 10, 16, 20, 25, 32, 40, 50, 64, 100, 200, 250, 500, 1000];

/** Pick a nice bar length (ft) whose on-screen length is near `targetPx`. */
export function niceBarLength(pxPerFoot: number, targetPx = 140): number {
  let best = NICE_FT[0];
  for (const f of NICE_FT) if (f * pxPerFoot <= targetPx) best = f;
  return best;
}

export function ScaleBar() {
  const doc = useDoc();
  const zoom = useUi((s) => s.view.zoom);
  const k = pxPerFt(doc.settings.scale, zoom);
  const len = niceBarLength(k);
  const segs = len % 4 === 0 || len % 5 !== 0 ? 4 : 5;
  const w = len * k;
  return (
    <div className="scalebar" aria-label="Scale bar">
      <svg width={w + 24} height={30}>
        {Array.from({ length: segs }, (_, i) => (
          <rect key={i} x={8 + (i * w) / segs} y={6} width={w / segs} height={5} fill={i % 2 ? '#fff' : '#333'} stroke="#333" strokeWidth={0.75} />
        ))}
        <text x={8} y={24} fontSize={10} textAnchor="middle">0</text>
        <text x={8 + w / 2} y={24} fontSize={10} textAnchor="middle">{len / 2}'</text>
        <text x={8 + w} y={24} fontSize={10} textAnchor="middle">{len}'</text>
      </svg>
      <div className="scalebar-label">
        {getScale(doc.settings.scale).label} · {Math.round(zoom * 100)}%{Math.abs(zoom - 1) < 1e-6 ? ' (true size)' : ''}
      </div>
    </div>
  );
}
