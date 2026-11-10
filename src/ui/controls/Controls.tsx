import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isHexColor } from '../../model/color';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

export function ReadOnly({ value }: { value: string }) {
  return <span className="readonly">{value}</span>;
}

export const MIXED = '—';

/** Text input that commits on Enter/blur; Esc reverts; ↑/↓ step. `value === null` = mixed. */
export function NumberField(props: {
  value: number | null;
  format: (v: number) => string;
  parse: (s: string) => number | null;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  width?: number;
}) {
  const { value, format, parse, onCommit, step, min = -Infinity, max = Infinity } = props;
  const shown = value === null ? '' : format(value);
  const [text, setText] = useState(shown);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(shown);
  }, [shown]);

  const commit = (t: string) => {
    const v = parse(t);
    if (v === null || !Number.isFinite(v)) return setText(shown);
    const c = Math.min(max, Math.max(min, v));
    onCommit(c);
    setText(format(c));
  };

  return (
    <input
      className="input"
      style={props.width ? { width: props.width } : undefined}
      value={text}
      placeholder={value === null ? MIXED : undefined}
      onFocus={(e) => {
        editing.current = true;
        e.target.select();
      }}
      onBlur={() => {
        editing.current = false;
        if (text !== shown) commit(text);
      }}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        else if (e.key === 'Escape') {
          setText(shown);
          editing.current = false;
          (e.target as HTMLInputElement).blur();
        } else if (step && value !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const v = Math.min(max, Math.max(min, value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1)));
          onCommit(v);
          setText(format(v));
        }
      }}
    />
  );
}

/** Live text input (every keystroke applies; caller should coalesce undo). */
export function TextField({ value, onChange, placeholder }: { value: string | null; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      className="input"
      value={value ?? ''}
      placeholder={value === null ? MIXED : placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function ColorField({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [hex, setHex] = useState(value ?? '');
  useEffect(() => setHex(value ?? ''), [value]);
  return (
    <span className="color-field">
      <input type="color" className="swatch" value={value ?? '#cccccc'} onChange={(e) => onChange(e.target.value)} />
      <input
        className="input mono"
        value={hex}
        placeholder={value === null ? MIXED : ''}
        onChange={(e) => setHex(e.target.value)}
        onBlur={() => (isHexColor(hex) ? onChange(hex.toLowerCase()) : setHex(value ?? ''))}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </span>
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value as T)}>
      {value === null && <option value="">{MIXED}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean | null; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === null;
  }, [checked]);
  return (
    <label className="checkbox">
      <input ref={ref} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Slider({ value, onChange, min, max, step }: { value: number | null; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <span className="slider">
      <input type="range" min={min} max={max} step={step} value={value ?? (min + max) / 2} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className="slider-value">{value === null ? MIXED : `${Math.round(value * 100)}%`}</span>
    </span>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Returns the shared value of `fn` across items, or null if mixed/empty. */
export function common<T, V>(items: T[], fn: (t: T) => V): V | null {
  if (items.length === 0) return null;
  const first = fn(items[0]);
  return items.every((i) => fn(i) === first) ? first : null;
}
