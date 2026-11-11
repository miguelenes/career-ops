// tests/plugins-local/scan-title-filter-overrides.test.mjs — scan.mjs applies
// title_filter_overrides per portals.yml entry (matched on the entry `name`),
// and without overrides the title filter behaves exactly as before.
import { pass, fail, ROOT, NODE } from '../helpers.mjs';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { buildTitleFilter, buildTitleFilterOverrides, buildTitleFilterWithOverrides } from '../../scan.mjs';

console.log('\nscan.mjs — title_filter_overrides per source');

const FILTER = { positive: ['Laravel'], negative: ['Sales'] };

// Unit: with no overrides the wrapped filter is the plain one, title for title.
const plain = buildTitleFilter(FILTER);
const wrapped = buildTitleFilterWithOverrides(FILTER, buildTitleFilterOverrides(undefined));
const titles = ['Laravel Developer', 'Senior Developer', 'Senior Laravel Sales Lead', 'PHP Engineer', '', 'laravel'];
const same = titles.every((t) => plain(t) === wrapped(t, 'Any Board'));
if (same) pass('no overrides: same verdict as buildTitleFilter() for every title');
else fail(`no overrides changed a verdict: ${JSON.stringify(titles.map((t) => [t, plain(t), wrapped(t, 'Any Board')]))}`);

function scanPipeline(overrides) {
  const dir = mkdtempSync(join(tmpdir(), 'scan-title-overrides-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'applications.md'), `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
`);
    writeFileSync(join(dir, 'data', 'pipeline.md'), '# Pipeline\n\n');
    const board = (name, slug) => `  - name: ${name}
    careers_url: https://example.com/${slug}
    parser:
      command: node
      script: tests/fixtures/title-override-board.mjs
      args: ["${slug}"]
`;
    const portals = join(dir, 'portals.yml');
    writeFileSync(portals, `title_filter:
  positive:
    - "Laravel"
  negative:
    - "Sales"
${overrides ? `title_filter_overrides:
  - companies: ["Wide Board"]
    positive_extra:
      - "Senior"
` : ''}tracked_companies:
${board('Wide Board', 'wide')}${board('Plain Board', 'plain')}`);
    execFileSync(NODE, [join(ROOT, 'scan.mjs')], {
      cwd: dir,
      env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_PORTALS: portals },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const p = join(dir, 'data', 'pipeline.md');
    const text = existsSync(p) ? readFileSync(p, 'utf-8') : '';
    return [...text.matchAll(/https:\/\/example\.com\/[a-z]+\/\d/g)].map((m) => m[0]).sort();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  const base = scanPipeline(false);
  const want = ['https://example.com/plain/1', 'https://example.com/wide/1'];
  if (JSON.stringify(base) === JSON.stringify(want)) pass('without overrides only the globally matching title is kept on every board');
  else fail(`no-overrides scan kept ${JSON.stringify(base)}, want ${JSON.stringify(want)}`);

  const wide = scanPipeline(true);
  const wantWide = ['https://example.com/plain/1', 'https://example.com/wide/1', 'https://example.com/wide/2'];
  if (JSON.stringify(wide) === JSON.stringify(wantWide)) pass('override widens only the named entry; the global negative still drops "Senior Sales Developer"');
  else fail(`overrides scan kept ${JSON.stringify(wide)}, want ${JSON.stringify(wantWide)}`);
} catch (err) {
  fail(`e2e scan run failed: ${err.message}`);
}
