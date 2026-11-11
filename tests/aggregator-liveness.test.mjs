import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAggregatorOriginal } from '../aggregator-liveness.mjs';
import { parseHimalayasResponse } from '../providers/himalayas.mjs';

const originalUrl = 'https://job-boards.greenhouse.io/acme/jobs/123';
test('Himalayas prefers the original employer URL', () => {
  const [job] = parseHimalayasResponse({ jobs: [{ title: 'Engineer', companyName: 'Acme', applicationLink: originalUrl, guid: 'https://himalayas.app/jobs/copy' }] });
  assert.equal(job.url, originalUrl);
  assert.equal(job.originalUrl, originalUrl);
});
for (const result of ['active', 'expired', 'uncertain']) {
  test(`employer API ${result} verdict governs aggregator eligibility`, async () => {
    const verdict = await checkAggregatorOriginal({ originalUrl }, { checkApi: async () => ({ result }), ctx: { fetchText() { throw new Error('unexpected fallback'); } } });
    assert.equal(verdict.result, result);
  });
}
test('missing original, transport errors and unsupported schemes stay uncertain', async () => {
  assert.equal((await checkAggregatorOriginal({})).result, 'uncertain');
  assert.equal((await checkAggregatorOriginal({ originalUrl: 'http://localhost' })).result, 'uncertain');
  assert.equal((await checkAggregatorOriginal({ originalUrl }, { checkApi: async () => { throw new Error('timeout'); } })).result, 'uncertain');
});
test('generic employer closure and HTTP gone are expired; rate limiting is uncertain', async () => {
  for (const status of [404, 410, 429]) {
    const verdict = await checkAggregatorOriginal({ originalUrl }, { checkApi: async () => null, ctx: { fetchText: async () => { throw Object.assign(new Error('HTTP'), { status }); } } });
    assert.equal(verdict.result, status === 429 ? 'uncertain' : 'expired');
  }
  const verdict = await checkAggregatorOriginal({ originalUrl }, { checkApi: async () => null, ctx: { fetchText: async () => '<p>This job is no longer available.</p>' } });
  assert.equal(verdict.result, 'expired');
});
