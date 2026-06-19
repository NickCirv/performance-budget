<div align="center">

# performance-budget

**Enforce file size limits on your build artifacts — catch bundle bloat before it ships.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](package.json)

</div>

## Install
```bash
npx github:NickCirv/performance-budget init
```

## Usage
```bash
# Check all budgets (reads .perf-budget.json)
npx github:NickCirv/performance-budget

# CI mode — exit 1 if any budget is exceeded
npx github:NickCirv/performance-budget --ci

# Save current sizes as baseline, then compare on next run
npx github:NickCirv/performance-budget --baseline
npx github:NickCirv/performance-budget --history
```

| Flag | Description |
|------|-------------|
| `--ci` | Exit 1 when any budget is exceeded |
| `--history` | Show size delta vs saved baseline |
| `--baseline` | Save current sizes as baseline |
| `--threshold <n>` | Warn at n% of budget (default: 80) |
| `--format table\|json\|minimal` | Output format (default: table) |
| `--report <file>` | Save standalone HTML report |
| `--config <file>` | Config file path (default: `.perf-budget.json`) |

## What it does

`performance-budget` reads a `.perf-budget.json` config defining glob patterns and size limits for your build output, then checks actual file sizes (and optional gzip estimates) against those limits. It prints a progress-bar table in the terminal and exits non-zero in CI when any limit is breached. Running `--baseline` saves a size snapshot so `--history` can show KB-level deltas across builds. The `--report` flag generates a self-contained HTML report with SVG bar charts.

---
<sub>Zero dependencies · Node 18+ · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
