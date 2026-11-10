import { memo, useMemo } from 'react';
import { Circle, Group, Text } from 'react-konva';
import type { BubbleNode, Project } from '../../model/types';
import { dashPatternPt, LABEL_FONT_FAMILY } from '../../model/defaults';
import { hexToRgb } from '../../model/color';
import { ptToFt } from '../../model/units';
import type { ResolvedStyle } from '../../model/selectors';
import { layoutLabel } from '../textLayout';

interface Props {
  node: BubbleNode;
  style: ResolvedStyle;
  project: Project;
  /** stage scale (px per ft at current zoom) — labels are drawn in screen px for crisp text */
  k: number;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export const BubbleShape = memo(function BubbleShape({ node, style, project, k }: Props) {
  const scale = project.settings.scale;
  const r = node.shape.radiusFt;
  const sw = ptToFt(style.strokeWeightPt, scale);
  const dash = dashPatternPt(style.strokeStyle, style.strokeWeightPt)?.map((v) => ptToFt(v, scale));
  const layout = useMemo(() => layoutLabel(node, project, style), [node, style, scale, project.categories]);
  const pxPerPt = ptToFt(1, scale) * k;

  return (
    <Group x={node.x} y={node.y} listening={false}>
      <Circle
        radius={r}
        fill={rgba(style.fill, style.fillOpacity)}
        stroke={style.strokeWeightPt > 0 ? style.stroke : undefined}
        strokeWidth={sw}
        dash={dash}
        lineCap={style.strokeStyle === 'dotted' ? 'round' : 'butt'}
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
            fill={l.color}
            wrap="none"
            perfectDrawEnabled={false}
          />
        ))}
      </Group>
    </Group>
  );
});
