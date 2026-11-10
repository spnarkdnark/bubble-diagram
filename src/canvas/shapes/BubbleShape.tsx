import { memo, useMemo } from 'react';
import { Circle, Group, Text } from 'react-konva';
import type { BubbleNode, ScaleId } from '../../model/types';
import { dashPatternPt, LABEL_COLOR, LABEL_FONT_FAMILY } from '../../model/defaults';
import { hexToRgb } from '../../model/color';
import { ptToFt } from '../../model/units';
import { layoutLabel } from '../textLayout';

interface Props {
  node: BubbleNode;
  fill: string;
  stroke: string;
  scale: ScaleId;
  /** stage scale (px per ft at current zoom) — labels are drawn in screen px for crisp text */
  k: number;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export const BubbleShape = memo(function BubbleShape({ node, fill, stroke, scale, k }: Props) {
  const r = node.shape.radiusFt;
  const sw = ptToFt(node.style.strokeWeightPt, scale);
  const dash =
    node.style.strokeStyle === 'dashed' ? dashPatternPt(node.style.strokeWeightPt).map((v) => ptToFt(v, scale)) : undefined;
  const layout = useMemo(() => layoutLabel(node, scale), [node, scale]);
  const pxPerPt = ptToFt(1, scale) * k;

  return (
    <Group x={node.x} y={node.y} listening={false}>
      <Circle
        radius={r}
        fill={rgba(fill, node.style.fillOpacity)}
        stroke={node.style.strokeWeightPt > 0 ? stroke : undefined}
        strokeWidth={sw}
        dash={dash}
        perfectDrawEnabled={false}
      />
      <Group scaleX={1 / k} scaleY={1 / k}>
        {layout.lines.map((l, i) => (
          <Text
            key={i}
            text={l.text}
            x={(-layout.widthPt / 2) * pxPerPt}
            y={l.topPt * pxPerPt}
            width={layout.widthPt * pxPerPt}
            height={l.heightPt * pxPerPt}
            align="center"
            verticalAlign="middle"
            fontSize={l.sizePt * pxPerPt}
            fontFamily={LABEL_FONT_FAMILY}
            fontStyle={l.weight === 600 ? 'bold' : 'normal'}
            fill={l.secondary ? '#555' : LABEL_COLOR}
            wrap="none"
            perfectDrawEnabled={false}
          />
        ))}
      </Group>
    </Group>
  );
});
