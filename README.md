# Bubble Diagram

Architectural bubble (program) diagrams at true drawing scale. React + Vite + TypeScript + react-konva.

```bash
npm install
npm run dev        # http://localhost:5173
```

Try **File → Import CSV…** with `examples/sample-program.csv`.

## Development

```bash
npm test                         # unit tests
npx playwright install chromium  # once per machine, for the browser tests
npm run e2e                      # browser tests
npm run lint
npm run format
npm run build                    # production build in dist/
```

See `CLAUDE.md` for architecture and conventions.
