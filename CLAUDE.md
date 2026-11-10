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
              selectors (resolveStyle etc.), migrate, overlaps (detection/arcs),
              blob (freeform shapes: geometry, ring snapping, building)
src/store/    history.ts (pure undo stack), documentStore (undoable Project),
              uiStore (selection/tool/view — NOT undoable), actions.ts (all ops)
src/render/   scene.ts (Project -> primitives, the ONE place visuals are decided),
              drawCanvas.ts, sketch.ts (hand-drawn geometry + presets),
              paper.ts (textures), fonts.ts (hand lettering, outlines for export)
src/canvas/   CanvasStage (events, tools, zoom/pan), layers/GridLayer, hitTest,
              textLayout (label wrapping shared with export), pointer
src/ui/       Toolbar, ScaleBar, panels/ (properties, categories, settings),
              controls/ (shared inputs), ExportDialog, Toast
src/io/       fileActions (New/Open/Save/Import CSV commands), projectFile (JSON),
              clipboard + clipboardActions (copy/cut/paste/paste style),
              autosave (localStorage), csvImport, autoLayout, download helpers,
              export/ (svg.ts is the single exporter; png/pdf build on it)
src/hooks/    useKeyboardShortcuts
tests/        Vitest
```

## Data model (src/model/types.ts)
`Project { schemaVersion, meta, settings, categories, categoryOrder, nodes, nodeOrder, connections }`
Schema v2 (v1 files upgrade in `migrate.ts`).
- `BubbleNode { id, name, x, y, shape, categoryId, style }` — x/y = center (circles) or
  the origin free blob points are relative to.
- `shape` is a tagged union: `{kind:'circle', radiusFt}` | `{kind:'blob', points, gapFt}`.
  All `switch(kind)` code is in `model/geometry.ts` (node functions take `project`,
  because blob geometry depends on other bubbles). Add ellipse/roundedRect there
  (+ scene.ts + migrate).
- **Styles**: `Category.style` and `settings.defaultStyle` are full `StyleProps`
  (fill, opacity, outline color/weight/style, label size/color/bold/secondary,
  sketchAmount). `node.style` holds only overrides (`Partial<StyleProps>`).
  Always read via `selectors.resolveStyle(node, project)`. `stroke: null` = auto.
- **Blobs**: points are `free` (ft, relative to node x/y) or `anchor` (bubble id +
  angle on its ring at `radius + gapFt`, `dir`, `arc` = follow ring to next point).
  Anchors follow bubbles. Deleting/copying without the hugged bubble calls
  `blob.detachAnchors` (freezes them as free points); duplicate/paste remap ids.
- **Overlaps**: computed, never stored, by `overlaps.findOverlaps` (circles only).
  `project.overlaps[overlapKey(a,b)]` stores per-pair mode overrides;
  `settings.overlap` holds the default mode/weight/color/inner arcs.
- `settings.graphic` is the global sketch character (see render/sketch.ts PRESETS),
  paper, lettering font and seed.
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

## Rendering
`render/scene.ts#buildScene(project)` returns primitives in feet (circles, arcs,
paths, labels). Canvas draws them in one Konva `Shape` (`drawCanvas.ts`); the SVG
exporter writes the same primitives. Sketch mode swaps exact geometry for seeded
hand-drawn ops (`render/sketch.ts`, amounts in paper points). Node results are cached
by a JSON key; keep anything visual in that key. Labels are drawn counter-scaled.
Hand fonts are bundled via @fontsource; exports outline them with opentype.js
(`fonts.loadOutlineFont` must run before `buildSvg`).

## Interaction summary
- Tools: V select, B bubble (click to place), C connect (click A then B; Esc exits),
  S shape (drag freehand or click points; Enter/double-click/first point closes;
  double-click a gap between bubbles to fill the pocket).
- Selected shape: drag control points (snap to rings; Alt = no snap), double-click a
  point to delete it, the edge to insert one.
- Overlaps: ◇ marker at each overlap of a selected bubble; click it to set its mode.
- Names: click the name of the already-selected element (or double-click any name) to
  edit it in place (`canvas/LabelEditor.tsx`, `uiStore.editingLabel`); Enter saves,
  Shift+Enter breaks the line, Esc cancels, blur saves. One undo step.
- Ctrl+C/X/V use native clipboard events (JSON text, works across tabs); paste goes
  to the cursor. Ctrl+Shift+V pastes the copied element's look onto the selection.
  Pasting tab/comma-separated rows with a header imports bubbles.
- Wheel: zoom at cursor. **Wheel over a selected bubble resizes it ±6" per notch**
  (Shift = ±1"); Ctrl/⌘+wheel (and trackpad pinch) always zooms.
- Pan: Space+drag or middle mouse. Marquee: drag on empty canvas (Shift adds).
- Resize handle snaps radius to 6" (`settings.snap.radiusIncrementFt`); Shift = free.
- Shortcuts: Del, ⌘/Ctrl+D, ⌘/Ctrl+A, arrows (1', Shift 10'), ⌘/Ctrl+Z / Shift+Z / Y,
  ⌘/Ctrl+S save, F zoom to fit, ⌘/Ctrl+0 100% (true paper size).

## CSV import
Columns (case-insensitive, aliases in `csvImport.ts`): `name`, `radius`, `category`,
optional `area`. Radius accepts `12.5`, `12'`, `12'-6"`; area accepts `1200`, `1,200 sf`.
Radius wins if both are given; otherwise radius = sqrt(area/π). Unknown categories are
created with the next palette color. Imported bubbles go in a loose grid below existing
content (`autoLayout.ts`). Sample: `examples/sample-program.csv`.

## Export
- `io/export/svg.ts` builds SVG from the data model in paper points at true scale
  (independent of zoom). PDF = svg2pdf.js onto a jsPDF page (fit-to-drawing or a
  standard sheet, centered, warns if too big). PNG = SVG rasterized at chosen DPI.
- Label line-wrapping is shared by canvas and export (`canvas/textLayout.ts`) so
  they match.

## Testing notes
- Unit tests cover units, geometry, history, project file + v1 migration, CSV,
  styles, clipboard, overlaps, sketch determinism, blob building/attachment.
- Canvas hit-testing is geometric (`canvas/hitTest.ts`); Konva layers are
  `listening={false}`. Pointer handling lives in `CanvasStage.tsx` (window-level
  move/up so drags continue outside the canvas).
- jsPDF/svg2pdf are lazy-loaded on first PDF export.

## Out of scope for v1 (hooks left in place)
- Ellipses / rounded rectangles: `Shape` union + geometry.ts switches + scene.ts.
- Metric: `settings.unitSystem` + formatting/parsing confined to units.ts.
- Layers / locking: reserved optional `layerId` / `locked` on `BubbleNode`.

## Style
Neutral grays, white space, system sans-serif UI; labels use Helvetica/Arial (matches
PDF built-in font). Category palette in `model/defaults.ts` (light, muted).
