import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import provider, { createLinkedInProvider, parseLinkedInGuest } from '../../providers/linkedin.mjs';
const html = readFileSync(new URL('../fixtures/linkedin/guest.html', import.meta.url), 'utf8');
const entry = { provider: 'linkedin' };
function harness(responses) {
  let time = 1_000;
  const waits = [], calls = [];
  const p = createLinkedInProvider({ now: () => time, sleep: async ms => { waits.push(ms); time += ms; } });
  const ctx = { fetchText: async (url, opts) => {
    calls.push({ url, opts });
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.equal(typeof response, 'string', 'unexpected request');
    return response;
  } };
  return { p, ctx, waits, calls };
}
const httpError = (status, retryAfter) => Object.assign(new Error('fixture HTTP failure'), { status, retryAfter });

test('guest cards preserve employer, title and location; output URLs contain no tracking', () => {
  assert.deepEqual(parseLinkedInGuest(html + html), [
    { title: 'AI & Data Engineer', company: 'Example Employer', location: 'Lisbon, Portugal', url: 'https://www.linkedin.com/jobs/view/123456' },
    { title: 'Platform Engineer', company: 'Second Employer', location: 'Remote', url: 'https://www.linkedin.com/jobs/view/789012' },
  ]);
  assert.equal(provider.detect({ careers_url: 'https://www.linkedin.com/jobs' }), null);
  assert.ok(provider.detect(entry));
});

test('concurrent queries are serialized and spaced; only guest endpoint and browser UA sent', async () => {
  const { p, ctx, waits, calls } = harness([html, html]);
  await Promise.all([p.fetch(entry, ctx), p.fetch(entry, ctx)]);
  assert.deepEqual(waits, [0, 5000]);
  for (const { url, opts } of calls) {
    assert.match(url, /^https:\/\/www.linkedin.com\/jobs-guest\/jobs\/api\/seeMoreJobPostings\/search$/);
    assert.equal(opts.redirect, 'manual');
    assert.deepEqual(Object.keys(opts.headers), ['User-Agent']);
    assert.match(opts.headers['User-Agent'], /Mozilla\/5.0.*Chrome\//);
  }
});

test('429 retries once after at least a minute and honors Retry-After', async () => {
  for (const retryAfter of ['90', new Date(91_000).toUTCString(), undefined]) {
    const { p, ctx, waits, calls } = harness([httpError(429, retryAfter), html]);
    assert.equal((await p.fetch(entry, ctx)).length, 2);
    assert.equal(calls.length, 2);
    assert.ok(waits[1] >= 60_000);
    if (retryAfter) assert.equal(waits[1], 90_000);
  }
});

test('repeated 429, long Retry-After and probes fail soft and suppress subsequent entries', async () => {
  for (const [responses, extra] of [
    [[httpError(429), httpError(429)], {}],
    [[httpError(429, '3600')], {}],
    [[httpError(429)], { maxPages: 1 }],
  ]) {
    const { p, ctx, calls } = harness(responses.slice());
    Object.assign(ctx, extra);
    await assert.rejects(p.fetch(entry, ctx), { code: 'linkedin_guest_blocked' });
    await assert.rejects(p.fetch(entry, ctx), { code: 'linkedin_guest_blocked' });
    assert.equal(calls.length, responses.length);
  }
});

test('HTTP blocks, redirects, challenge and unexpected HTML are recorded as errors without retry', async () => {
  for (const response of [httpError(302), httpError(401), httpError(403), httpError(999), '<html>captcha</html>', '<html>authwall</html>', '<html>unexpected</html>']) {
    const { p, ctx, calls } = harness([response]);
    await assert.rejects(p.fetch(entry, ctx), { code: 'linkedin_guest_blocked' });
    await assert.rejects(p.fetch(entry, ctx), { code: 'linkedin_guest_blocked' });
    assert.equal(calls.length, 1);
  }
});

test('empty results succeed and transport errors are never retried', async () => {
  for (const response of ['', '<div>No jobs found</div>']) {
    const { p, ctx } = harness([response]);
    assert.deepEqual(await p.fetch(entry, ctx), []);
  }
  const { p, ctx, calls } = harness([new Error('timeout')]);
  await assert.rejects(p.fetch(entry, ctx), /timeout/);
  assert.equal(calls.length, 1);
});

test('rejects non-guest, credentialed, pagination and unrecognized query URLs before network', async () => {
  const { p, ctx, calls } = harness([]);
  for (const url of ['https://www.linkedin.com/jobs', 'https://evil.example/jobs-guest/jobs/api/seeMoreJobPostings/search', 'https://user:pass@www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search', `${provider.detect(entry).url}?start=25`]) {
    await assert.rejects(p.fetch({ ...entry, api: url }, ctx), /only public guest/);
  }
  assert.equal(calls.length, 0);
});

test('cooldown expires and a failed query does not poison the serial queue', async () => {
  let time = 1000;
  let calls = 0;
  const p = createLinkedInProvider({ now: () => time, sleep: async ms => { time += ms; } });
  const ctx = { fetchText: async () => { if (++calls === 1) throw httpError(403); return html; } };
  await assert.rejects(p.fetch(entry, ctx), { code: 'linkedin_guest_blocked' });
  time += 15 * 60_000;
  assert.equal((await p.fetch(entry, ctx)).length, 2);
  assert.equal(calls, 2);
});

test('configured guest search parameters pass through without fetching returned links', async () => {
  const { p, ctx, calls } = harness([html]);
  const url = `${provider.detect(entry).url}?keywords=AI%20Engineer&location=Portugal&f_WT=2`;
  await p.fetch({ ...entry, api: url }, ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, url);
});
