# performance-budget
> Set and enforce file size budgets for your build artifacts. Stop bundle bloat in CI.

```bash
npx performance-budget init
npx performance-budget
```

```
performance-budget · checking 4 budgets
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  main JS      ████████████████░░░░  198.4 KB / 200 KB  (99%)  ✓
  CSS          ████████░░░░░░░░░░░░   41.2 KB / 50 KB   (82%)  ✓
  images       ██░░░░░░░░░░░░░░░░░░   98.7 KB / 500 KB  (19%)  ✓
  total        ███████████████████░  1.94 MB / 2 MB     (97%)  ✓

  All budgets passing ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Commands
| Command | Description |
|---------|-------------|
| `performance-budget init` | Create `.perf-budget.json` config |
| `performance-budget` | Check all budgets |
| `--ci` | Exit 1 on failure (CI mode) |
| `--history` | Show size trend vs baseline |
| `--baseline` | Save current sizes as baseline |
| `--threshold N` | Warn at N% of budget (default: 80) |
| `--format json\|table\|minimal` | Output format |

## Config

Running `init` creates a `.perf-budget.json` in your project root:

```json
{
  "budgets": [
    { "name": "main JS", "path": "dist/*.js", "maxSize": "200KB", "maxGzip": "60KB" },
    { "name": "CSS", "path": "dist/*.css", "maxSize": "50KB", "maxGzip": "15KB" },
    { "name": "images", "path": "dist/images/*", "maxSize": "500KB" },
    { "name": "total", "path": "dist/**/*", "maxSize": "2MB" }
  ]
}
```

Each budget entry supports:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | yes | Human-readable label |
| `path` | yes | Glob pattern (supports `*` and `**`) |
| `maxSize` | yes | Max raw size (`B`, `KB`, `MB`, `GB`) |
| `maxGzip` | no | Max estimated gzip size |

## CI Usage

```yaml
# GitHub Actions example
- name: Check performance budgets
  run: npx performance-budget --ci
```

Exit code `1` when any budget is exceeded. Exit code `0` when all pass.

## Size Tracking

```bash
# After your first build, save a baseline
npx performance-budget --baseline

# On subsequent builds, compare against it
npx performance-budget --history
```

Output shows `+N KB` or `-N KB` vs the saved baseline, so you can spot regressions at a glance.

## HTML Report

```bash
npx performance-budget --report report.html
```

Generates a standalone HTML report with SVG bar charts. No external dependencies — works offline.

## Install
```bash
npx performance-budget
npm install -g performance-budget
```

---
**Zero dependencies** · **Node 18+** · Made by [NickCirv](https://github.com/NickCirv) · MIT
