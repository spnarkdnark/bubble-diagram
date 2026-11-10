import { memo } from 'react';
import { Line } from 'react-konva';
import type { BubbleNode, ConnectionType, ScaleId } from '../../model/types';
import { CONNECTION_COLOR, CONNECTION_STYLES, dashPatternPt } from '../../model/defaults';
import { connectionSegment } from '../../model/geometry';
import { ptToFt } from '../../model/units';

interface Props {
  a: BubbleNode;
  b: BubbleNode;
  type: ConnectionType;
  scale: ScaleId;
  selected: boolean;
  k: number;
}

export const ConnectionLine = memo(function ConnectionLine({ a, b, type, scale, selected, k }: Props) {
  const seg = connectionSegment(a, b);
  if (!seg) return null;
  const st = CONNECTION_STYLES[type];
  const points = [seg[0].x, seg[0].y, seg[1].x, seg[1].y];
  return (
    <>
      {selected && (
        <Line points={points} stroke="#2f7de1" opacity={0.35} strokeWidth={ptToFt(st.weightPt, scale) + 6 / k} lineCap="round" listening={false} />
      )}
      <Line
        points={points}
        stroke={selected ? '#2f7de1' : CONNECTION_COLOR}
        strokeWidth={ptToFt(st.weightPt, scale)}
        dash={dashPatternPt(st.style, st.weightPt)?.map((v) => ptToFt(v, scale))}
        lineCap="butt"
        listening={false}
        perfectDrawEnabled={false}
      />
    </>
  );
});
