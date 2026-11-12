import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

const tracker = '# Applications\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n';
const upstream = 'https://job-boards.greenhouse.io/restaurantsupply/jobs/123456';
for (const source of ['pipeline', 'history', 'applications']) {
  test(`RestaurantSupply Himalayas copy dedupes against ${source}; other employer survives`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'cross-source-'));
    try {
      mkdirSync(join(dir, 'data'));
      writeFileSync(join(dir, 'data/applications.md'), tracker + (source === 'applications' ? `| 1 | 2026-11-11 | RestaurantSupply | Senior AI Engineer | 4 | Applied | — | — | ${upstream} |\n` : ''));
      writeFileSync(join(dir, 'data/pipeline.md'), '# Pipeline\n' + (source === 'pipeline' ? `- [ ] ${upstream} | RestaurantSupply | Senior AI Engineer\n` : ''));
      if (source === 'history') writeFileSync(join(dir, 'data/scan-history.tsv'), `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n${upstream}\t2026-11-11\tgreenhouse\tSenior AI Engineer\tRestaurantSupply\tadded\tRemote\n`);
      const portals = join(dir, 'fixture.yml');
      writeFileSync(portals, 'title_filter:\n  positive: [Engineer]\ntracked_companies:\n  - name: Fixture Feed\n    aggregator: true\n    careers_url: https://example.com/jobs\n    parser:\n      command: node\n      script: tests/fixtures/cross-source-board.mjs\n');
      const result = spawnSync(process.execPath, [join(ROOT, 'scan.mjs'), '--dry-run'], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_DATA_DIR: '', CAREER_OPS_PORTALS: portals, CAREER_OPS_TRACKER: '', CAREER_OPS_PIPELINE: '', CAREER_OPS_SCAN_HISTORY: '' },
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /[Dd]up[^\n]*1|1[^\n]*[Dd]up/);
      assert.match(result.stdout, /Other Employer/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
