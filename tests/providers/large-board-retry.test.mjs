import { test } from 'node:test';
import assert from 'node:assert/strict';
import greenhouse from '../../providers/greenhouse.mjs';
import lever from '../../providers/lever.mjs';
import ashby from '../../providers/ashby.mjs';

for (const [provider, careers_url, payload] of [
  [greenhouse, 'https://job-boards.greenhouse.io/cloudflare', { jobs: [{ title: 'Engineer', absolute_url: 'https://job-boards.greenhouse.io/cloudflare/jobs/123', location: { name: 'Lisboa' } }] }],
  [greenhouse, 'https://job-boards.greenhouse.io/databricks', { jobs: [{ title: 'Engineer', absolute_url: 'https://job-boards.greenhouse.io/databricks/jobs/123', location: { name: 'Lisboa' } }] }],
  [lever, 'https://jobs.lever.co/sumup', [{ text: 'Engineer', hostedUrl: 'https://jobs.lever.co/sumup/abc', categories: {} }]],
  [ashby, 'https://jobs.ashbyhq.com/sumup', { jobs: [{ title: 'Engineer', jobUrl: 'https://jobs.ashbyhq.com/sumup/abc', location: 'Lisboa' }] }],
]) {
  test(`${provider.id} ${careers_url}: timeout retries with a long body budget`, async () => {
    let calls = 0;
    const jobs = await provider.fetch({ name: 'Fixture', careers_url }, { sleep: async () => {}, fetchJson: async (url, opts) => {
      assert.ok(opts.timeoutMs >= 30000);
      assert.equal(opts.redirect, 'error');
      if (++calls === 1) throw new Error('body read timeout');
      return payload;
    } });
    assert.equal(calls, 2);
    assert.equal(jobs.length, 1);
  });
  test(`${provider.id} ${careers_url}: 404 is not retried`, async () => {
    let calls = 0;
    await assert.rejects(provider.fetch({ name: 'Fixture', careers_url }, { sleep: async () => {}, fetchJson: async () => { calls++; throw Object.assign(new Error('gone'), { status: 404 }); } }));
    assert.equal(calls, 1);
  });
}
for (const [provider, careers_url] of [[greenhouse, 'https://job-boards.greenhouse.io/cloudflare'], [lever, 'https://jobs.lever.co/sumup']]) {
  test(`${provider.id}: persistent rate limiting is bounded and honors backoff`, async () => {
    let calls = 0;
    const waits = [];
    await assert.rejects(provider.fetch({ name: 'Fixture', careers_url }, {
      sleep: async ms => { waits.push(ms); },
      fetchJson: async () => { calls++; throw Object.assign(new Error('limited'), { status: 429, retryAfter: '1' }); },
    }));
    assert.equal(calls, 3);
    assert.deepEqual(waits, [1000, 1000]);
  });
  test(`${provider.id}: probe does not spend extra requests on retries`, async () => {
    let calls = 0;
    await assert.rejects(provider.fetch({ name: 'Fixture', careers_url }, { maxPages: 1, fetchJson: async () => { calls++; throw new Error('timeout'); } }));
    assert.equal(calls, 1);
  });
}

for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
  test(`Greenhouse surfaces ${code} immediately to the resolver breaker`, async () => {
    let calls = 0;
    await assert.rejects(greenhouse.fetch({ careers_url: 'https://job-boards.greenhouse.io/cloudflare' }, {
      fetchJson: async () => { calls++; throw Object.assign(new TypeError('fetch failed'), { cause: { code } }); },
    }));
    assert.equal(calls, 1);
  });
}
