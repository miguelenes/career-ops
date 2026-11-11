// End-to-end acceptance uses synthetic files only, never repository user data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';

test('doctor and verify-pipeline pass against a clean synthetic data root', () => {
  const dir = mkdtempSync(join(tmpdir(), 'provider-acceptance-'));
  try {
    for (const folder of ['data', 'config', 'modes', 'reports']) mkdirSync(join(dir, folder));
    writeFileSync(join(dir, 'cv.md'), '# Fixture Candidate\n\n## Experience\n\n### Example Employer — Remote\n\n**Engineer** | 2024–Present\n');
    writeFileSync(join(dir, 'config/profile.yml'), 'candidate:\n  full_name: Fixture Candidate\n');
    writeFileSync(join(dir, 'modes/_profile.md'), '# Targeting\n\nEngineering roles.\n');
    writeFileSync(join(dir, 'portals.yml'), 'title_filter:\n  positive: [Engineer]\ntracked_companies: []\n');
    writeFileSync(join(dir, 'data/applications.md'), '# Applications\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n');
    writeFileSync(join(dir, 'data/pipeline.md'), '# Pipeline\n');
    const env = { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_DATA_DIR: '', CAREER_OPS_TRACKER: '', CAREER_OPS_PORTALS: '', CAREER_OPS_PROFILE: '', CAREER_OPS_PIPELINE: '', CAREER_OPS_SCAN_HISTORY: '', CAREER_OPS_REPORTS: '', CAREER_OPS_CLI: 'codex' };
    const doctor = spawnSync(process.execPath, [join(ROOT, 'doctor.mjs'), '--target', dir, '--json'], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(doctor.status, 0, doctor.stdout + doctor.stderr);
    const health = JSON.parse(doctor.stdout);
    assert.equal(health.onboardingNeeded, false, doctor.stdout);
    assert.deepEqual(health.missing, []);
    const verify = spawnSync(process.execPath, [join(ROOT, 'verify-pipeline.mjs'), '--no-hints'], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
