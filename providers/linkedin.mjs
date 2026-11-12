// @ts-check
// Explicit, guest-only sandbox adapter approved by Miguel (2026-11-11 t205).
// Never fetch detail pages, follow redirects, authenticate or bypass challenges.
import { BROWSER_LIKE_USER_AGENT, sleep as sharedSleep } from './_http.mjs';
import { htmlToText } from './_html-to-text.mjs';

const ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const INTERVAL = 5_000;
const COOLDOWN = 15 * 60_000;

export function parseLinkedInGuest(html) {
  const jobs = [];
  const seen = new Set();
  for (const card of html.split(/<li\b[^>]*>/i).slice(1)) {
    const id = card.match(/data-entity-urn=["']urn:li:jobPosting:(\d+)["']/i)?.[1];
    const field = name => htmlToText(card.match(new RegExp(`<[^>]+class=["'][^"']*\\b${name}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i'))?.[1] || '').trim();
    const title = field('base-search-card__title');
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    jobs.push({ title, company: field('base-search-card__subtitle'), location: field('job-search-card__location'), url: `https://www.linkedin.com/jobs/view/${id}` });
  }
  return jobs;
}

// A shared serial queue paces ALL entries, not only pages within one board.
// Injectable clock/sleep keep tests offline and instantaneous.
export function createLinkedInProvider({ now = Date.now, sleep = sharedSleep } = {}) {
  let queue = Promise.resolve();
  let nextRequest = 0;
  let blockedUntil = 0;
  const blocked = (reason, delay = COOLDOWN) => {
    blockedUntil = Math.max(blockedUntil, now() + delay);
    const error = new Error(`linkedin: guest access blocked (${reason}); cooling down`);
    error.code = 'linkedin_guest_blocked';
    return error;
  };
  return {
    id: 'linkedin',
    detect(entry) { return entry?.provider === 'linkedin' ? { url: ENDPOINT } : null; },
    fetch(entry, ctx) {
      const run = async () => {
        const url = new URL(entry.api || entry.careers_url || ENDPOINT);
        if (url.origin !== 'https://www.linkedin.com' || url.pathname !== new URL(ENDPOINT).pathname
          || url.username || url.password || [...url.searchParams.keys()].some(key => !['keywords', 'location', 'geoId', 'f_TPR', 'f_WT'].includes(key))) {
          throw new Error('linkedin: only public guest search queries are supported');
        }
        // One result page per configured query: deliberately no detail fan-out.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (now() < blockedUntil) throw blocked('previous block', blockedUntil - now());
          await sleep(Math.max(0, nextRequest - now()));
          nextRequest = now() + INTERVAL;
          let html;
          try {
            html = await ctx.fetchText(url.href, { redirect: 'manual', headers: { 'User-Agent': BROWSER_LIKE_USER_AGENT } });
          } catch (error) {
            if (error.status === 429) {
              const seconds = Number(error.retryAfter);
              const date = Date.parse(error.retryAfter);
              const delay = Math.max(60_000, Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(date) ? date - now() : 0);
              if (attempt === 0 && delay <= 120_000 && !ctx.maxPages) {
                nextRequest = now() + delay;
                continue;
              }
              throw blocked('HTTP 429', Math.max(COOLDOWN, delay));
            }
            if ((error.status >= 300 && error.status < 400) || [401, 403, 999].includes(error.status)) throw blocked(`HTTP ${error.status}`);
            throw error; // Transport failures get no automatic retry.
          }
          if (/captcha|authwall|checkpoint|sign in to (?:see|view)|security verification/i.test(html)) throw blocked('challenge or login');
          const jobs = parseLinkedInGuest(html);
          if (!jobs.length && html.trim() && !/no (?:matching )?jobs found/i.test(html)) throw blocked('unrecognized guest response');
          return jobs;
        }
        return [];
      };
      const result = queue.then(run);
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
}

// Throwing a bounded provider error lets scan.mjs record the failure normally,
// rather than reporting a block as a successful empty board.
export default createLinkedInProvider();
