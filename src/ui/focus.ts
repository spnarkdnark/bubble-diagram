/** True when keyboard input belongs to a form field rather than the canvas (shortcuts, clipboard). */
export function isTextEntry(el: EventTarget | Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'color', 'button'].includes(el.type);
}
