import { test } from 'node:test';
import assert from 'node:assert/strict';
import wellfound from '../../providers/wellfound.mjs';
import indeed from '../../providers/indeed-pt.mjs';

const data = { props: { pageProps: { apolloState: { data: {
  'JobListing:123': { __typename: 'JobListing', id: '123', slug: 'staff-engineer', title: 'Staff Engineer', startup: { __ref: 'Startup:1' }, locationNames: ['Remote'], liveStartAt: 1794355200 },
  'Startup:1': { name: 'Fixture Employer' },
} } } } };
const wellfoundHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
const indeedHtml = '<div class="job_seen_beacon"><h2><a data-jk="abcdef123">Staff Engineer</a></h2><span data-testid="company-name">Fixture Employer</span><div data-testid="text-location">Lisboa</div></div>';
for (const [provider, html] of [[wellfound, wellfoundHtml], [indeed, indeedHtml]]) {
  test(`${provider.id}: explicit detection, fixture extraction and pinned request`, async () => {
    assert.ok(provider.detect({ provider: provider.id }));
    assert.equal(provider.detect({ provider: 'other' }), null);
    const calls = [];
    const jobs = await provider.fetch({ provider: provider.id }, { fetchText: async (url, opts) => { calls.push(url); assert.equal(opts.redirect, 'error'); return html; } });
    assert.equal(calls.length, 1);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].title, 'Staff Engineer');
    assert.equal(jobs[0].company, 'Fixture Employer');
    assert.match(jobs[0].url, /^https:\/\//);
  });
  test(`${provider.id}: rejects unsafe URLs before requests`, async () => {
    for (const api of ['http://localhost/jobs', 'https://evil.test/jobs', 'https://wellfound.com/search', 'https://pt.indeed.com/viewjob?jk=123']) {
      let calls = 0;
      await assert.rejects(provider.fetch({ api }, { fetchText: async () => { calls++; return html; } }));
      assert.equal(calls, 0);
    }
  });
  test(`${provider.id}: challenge and malformed payload are failures, not empty boards`, async () => {
    await assert.rejects(provider.fetch({}, { fetchText: async () => '<h1>Verify you are human</h1>' }));
  });
}
test('Wellfound ignores malformed/unsafe posting IDs and slugs', async () => {
  const bad = structuredClone(data);
  bad.props.pageProps.apolloState.data['JobListing:123'].slug = '../auth';
  assert.deepEqual(await wellfound.fetch({}, { fetchText: async () => `<script id="__NEXT_DATA__">${JSON.stringify(bad)}</script>` }), []);
});
