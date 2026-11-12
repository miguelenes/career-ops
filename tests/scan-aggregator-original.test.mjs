import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

test('scan publishes only live aggregator originals and retries uncertain originals next run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aggregator-original-'));
  try {
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/applications.md'), '# Applications\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n');
    writeFileSync(join(dir, 'data/pipeline.md'), '# Pipeline\n');
    const portals = join(dir, 'fixture.yml');
    writeFileSync(portals, 'title_filter:\n  positive: [Engineer]\ntracked_companies:\n  - name: Fixture Feed\n    aggregator: true\n    careers_url: https://example.com/jobs\n    parser:\n      command: node\n      script: tests/fixtures/aggregator-original-board.mjs\n');
    // Fetch the same syndicated opening concurrently through another feed.
    writeFileSync(portals, readFileSync(portals, 'utf8') + '  - name: Second Feed\n    aggregator: true\n    careers_url: https://example.com/second\n    parser:\n      command: node\n      script: tests/fixtures/aggregator-original-board.mjs\n');
    const env = { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_DATA_DIR: '', CAREER_OPS_PORTALS: portals, CAREER_OPS_TRACKER: '', CAREER_OPS_PIPELINE: '', CAREER_OPS_SCAN_HISTORY: '' };
    for (let run = 0; run < 2; run++) {
      const result = spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'tests/fixtures/aggregator-original-fetch.mjs')).href, join(ROOT, 'scan.mjs')], { cwd: ROOT, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Deferred aggregator posting \(expired\)/);
      assert.match(result.stdout, /Deferred aggregator posting \(uncertain\)/);
    }
    const pipeline = readFileSync(join(dir, 'data/pipeline.md'), 'utf8');
    assert.equal((pipeline.match(/Engineer active/g) || []).length, 1, pipeline);
    assert.doesNotMatch(pipeline, /Engineer (expired|uncertain)/);
    const history = join(dir, 'data/scan-history.tsv');
    assert.ok(existsSync(history));
    assert.doesNotMatch(readFileSync(history, 'utf8'), /Engineer (expired|uncertain)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
