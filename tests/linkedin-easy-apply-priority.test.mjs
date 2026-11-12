// tests/linkedin-easy-apply-priority.test.mjs — LinkedIn source priority.
//
// Three pieces, all offline: scan.mjs tags LinkedIn rows it adds with
// `easy_apply: yes|unknown`, rank-pipeline.mjs --order breaks score ties with
// that tag (never overriding a higher score), and scan.mjs --list-queries puts
// `priority`/`source: linkedin` queries first. None of it applies anywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, NODE } from './helpers.mjs';
import {
  easyApplyPolicy, detectEasyApply, tagEasyApply, formatPipelineOffer, orderSearchQueries, parseBlacklist,
} from '../scan.mjs';
import { orderForPreparation } from '../rank-pipeline.mjs';

const fixture = name => readFileSync(join(ROOT, 'tests', 'fixtures', name), 'utf8');
const WITH_LABEL = fixture('linkedin-job-easy-apply.html');
const WITHOUT_LABEL = fixture('linkedin-job-no-easy-apply.html');
const LI = 'https://www.linkedin.com/jobs/view/4100000001/';
const ON = { enabled: true };

const PORTALS = `title_filter:
  positive: ["Engineering Manager"]
source_priority:
  order: [linkedin, ats, job_boards, other_websearch]
  linkedin:
    easy_apply:
      prefer: true
      priority_boost: 0.25
search_queries:
  - name: Generic board
    query: 'site:example.test "Engineering Manager"'
    enabled: true
  - name: ATS
    query: 'site:jobs.ashbyhq.com "Engineering Manager"'
    source: ats
    priority: 2
    enabled: true
  - name: LinkedIn disabled
    query: 'site:linkedin.com/jobs/view "CTO"'
    source: linkedin
    priority: 1
    enabled: false
  - name: LinkedIn
    query: 'site:linkedin.com/jobs/view "Engineering Manager"'
    source: linkedin
    priority: 1
    enabled: true
`;
const PROFILE = `scan:
  primary_source: linkedin
  linkedin_easy_apply:
    prefer: true
    priority_boost: 0.25
`;
const BLACKLIST = `| Company | Since | Scope | Reason |
|---------|-------|-------|--------|
| Blocked Corp | 2026-10-31 | company | fixture |
`;

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'linkedin-priority-'));
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, 'portals.yml'), PORTALS);
  writeFileSync(join(root, 'config', 'profile.yml'), PROFILE);
  writeFileSync(join(root, 'data', 'blacklist.md'), BLACKLIST);
  writeFileSync(join(root, 'tests-page-yes.html'), WITH_LABEL);
  writeFileSync(join(root, 'tests-page-no.html'), WITHOUT_LABEL);
  const env = {
    ...process.env,
    CAREER_OPS_ROOT: root,
    CAREER_OPS_PORTALS: join(root, 'portals.yml'),
    CAREER_OPS_PROFILE: join(root, 'config', 'profile.yml'),
    CAREER_OPS_PIPELINE: join(root, 'data', 'pipeline.md'),
    CAREER_OPS_SCAN_HISTORY: join(root, 'data', 'scan-history.tsv'),
  };
  const run = (...args) => spawnSync(NODE, [join(ROOT, 'scan.mjs'), ...args], { env, cwd: root, encoding: 'utf8' });
  return { root, run, pipeline: () => (existsSync(env.CAREER_OPS_PIPELINE) ? readFileSync(env.CAREER_OPS_PIPELINE, 'utf8') : '') };
}

// ── 1. easy_apply tag on LinkedIn rows ──

test('policy reads portals.yml source_priority and profile.yml scan.linkedin_easy_apply', () => {
  const portals = { source_priority: { linkedin: { easy_apply: { prefer: true } } } };
  const profile = { scan: { linkedin_easy_apply: { prefer: true } } };
  assert.equal(easyApplyPolicy(portals, profile).enabled, true);
  assert.equal(easyApplyPolicy(portals, {}).enabled, true);
  assert.equal(easyApplyPolicy({}, profile).enabled, true);
  assert.equal(easyApplyPolicy({}, {}).enabled, false);
  assert.equal(easyApplyPolicy(portals, { scan: { linkedin_easy_apply: { prefer: false } } }).enabled, false);
});

test('fixture with the Easy Apply label gets yes, without it gets unknown', () => {
  assert.equal(detectEasyApply(WITH_LABEL), 'yes');
  assert.equal(detectEasyApply(WITHOUT_LABEL), 'unknown');
  assert.match(formatPipelineOffer(tagEasyApply({ url: LI, company: 'Fixture Labs', title: 'Engineering Manager' }, WITH_LABEL, ON)),
    /\| easy_apply: yes$/);
  assert.match(formatPipelineOffer(tagEasyApply({ url: LI, company: 'Fixture Labs', title: 'Engineering Manager' }, WITHOUT_LABEL, ON)),
    /\| easy_apply: unknown$/);
});

test('Easy Apply and experience labels coexist on LinkedIn rows', () => {
  const offer = { url: LI, company: 'Fixture Labs', title: 'Engineering Manager', easy_apply: 'yes', years: { label: '5+' }, note: 'review' };
  assert.match(formatPipelineOffer(offer), /\| easy_apply: yes \| yrs: 5\+ \| note: review$/);
  assert.doesNotMatch(formatPipelineOffer({ ...offer, url: 'https://example.com/job' }), /easy_apply:/);
});

test('non-LinkedIn rows and a disabled policy stay byte-identical', () => {
  const ats = { url: 'https://jobs.ashbyhq.com/fixture/1', company: 'Fixture Labs', title: 'Engineering Manager' };
  assert.equal(formatPipelineOffer(tagEasyApply(ats, WITH_LABEL, ON)), formatPipelineOffer(ats));
  assert.equal(formatPipelineOffer({ ...ats, easy_apply: 'yes' }), formatPipelineOffer(ats));
  const li = { url: LI, company: 'Fixture Labs', title: 'Engineering Manager' };
  assert.equal(formatPipelineOffer(tagEasyApply(li, WITH_LABEL, { enabled: false })), formatPipelineOffer(li));
});

test('scan.mjs --add-linkedin writes the tag and still honours the blacklist', () => {
  const { root, run, pipeline } = sandbox();
  try {
    let r = run('--add-linkedin', 'https://www.linkedin.com/jobs/view/4100000001/', '--company', 'Fixture Labs',
      '--title', 'Engineering Manager', '--location', 'Lisbon, Portugal', '--page', 'tests-page-yes.html');
    assert.equal(r.status, 0, r.stderr);
    r = run('--add-linkedin', 'https://www.linkedin.com/jobs/view/4100000002/', '--company', 'Other Labs',
      '--title', 'Engineering Manager', '--page', 'tests-page-no.html');
    assert.equal(r.status, 0, r.stderr);
    r = run('--add-linkedin', 'https://www.linkedin.com/jobs/view/4100000003/', '--company', 'Blocked Corp',
      '--title', 'Engineering Manager', '--page', 'tests-page-yes.html');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Not added: 1 blacklisted/);

    const text = pipeline();
    assert.match(text, /4100000001\/ \| Fixture Labs \| Engineering Manager \| Lisbon, Portugal \| easy_apply: yes\n/);
    assert.match(text, /4100000002\/ \| Other Labs \| Engineering Manager \| easy_apply: unknown\n/);
    assert.doesNotMatch(text, /Blocked Corp/);

    r = run('--add-linkedin', 'https://jobs.ashbyhq.com/fixture/1', '--company', 'X', '--title', 'Engineering Manager');
    assert.equal(r.status, 1, 'only LinkedIn job URLs are accepted');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 2. preparation order ──

test('equal scores: Easy Apply first, then newest LinkedIn posting', () => {
  const text = [
    '## Pending',
    '- [ ] https://www.linkedin.com/jobs/view/1/ | A | EM | posted: 2026-10-20 | easy_apply: unknown | rank: 4.2/5 — fit',
    '- [ ] https://www.linkedin.com/jobs/view/2/ | B | EM | posted: 2026-10-01 | easy_apply: yes | rank: 4.2/5 — fit',
    '- [ ] https://www.linkedin.com/jobs/view/3/ | C | EM | posted: 2026-10-28 | easy_apply: unknown | rank: 4.2/5 — fit',
  ].join('\n');
  assert.deepEqual(orderForPreparation(text).map(e => e.company), ['B', 'C', 'A']);
});

test('a 3.9 Easy Apply row never moves above a 4.0 row', () => {
  const text = [
    '- [ ] https://www.linkedin.com/jobs/view/1/ | Low | EM | easy_apply: yes | rank: 3.9/5 — close',
    '- [ ] https://jobs.ashbyhq.com/x/2 | High | EM | rank: 4.0/5 — fit',
  ].join('\n');
  assert.deepEqual(orderForPreparation(text).map(e => e.company), ['High', 'Low']);
});

test('blacklist, dealbreaker and processed rows are excluded', () => {
  const text = [
    '- [ ] https://www.linkedin.com/jobs/view/1/ | Blocked Corp | EM | easy_apply: yes | rank: 4.8/5 — fit',
    '- [ ] https://www.linkedin.com/jobs/view/2/ | Hands Off | Director | easy_apply: yes | rank: 4.5/5 — dealbreaker: hands-off role',
    '- [x] SKIP | https://www.linkedin.com/jobs/view/3/ | Skipped | EM | N/A | PDF ❌',
    '- [ ] https://www.linkedin.com/jobs/view/4/ | Kept | EM | easy_apply: unknown | rank: 4.1/5 — fit',
    '- [ ] https://www.linkedin.com/jobs/view/5/ | Unranked | EM | easy_apply: yes',
  ].join('\n');
  assert.deepEqual(orderForPreparation(text, parseBlacklist(BLACKLIST)).map(e => e.company), ['Kept']);
});

// ── 3. query order ──

test('search queries run in priority order, source: linkedin first', () => {
  const queries = [
    { name: 'board', query: 'q1', enabled: true },
    { name: 'ats', query: 'q2', source: 'ats', priority: 2 },
    { name: 'li-off', query: 'q3', source: 'linkedin', priority: 1, enabled: false },
    { name: 'li', query: 'q4', source: 'linkedin', priority: 1 },
    { name: 'li-unprioritised', query: 'q5', source: 'linkedin' },
  ];
  assert.deepEqual(orderSearchQueries(queries, ['linkedin', 'ats']).map(q => q.name), ['li', 'ats', 'li-unprioritised', 'board']);
});

test('scan.mjs --list-queries prints LinkedIn queries first and skips disabled ones', () => {
  const { root, run } = sandbox();
  try {
    const r = run('--list-queries');
    assert.equal(r.status, 0, r.stderr);
    const names = r.stdout.trim().split('\n').map(l => l.split('\t')[2]);
    assert.deepEqual(names, ['LinkedIn', 'ATS', 'Generic board']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 4. nothing here applies ──

test('the new code paths never submit, click or fetch', () => {
  const scan = readFileSync(join(ROOT, 'scan.mjs'), 'utf8');
  const start = scan.indexOf('async function runLinkedInPriorityCommand');
  const body = scan.slice(start, scan.indexOf('\nasync function main()', start));
  const rank = readFileSync(join(ROOT, 'rank-pipeline.mjs'), 'utf8');
  const order = rank.slice(rank.indexOf('export function orderForPreparation'), rank.indexOf('/** Respects --limit'));
  for (const src of [body, order]) {
    assert.ok(src.length > 200);
    assert.doesNotMatch(src, /\bfetch\(|\.click\(|\.submit\(|requestSubmit|chromium|playwright/i);
  }
});
