#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

// ─── GLOB MATCHING ────────────────────────────────────────────────────────────

function matchGlob(pattern, filePath) {
  // Normalize to forward slashes
  const p = pattern.replace(/\\/g, '/');
  const f = filePath.replace(/\\/g, '/');

  // Convert glob pattern to regex
  let regex = '';
  let i = 0;
  while (i < p.length) {
    if (p[i] === '*' && p[i + 1] === '*') {
      regex += '.*';
      i += 2;
      if (p[i] === '/') i++; // skip trailing slash after **
    } else if (p[i] === '*') {
      regex += '[^/]*';
      i++;
    } else if (p[i] === '?') {
      regex += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(p[i])) {
      regex += '\\' + p[i];
      i++;
    } else {
      regex += p[i];
      i++;
    }
  }

  return new RegExp('^' + regex + '$').test(f);
}

function walkDir(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function resolveGlob(pattern, baseDir) {
  const allFiles = walkDir(baseDir);
  const patternWithBase = pattern.startsWith(baseDir)
    ? pattern
    : path.join(baseDir, pattern.replace(/^dist\/?/, ''));

  // Also try matching relative to cwd
  return allFiles.filter(f => {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
    const patternNorm = pattern.replace(/\\/g, '/');
    return matchGlob(patternNorm, rel);
  });
}

// ─── SIZE PARSING ─────────────────────────────────────────────────────────────

function parseSize(sizeStr) {
  if (typeof sizeStr === 'number') return sizeStr;
  const match = sizeStr.match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);
  if (!match) throw new Error(`Invalid size format: ${sizeStr}`);
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
  return Math.round(value * (multipliers[unit] || 1));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── GZIP ESTIMATION ──────────────────────────────────────────────────────────

async function estimateGzipSize(filePath) {
  const content = fs.readFileSync(filePath);
  const compressed = await gzip(content, { level: 6 });
  return compressed.length;
}

// ─── COLORS & FORMATTING ──────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';

function colorize(text, pct) {
  if (pct >= 100) return RED + text + RESET;
  if (pct >= 80) return YELLOW + text + RESET;
  return GREEN + text + RESET;
}

function progressBar(pct, width = 20) {
  const filled = Math.min(Math.round((pct / 100) * width), width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function pad(str, len, right = false) {
  const s = String(str);
  const spaces = Math.max(0, len - s.length);
  return right ? ' '.repeat(spaces) + s : s + ' '.repeat(spaces);
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  budgets: [
    { name: 'main JS', path: 'dist/*.js', maxSize: '200KB', maxGzip: '60KB' },
    { name: 'CSS', path: 'dist/*.css', maxSize: '50KB', maxGzip: '15KB' },
    { name: 'images', path: 'dist/images/*', maxSize: '500KB' },
    { name: 'total', path: 'dist/**/*', maxSize: '2MB' }
  ]
};

function loadConfig(configFile) {
  const configPath = path.resolve(process.cwd(), configFile);
  if (!fs.existsSync(configPath)) {
    console.error(`${RED}Config file not found: ${configPath}${RESET}`);
    console.error(`Run ${CYAN}npx performance-budget init${RESET} to create one.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────

function loadHistory(historyFile) {
  const histPath = path.resolve(process.cwd(), historyFile);
  if (!fs.existsSync(histPath)) return {};
  return JSON.parse(fs.readFileSync(histPath, 'utf8'));
}

function saveHistory(historyFile, data) {
  const histPath = path.resolve(process.cwd(), historyFile);
  fs.writeFileSync(histPath, JSON.stringify(data, null, 2));
}

// ─── HTML REPORT ──────────────────────────────────────────────────────────────

function generateHTMLReport(results, timestamp) {
  const maxBudget = Math.max(...results.map(r => r.budget));
  const barScale = 400;

  const rows = results.map(r => {
    const pct = (r.actualSize / r.budget) * 100;
    const color = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
    const barWidth = Math.min(Math.round((r.actualSize / maxBudget) * barScale), barScale);
    const budgetBarWidth = Math.min(Math.round((r.budget / maxBudget) * barScale), barScale);
    const status = r.pass ? '✓' : '✗';
    const statusColor = r.pass ? '#22c55e' : '#ef4444';

    return `
      <tr>
        <td class="name">${r.name}</td>
        <td class="chart">
          <svg width="${barScale}" height="24" style="display:block">
            <rect x="0" y="4" width="${budgetBarWidth}" height="16" rx="3" fill="#334155"/>
            <rect x="0" y="4" width="${barWidth}" height="16" rx="3" fill="${color}"/>
          </svg>
        </td>
        <td class="size">${formatSize(r.actualSize)}</td>
        <td class="budget">/ ${formatSize(r.budget)}</td>
        <td class="pct" style="color:${color}">${pct.toFixed(0)}%</td>
        <td class="status" style="color:${statusColor}">${status}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Budget Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; max-width: 900px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 0 0.75rem 0.75rem; }
    td { padding: 0.5rem 0.75rem; vertical-align: middle; }
    tr + tr td { border-top: 1px solid #0f172a; }
    .name { font-weight: 500; white-space: nowrap; }
    .size, .budget, .pct, .status { white-space: nowrap; font-size: 0.875rem; }
    .budget { color: #64748b; }
    .status { font-size: 1rem; }
    .summary { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #334155; display: flex; gap: 2rem; }
    .metric { }
    .metric-value { font-size: 1.25rem; font-weight: 700; }
    .metric-label { font-size: 0.75rem; color: #64748b; margin-top: 0.125rem; }
    .pass { color: #22c55e; }
    .fail { color: #ef4444; }
  </style>
</head>
<body>
  <h1>Performance Budget Report</h1>
  <p class="subtitle">Generated ${new Date(timestamp).toLocaleString()}</p>
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Budget</th>
          <th>Size</th>
          <th colspan="2">vs Limit</th>
          <th>%</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="summary">
      <div class="metric">
        <div class="metric-value ${results.every(r => r.pass) ? 'pass' : 'fail'}">
          ${results.filter(r => r.pass).length}/${results.length}
        </div>
        <div class="metric-label">Budgets passing</div>
      </div>
      <div class="metric">
        <div class="metric-value">${results.filter(r => r.warn && r.pass).length}</div>
        <div class="metric-label">Warnings</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── INIT COMMAND ─────────────────────────────────────────────────────────────

function runInit(configFile) {
  const configPath = path.resolve(process.cwd(), configFile);
  if (fs.existsSync(configPath)) {
    console.log(`${YELLOW}Config already exists: ${configPath}${RESET}`);
    console.log('Delete it first if you want to reinitialise.');
    process.exit(0);
  }
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  console.log(`${GREEN}Created ${configPath}${RESET}`);
  console.log(`\nEdit the budgets to match your project, then run:\n  ${CYAN}npx performance-budget${RESET}`);
}

// ─── CHECK COMMAND ────────────────────────────────────────────────────────────

async function runCheck(args) {
  const configFile = args['--config'] || '.perf-budget.json';
  const format = args['--format'] || 'table';
  const ciMode = args['--ci'] || false;
  const showHistory = args['--history'] || false;
  const saveBaseline = args['--baseline'] || false;
  const threshold = parseInt(args['--threshold'] || '80', 10);
  const reportFile = args['--report'] || null;
  const historyFile = '.perf-budget-history.json';

  const config = loadConfig(configFile);
  const history = (showHistory || saveBaseline) ? loadHistory(historyFile) : {};

  const timestamp = Date.now();
  const results = [];
  let anyFailed = false;

  for (const budget of config.budgets) {
    const files = resolveGlob(budget.path, process.cwd());
    const maxSize = parseSize(budget.maxSize);
    const maxGzip = budget.maxGzip ? parseSize(budget.maxGzip) : null;

    let totalSize = 0;
    let totalGzip = 0;

    for (const f of files) {
      try {
        const stat = fs.statSync(f);
        if (!stat.isFile()) continue;
        totalSize += stat.size;

        if (maxGzip) {
          totalGzip += await estimateGzipSize(f);
        }
      } catch {
        // skip unreadable files
      }
    }

    const sizePct = maxSize > 0 ? (totalSize / maxSize) * 100 : 0;
    const gzipPct = maxGzip ? (totalGzip / maxGzip) * 100 : null;

    const sizePass = totalSize <= maxSize;
    const gzipPass = maxGzip ? totalGzip <= maxGzip : true;
    const pass = sizePass && gzipPass;
    const sizeWarn = sizePct >= threshold && sizePass;
    const gzipWarn = gzipPct !== null && gzipPct >= threshold && gzipPass;

    if (!pass) anyFailed = true;

    // History delta
    let delta = null;
    if (showHistory && history[budget.name]) {
      delta = totalSize - history[budget.name].size;
    }

    results.push({
      name: budget.name,
      path: budget.path,
      files: files.length,
      actualSize: totalSize,
      budget: maxSize,
      sizePct,
      actualGzip: maxGzip ? totalGzip : null,
      budgetGzip: maxGzip,
      gzipPct,
      pass,
      sizePass,
      gzipPass,
      warn: sizeWarn || gzipWarn,
      delta
    });
  }

  // Save baseline
  if (saveBaseline) {
    const baselineData = {};
    for (const r of results) {
      baselineData[r.name] = { size: r.actualSize, timestamp };
    }
    saveHistory(historyFile, baselineData);
  }

  // Output
  if (format === 'json') {
    process.stdout.write(JSON.stringify({ timestamp, results }, null, 2) + '\n');
  } else if (format === 'minimal') {
    for (const r of results) {
      const icon = r.pass ? '✓' : '✗';
      const status = r.warn ? 'WARN' : r.pass ? 'PASS' : 'FAIL';
      process.stdout.write(`${icon} ${r.name}: ${formatSize(r.actualSize)} / ${formatSize(r.budget)} (${r.sizePct.toFixed(0)}%) [${status}]\n`);
    }
    if (anyFailed) process.stdout.write('FAILED\n');
  } else {
    printTable(results, threshold, showHistory);
  }

  // HTML report
  if (reportFile) {
    const html = generateHTMLReport(results, timestamp);
    fs.writeFileSync(path.resolve(process.cwd(), reportFile), html);
    console.log(`\n${DIM}Report saved: ${reportFile}${RESET}`);
  }

  if (ciMode && anyFailed) {
    process.exit(1);
  }
}

function printTable(results, threshold, showHistory) {
  const LINE = '━'.repeat(70);
  const budgetCount = results.length;

  process.stdout.write(`\n${BOLD}performance-budget${RESET} · checking ${budgetCount} budget${budgetCount === 1 ? '' : 's'}\n`);
  process.stdout.write(`${DIM}${LINE}${RESET}\n\n`);

  const nameWidth = Math.max(...results.map(r => r.name.length), 4);

  for (const r of results) {
    const bar = progressBar(r.sizePct);
    const barColored = colorize(bar, r.sizePct);
    const pctStr = `${r.sizePct.toFixed(0)}%`;
    const sizeStr = `${formatSize(r.actualSize)} / ${formatSize(r.budget)}`;

    let statusIcon;
    if (!r.pass) {
      statusIcon = RED + '✗' + RESET;
    } else if (r.warn) {
      statusIcon = YELLOW + '⚠' + RESET;
    } else {
      statusIcon = GREEN + '✓' + RESET;
    }

    let deltaStr = '';
    if (showHistory && r.delta !== null) {
      const sign = r.delta > 0 ? '+' : '';
      const dColor = r.delta > 0 ? YELLOW : GREEN;
      deltaStr = `  ${DIM}(${dColor}${sign}${formatSize(Math.abs(r.delta))}${RESET}${DIM} vs baseline)${RESET}`;
    }

    process.stdout.write(
      `  ${pad(r.name, nameWidth)}  ${barColored}  ${pad(sizeStr, 22)}  ${pad(pctStr, 4, true)}  ${statusIcon}${deltaStr}\n`
    );

    // Show gzip line if applicable
    if (r.actualGzip !== null && r.budgetGzip !== null) {
      const gzBar = progressBar(r.gzipPct);
      const gzBarColored = colorize(gzBar, r.gzipPct);
      const gzPctStr = `${r.gzipPct.toFixed(0)}%`;
      const gzSizeStr = `${formatSize(r.actualGzip)} / ${formatSize(r.budgetGzip)} gzip`;
      const gzIcon = r.gzipPass ? (r.gzipPct >= threshold ? YELLOW + '⚠' + RESET : GREEN + '✓' + RESET) : RED + '✗' + RESET;

      process.stdout.write(
        `  ${pad('  └ gzip', nameWidth)}  ${gzBarColored}  ${pad(gzSizeStr, 22)}  ${pad(gzPctStr, 4, true)}  ${gzIcon}\n`
      );
    }
  }

  process.stdout.write('\n');

  const passing = results.filter(r => r.pass).length;
  const warnings = results.filter(r => r.warn && r.pass).length;
  const failing = results.filter(r => !r.pass).length;

  if (failing === 0) {
    let msg = `  ${GREEN}${BOLD}All budgets passing ✓${RESET}`;
    if (warnings > 0) msg += `  ${YELLOW}(${warnings} warning${warnings > 1 ? 's' : ''} — within ${threshold}%+ of limit)${RESET}`;
    process.stdout.write(msg + '\n');
  } else {
    process.stdout.write(`  ${RED}${BOLD}${failing} budget${failing > 1 ? 's' : ''} exceeded ✗${RESET}  ${GREEN}${passing} passing${RESET}\n`);
    process.stdout.write(`\n  ${DIM}Run with --ci to exit 1 in CI pipelines${RESET}\n`);
  }

  process.stdout.write(`${DIM}${LINE}${RESET}\n\n`);
}

// ─── ARG PARSING ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a;
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[key] = argv[i + 1];
        i += 2;
      } else {
        args[key] = true;
        i++;
      }
    } else {
      positional.push(a);
      i++;
    }
  }
  args._positional = positional;
  return args;
}

// ─── HELP ─────────────────────────────────────────────────────────────────────

function printHelp() {
  process.stdout.write(`
${BOLD}performance-budget${RESET} · file size budgets for build artifacts

${BOLD}Usage${RESET}
  npx performance-budget [command] [options]
  npx pb [command] [options]

${BOLD}Commands${RESET}
  (default)   Check all budgets against .perf-budget.json
  init        Create a .perf-budget.json config file

${BOLD}Options${RESET}
  --config <file>     Config file (default: .perf-budget.json)
  --format <fmt>      Output: table | json | minimal (default: table)
  --ci                Exit 1 if any budget exceeded
  --history           Show size delta vs baseline
  --baseline          Save current sizes as baseline
  --threshold <n>     Warn at n% of budget (default: 80)
  --report <file>     Save HTML report to file

${BOLD}Examples${RESET}
  npx performance-budget init
  npx performance-budget
  npx performance-budget --ci --format minimal
  npx performance-budget --history --report report.html

${DIM}Zero dependencies · Node 18+ · MIT${RESET}
`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args._positional[0];

  if (args['--help'] || args['-h']) {
    printHelp();
    process.exit(0);
  }

  if (command === 'init') {
    const configFile = args['--config'] || '.perf-budget.json';
    runInit(configFile);
    return;
  }

  await runCheck(args);
}

main().catch(err => {
  process.stderr.write(`${RED}Error: ${err.message}${RESET}\n`);
  process.exit(1);
});
