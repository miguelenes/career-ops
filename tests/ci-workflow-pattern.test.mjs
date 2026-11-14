// tests/ci-workflow-pattern.test.mjs — regression tests for issue #5 (switchboard#484 pattern).
// Verifies CI workflows have:
// 1. Parallel jobs behind one stable aggregate required check
// 2. Dependency caching (setup-node keyed on package-lock.json with restore fallbacks)
// 3. Restored incremental build info (tsc .tsbuildinfo and Next.js cache)
// 4. Per-ref concurrency with cancel-in-progress

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { ROOT } from './helpers.mjs';

test('test.yml has per-ref concurrency with cancel-in-progress', () => {
  const content = readFileSync(join(ROOT, '.github/workflows/test.yml'), 'utf8');
  const wf = load(content);
  assert.match(wf.concurrency.group, /ci-\${{\s*github\.workflow\s*}}-\${{\s*github\.ref\s*}}/);
  assert.match(String(wf.concurrency['cancel-in-progress']), /!startsWith\(github\.ref,\s*'refs\/tags\/'\)/);
});

test('test.yml setup-node steps use npm cache with lockfile dependency path', () => {
  const content = readFileSync(join(ROOT, '.github/workflows/test.yml'), 'utf8');
  const wf = load(content);

  // In test matrix job
  const testSteps = wf.jobs.test.steps;
  const floorStep = testSteps.find((s) => s.name?.includes('Set up the Node floor'));
  assert.ok(floorStep, 'Node floor step exists');
  assert.equal(floorStep.with.cache, 'npm');
  assert.equal(floorStep.with['cache-dependency-path'], 'package-lock.json');

  const node24Step = testSteps.find((s) => s.name?.includes('Set up Node 24'));
  assert.ok(node24Step, 'Node 24 step exists');
  assert.equal(node24Step.with.cache, 'npm');
  assert.equal(node24Step.with['cache-dependency-path'], 'package-lock.json');

  // In upgrade-gate job
  const upgradeSteps = wf.jobs['upgrade-gate'].steps;
  const upgradeNode = upgradeSteps.find((s) => String(s.uses).startsWith('actions/setup-node@'));
  assert.ok(upgradeNode, 'upgrade-gate setup-node exists');
  assert.equal(upgradeNode.with.cache, 'npm');
  assert.equal(upgradeNode.with['cache-dependency-path'], 'package-lock.json');

  // In dependency-audit job
  const auditSteps = wf.jobs['dependency-audit'].steps;
  const auditNode = auditSteps.find((s) => String(s.uses).startsWith('actions/setup-node@'));
  assert.ok(auditNode, 'dependency-audit setup-node exists');
  assert.equal(auditNode.with.cache, 'npm');
  assert.equal(auditNode.with['cache-dependency-path'], 'package-lock.json');
});

test('test.yml has aggregate check job named test requiring test matrix and non-skipped gates', () => {
  const content = readFileSync(join(ROOT, '.github/workflows/test.yml'), 'utf8');
  const wf = load(content);
  const agg = wf.jobs['test-aggregate'];
  assert.ok(agg, 'test-aggregate job exists');
  assert.equal(agg.name, 'test', 'stable required check name is test');
  assert.equal(agg.if, 'always()');
  assert.deepEqual(agg.needs, ['test', 'cv-visual', 'tool-suites', 'upgrade-gate', 'dependency-audit']);
});

test('web-ci.yml has per-ref concurrency with cancel-in-progress', () => {
  const content = readFileSync(join(ROOT, '.github/workflows/web-ci.yml'), 'utf8');
  const wf = load(content);
  assert.match(wf.concurrency.group, /web-ci-\${{\s*github\.workflow\s*}}-\${{\s*github\.ref\s*}}/);
  assert.match(String(wf.concurrency['cancel-in-progress']), /!startsWith\(github\.ref,\s*'refs\/tags\/'\)/);
});

test('web-ci.yml setup-node caches both root and web lockfiles', () => {
  const content = readFileSync(join(ROOT, '.github/workflows/web-ci.yml'), 'utf8');
  const wf = load(content);
  const setupNode = wf.jobs.web.steps.find((s) => String(s.uses).startsWith('actions/setup-node@'));
  assert.ok(setupNode, 'web-ci setup-node exists');
  assert.equal(setupNode.with.cache, 'npm');
  assert.match(setupNode.with['cache-dependency-path'], /package-lock\.json/);
  assert.match(setupNode.with['cache-dependency-path'], /web\/package-lock\.json/);
});

test('web-ci.yml restores incremental build caches for tsc and next.js', () => {
  const content = readFileSync(join(ROOT, '.github/workflows/web-ci.yml'), 'utf8');
  const wf = load(content);
  const cacheSteps = wf.jobs.web.steps.filter((s) => String(s.uses).startsWith('actions/cache@'));
  assert.ok(cacheSteps.length >= 2, 'at least 2 cache steps in web-ci.yml');

  const tscCache = cacheSteps.find((s) => s.with.path === 'web/tsconfig.tsbuildinfo');
  assert.ok(tscCache, 'tsc build info cache step exists');
  assert.match(tscCache.with.key, /^tsc-/);
  assert.ok(tscCache.with['restore-keys'], 'tsc cache has restore-keys fallback');

  const nextCache = cacheSteps.find((s) => s.with.path === 'web/.next/cache');
  assert.ok(nextCache, 'next.js build cache step exists');
  assert.match(nextCache.with.key, /^next-/);
  assert.ok(nextCache.with['restore-keys'], 'next.js cache has restore-keys fallback');
});
