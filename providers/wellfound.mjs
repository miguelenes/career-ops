// @ts-check
// job_boards: { name: Wellfound, provider: wellfound }
// Public /jobs landing page only. No /search, /_jobs, auth or GraphQL requests.
// robots.txt User-agent:* permits /jobs (checked 2026-11-11).
import { fetchTextWithRetry } from './_http.mjs';

const URL_JOBS = 'https://wellfound.com/jobs';

export function parseWellfound(html) {
  const match = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('wellfound: missing public listing data (login or challenge page)');
  const data = JSON.parse(match[1])?.props?.pageProps?.apolloState?.data;
  if (!data || typeof data !== 'object') throw new Error('wellfound: missing Apollo listing data');
  const jobs = [];
  for (const row of Object.values(data)) {
    if (row?.__typename !== 'JobListing' || typeof row.title !== 'string' || !row.title.trim()) continue;
    if (!/^\d+$/.test(String(row.id)) || typeof row.slug !== 'string' || !/^[a-z0-9-]+$/i.test(row.slug)) continue;
    const startup = data[row.startup?.__ref];
    jobs.push({
      title: row.title.trim(), url: `https://wellfound.com/jobs/${row.id}-${row.slug}`,
      company: typeof startup?.name === 'string' ? startup.name.trim() : '',
      location: Array.isArray(row.locationNames) ? row.locationNames.filter(v => typeof v === 'string').join(', ') : '',
      ...(Number.isFinite(row.liveStartAt) ? { postedAt: row.liveStartAt * 1000 } : {}),
    });
  }
  return jobs;
}

/** @type {import('./_types.js').Provider} */
export default {
  id: 'wellfound',
  detect(entry) { return entry?.provider === 'wellfound' ? { url: URL_JOBS } : null; },
  async fetch(entry, ctx) {
    // Even explicit selection may not smuggle in a different host/path.
    for (const raw of [entry.api, entry.careers_url].filter(Boolean)) {
      const url = new URL(raw);
      if (url.href !== URL_JOBS && url.href !== `${URL_JOBS}/`) throw new Error('wellfound: only public /jobs is supported');
    }
    return parseWellfound(await fetchTextWithRetry(ctx, URL_JOBS, { redirect: 'error' }, ctx.maxPages ? { retries: 0 } : {}));
  },
};
