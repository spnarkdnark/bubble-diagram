import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LabelPrim } from '../render/scene';
import { labelRect } from '../render/scene';
import type { LabelPart } from '../store/uiStore';

interface Props {
  /** starting text */
  value: string;
  label: LabelPrim;
  /** which lines of the label the box covers */
  part: LabelPart;
  /** px per ft */
  k: number;
  panX: number;
  panY: number;
  ftPerPt: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Inline text box placed exactly over a bubble's name (or its area line).
 * Enter saves, Shift+Enter adds a line break (names only), Esc cancels,
 * clicking away saves.
 */
export function LabelEditor({ value, label, part, k, panX, panY, ftPerPt, onCommit, onCancel }: Props) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const size = part === 'size';
  const first = label.layout.lines.find((l) => l.secondary === size) ?? label.layout.lines[0];
  const pxPerPt = ftPerPt * k;
  const rect = labelRect(label, ftPerPt, size);
  const fontPx = Math.max(10, first.sizePt * pxPerPt);
  const width = size ? Math.max(90, first.wPt * pxPerPt + 24) : Math.max(120, label.layout.widthPt * pxPerPt + 16);
  const cx = label.x * k + panX;
  const top = (rect ? rect.minY : label.y) * k + panY - 4;

  useEffect(() => {
    const el = ref.current!;
    el.focus();
    el.select();
  }, []);

  // grow with content
  useLayoutEffect(() => {
    const el = ref.current!;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, fontPx]);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onCommit(text);
    else onCancel();
  };

  return (
    <textarea
      ref={ref}
      className="label-editor"
      value={text}
      rows={1}
      spellCheck={false}
      aria-label={size ? 'Area' : 'Name'}
      style={{
        left: cx - width / 2,
        top,
        width,
        fontSize: fontPx,
        fontFamily: label.fontFamily,
        fontWeight: first.weight,
        color: first.color,
        lineHeight: 1.2,
      }}
      onChange={(e) => setText(size ? e.target.value.replace(/\n/g, '') : e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && (size || !e.shiftKey)) {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
