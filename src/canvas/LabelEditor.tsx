import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LabelPrim } from '../render/scene';
import { labelNameRect } from '../render/scene';

interface Props {
  name: string;
  label: LabelPrim;
  /** px per ft */
  k: number;
  panX: number;
  panY: number;
  ftPerPt: number;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Inline text box placed exactly over a bubble's name. Enter saves,
 * Shift+Enter adds a line break, Esc cancels, clicking away saves.
 */
export function LabelEditor({ name, label, k, panX, panY, ftPerPt, onCommit, onCancel }: Props) {
  const [text, setText] = useState(name);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const first = label.layout.lines.find((l) => !l.secondary) ?? label.layout.lines[0];
  const pxPerPt = ftPerPt * k;
  const rect = labelNameRect(label, ftPerPt);
  const fontPx = Math.max(10, first.sizePt * pxPerPt);
  const width = Math.max(120, label.layout.widthPt * pxPerPt + 16);
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
      aria-label="Name"
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
      onChange={(e) => setText(e.target.value)}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
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
