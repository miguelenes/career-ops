// @ts-check
// job_boards: { name: Indeed PT, provider: indeed-pt }
// Read the public /jobs list only; never fetch /viewjob (robots disallows it).
// No login, challenge bypass, private API or detail fan-out.
import { fetchTextWithRetry } from './_http.mjs';
import { htmlToText } from './_html-to-text.mjs';

const LIST_URL = 'https://pt.indeed.com/jobs';

export function parseIndeedPt(html) {
  const jobs = [];
  // Server-rendered cards: data-jk is Indeed's stable listing key. Card scope
  // keeps company and location attached to the correct opening.
  for (const match of html.matchAll(/<div\b[^>]*class=["'][^"']*\bjob_seen_beacon\b[^"']*["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bjob_seen_beacon\b|$)/gi)) {
    const card = match[1];
    const id = card.match(/\bdata-jk=["']([a-f0-9]+)["']/i)?.[1];
    const title = card.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
    if (!id || !title) continue;
    const text = (field) => htmlToText(card.match(new RegExp(`<[^>]+data-testid=["']${field}["'][^>]*>([\\s\\S]*?)<\\/`, 'i'))?.[1] || '').trim();
    jobs.push({ title: htmlToText(title).trim(), url: `https://pt.indeed.com/viewjob?jk=${id}`, company: text('company-name'), location: text('text-location') });
  }
  if (!jobs.length && !/jobsearch-NoResult|no_results|Não foram encontrad/i.test(html)) {
    throw new Error('indeed-pt: missing public job cards (login or challenge page)');
  }
  return jobs;
}

/** @type {import('./_types.js').Provider} */
export default {
  id: 'indeed-pt',
  detect(entry) { return entry?.provider === 'indeed-pt' ? { url: LIST_URL } : null; },
  async fetch(entry, ctx) {
    const url = new URL(entry.api || entry.careers_url || LIST_URL);
    if (url.origin !== 'https://pt.indeed.com' || url.pathname !== '/jobs' || url.username || url.password
      || [...url.searchParams.keys()].some(key => !['q', 'l'].includes(key))) throw new Error('indeed-pt: only public /jobs queries are supported');
    return parseIndeedPt(await fetchTextWithRetry(ctx, url.href, { redirect: 'error' }, ctx.maxPages ? { retries: 0 } : {}));
  },
};
