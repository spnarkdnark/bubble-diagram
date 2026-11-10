# Bubble Diagram — notes for future sessions

Web app for architectural bubble (program) diagrams. React 18 + Vite + TypeScript,
react-konva canvas, Zustand + Immer state. No UI framework; plain CSS with tokens.

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm test` — Vitest unit tests (`tests/`, model/store/io only; no DOM)
- `npm run typecheck` / `npm run build`

## The one rule: units
- **Model space = feet.** Every coordinate, radius, grid spacing, nudge is in feet.
  Never store pixels in the document.
- **Paper space = points (1/72").** Line weights (`strokeWeightPt`) and font sizes
  (`fontSizePt`) are paper sizes, like CAD annotative objects: changing the drawing
  scale changes bubble size on paper but not text/line size.
- Conversions live only in `src/model/units.ts`:
  - `pxPerFt(scale, zoom) = 96 * paperInPerFt * zoom` (96 px = 1 paper inch at 100%)
  - `ptToFt(pt, scale)` for rendering paper-space values in model space
- The Konva `Stage` is transformed by `scale = pxPerFt(scale, zoom)` and
  `position = (panX, panY)`; shapes are drawn directly in feet. Screen-constant
  overlay sizes (handles, hit widths) are `px / k` where `k` is the stage scale.

## Layout
```
src/model/    pure TS, no React: types, units, geometry, color, defaults, factory,
              selectors (derived values: resolved fill/stroke, labels), migrate
src/store/    history.ts (pure undo stack), documentStore (undoable Project),
              uiStore (selection/tool/view — NOT undoable), actions.ts (all ops)
src/canvas/   CanvasStage (events, tools, zoom/pan), layers/, shapes/, textLayout
src/ui/       Toolbar, ScaleBar, panels/ (properties, categories, settings),
              controls/ (shared inputs), ExportDialog, Toast
src/io/       projectFile (JSON), autosave (localStorage), csvImport, autoLayout,
              export/ (svg.ts is the single exporter; png/pdf build on it)
src/hooks/    useKeyboardShortcuts
tests/        Vitest
```

## Data model (src/model/types.ts)
`Project { schemaVersion, meta, settings, categories, categoryOrder, nodes, nodeOrder, connections }`
- `BubbleNode { id, name, x, y, shape, categoryId, style, label }` — x/y = center (ft).
- `shape` is a tagged union (`{kind:'circle', radiusFt}`); all `switch(kind)` code is in
  `model/geometry.ts`. Add ellipse/roundedRect there (+ renderer + svg export + migrate).
- `style.fill === null` → follow category color (resolved at render via
  `selectors.resolveFill`). `style.stroke === null` → auto (darkened fill).
- `Connection { id, from, to, type: 'strong'|'near'|'visual' }`. Endpoints are never
  stored; `geometry.connectionSegment` computes edge-to-edge points.
- Bump `SCHEMA_VERSION` and add a migration case in `model/migrate.ts` on format change.

## State & undo conventions
- Every document change goes through `useDocument.commit(recipe, {coalesceKey?})`
  (usually via `store/actions.ts`). Never `set()` the document directly.
- Continuous gestures (drag, resize-handle): `beginGesture()` → `preview()`… →
  `endGesture()` = one undo step; `cancelGesture()` on Esc.
- Rapid repeated edits (typing, color picker, arrow nudge, wheel resize) pass a
  `coalesceKey`; same key within 800 ms merges into one undo step.
- Selection lives in `uiStore` and is pruned automatically when ids disappear.
- Autosave writes the current document to localStorage (debounced).

## Interaction summary
- Tools: V select, B bubble (click to place), C connect (click A then B; Esc exits).
- Wheel: zoom at cursor. **Wheel over a selected bubble resizes it ±6" per notch**
  (Shift = ±1"); Ctrl/⌘+wheel (and trackpad pinch) always zooms.
- Pan: Space+drag or middle mouse. Marquee: drag on empty canvas (Shift adds).
- Resize handle snaps radius to 6" (`settings.snap.radiusIncrementFt`); Shift = free.
- Shortcuts: Del, ⌘/Ctrl+D, ⌘/Ctrl+A, arrows (1', Shift 10'), ⌘/Ctrl+Z / Shift+Z / Y,
  ⌘/Ctrl+S save, F zoom to fit, ⌘/Ctrl+0 100% (true paper size).

## Export
- `io/export/svg.ts` builds SVG from the data model in paper points at true scale
  (independent of zoom). PDF = svg2pdf.js onto a jsPDF page (fit-to-drawing or a
  standard sheet, centered, warns if too big). PNG = SVG rasterized at chosen DPI.
- Label line-wrapping is shared by canvas and export (`canvas/textLayout.ts`) so
  they match.

## Out of scope for v1 (hooks left in place)
- Ellipses / rounded rectangles: `Shape` union + geometry.ts switches.
- Metric: `settings.unitSystem` + formatting/parsing confined to units.ts.
- Layers / locking: reserved optional `layerId` / `locked` on `BubbleNode`.

## Style
Neutral grays, white space, system sans-serif UI; labels use Helvetica/Arial (matches
PDF built-in font). Category palette in `model/defaults.ts` (light, muted).
