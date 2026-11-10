import { useDoc } from '../store/documentStore';
import { useUi } from '../store/uiStore';
import { getScale, niceScaleBarFt, pxPerFt, scaleBarSegments } from '../model/units';

export function ScaleBar() {
  const doc = useDoc();
  const zoom = useUi((s) => s.view.zoom);
  const k = pxPerFt(doc.settings.scale, zoom);
  const len = niceScaleBarFt(k, 140);
  const segs = scaleBarSegments(len);
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
