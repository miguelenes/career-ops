// tests/plugins-local/laravel-sources.test.mjs — the local provider plugins in
// plugins.local/ (itjobs-pt, himalayas-search, symfony-jobs, net-empregos,
// larajobs-html, arc-dev). Parsers run on trimmed real responses in
// tests/fixtures/plugins-local/; fetch() runs against a fake ctx.fetch, so
// nothing here touches the network.
import { pass, fail, ROOT } from '../helpers.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { DEFAULT_USER_AGENT } from '../../user-agent.mjs';

console.log('\nplugins.local — Laravel/PHP job sources');

const FIX = join(ROOT, 'tests', 'fixtures', 'plugins-local');
const fixture = (name) => readFileSync(join(FIX, name));
const load = (id) => import(pathToFileURL(join(ROOT, 'plugins.local', id, 'index.mjs')).href);

function check(label, ok, detail) {
  if (ok) pass(label);
  else fail(`${label}${detail === undefined ? '' : ` — got ${JSON.stringify(detail)}`}`);
}

/** A ctx whose fetch answers from `route(url)` and records each call. */
function fakeCtx(route) {
  const calls = [];
  return {
    calls,
    async fetch(url, opts = {}) {
      calls.push({ url, headers: opts.headers || {} });
      const body = route(url);
      if (body === undefined) throw new Error(`unexpected URL ${url}`);
      return new Response(body);
    },
  };
}

async function suite(name, fn) {
  try { await fn(); } catch (err) { fail(`${name}: threw ${err.stack || err.message}`); }
}

await suite('itjobs-pt', async () => {
  const mod = await load('itjobs-pt');
  const jobs = mod.parseItjobsFeed(fixture('itjobs-php.xml').toString('utf8'));
  check('itjobs-pt: parses every item', jobs.length === 3, jobs.length);
  check('itjobs-pt: company from Empresa, city + work model as location', jobs[0].company === 'Dellent' && jobs[0].location === 'Porto, Portugal (Remoto)', jobs[0]);
  check('itjobs-pt: "Anónimo" company and "n/d" city are left blank', jobs[1].company === '' && jobs[1].location === 'Portugal (Remoto)', jobs[1]);
  check('itjobs-pt: offer URL and pubDate kept', /^https:\/\/www\.itjobs\.pt\/oferta\/\d+\//.test(jobs[2].url) && Number.isFinite(jobs[2].postedAt), jobs[2]);
  check('itjobs-pt: "n/d" salary is not a salary', jobs.every((j) => j.salary === undefined));

  const desc = 'Empresa: Acme<br />Localidade: Lisboa<br />Modelo de trabalho: Híbrido<br />Salário anual: 30.000€ - 40.000€';
  const one = mod.parseItjobsFeed(`<rss><channel><item><title>PHP Dev</title><link>https://www.itjobs.pt/oferta/1/php</link><description><![CDATA[${desc}]]></description></item></channel></rss>`);
  check('itjobs-pt: annual salary read from "Salário anual"', one[0]?.salary?.min === 30000 && one[0]?.salary?.max === 40000 && one[0]?.salary?.currency === 'EUR', one[0]);

  const xml = fixture('itjobs-php.xml');
  const ctx = fakeCtx((u) => (u.startsWith('https://feeds.itjobs.pt/feed/emprego?q=') ? xml : undefined));
  const fetched = await mod.default.provider.fetch({ name: 'ITJobs.pt', provider: 'itjobs-pt' }, ctx);
  check('itjobs-pt: default keywords are laravel and php', ctx.calls.map((c) => c.url.split('q=')[1]).join(',') === 'laravel,php', ctx.calls.map((c) => c.url));
  check('itjobs-pt: same offer under two keywords is returned once', fetched.length === 3, fetched.length);
  check('itjobs-pt: sends the scanner user-agent', ctx.calls.every((c) => c.headers['User-Agent'] === DEFAULT_USER_AGENT));
});

await suite('symfony-jobs', async () => {
  const mod = await load('symfony-jobs');
  check('symfony-jobs: "X at Y" splits on the last " at "', JSON.stringify(mod.splitTitle('Look at This at Acme Corp')) === JSON.stringify({ title: 'Look at This', company: 'Acme Corp' }));
  check('symfony-jobs: a title without " at " keeps the whole title', mod.splitTitle('Symfony Developer').company === '');
  const jobs = mod.parseSymfonyFeed(fixture('symfony.xml').toString('utf8'));
  const j = jobs[0] || {};
  check('symfony-jobs: parses every item', jobs.length === 2, jobs.length);
  check('symfony-jobs: title and company split', j.title === 'Backend Symfony Developer' && j.company === 'Hays', j);
  check('symfony-jobs: location stops at the end of its paragraph', j.location === 'Remote + part-time onsite (Madrid, Spain)', j.location);
  check('symfony-jobs: annual salary from the Salary line', j.salary?.min === 50000 && j.salary?.max === 55000 && j.salary?.currency === 'EUR', j.salary);
  check('symfony-jobs: job URL on symfony.com', /^https:\/\/symfony\.com\/jobs\/[0-9a-f]+$/.test(j.url), j.url);
});

await suite('net-empregos', async () => {
  const mod = await load('net-empregos');
  const ctx = fakeCtx((u) => (u === 'https://www.net-empregos.com/rssfeed.asp' ? fixture('net-empregos.xml') : undefined));
  const all = await mod.default.provider.fetch({ name: 'Net-Empregos', provider: 'net-empregos' }, ctx);
  check('net-empregos: parses every item', all.length === 3, all.length);
  check('net-empregos: ISO-8859-1 body decoded (no replacement characters)', all.every((j) => !/\uFFFD/.test(JSON.stringify(j))), all);
  check('net-empregos: company and Zona read from the encoded description', all[0].company === 'JUVEX4' && all[0].location === 'Setubal, Portugal', all[0]);
  const it = await mod.default.provider.fetch({ name: 'Net-Empregos', provider: 'net-empregos', categories: ['informática'] }, ctx);
  check('net-empregos: categories keeps only matching postings', it.length === 1 && it[0].title === 'Field Support (m/f) Oeiras', it);
});

await suite('larajobs-html', async () => {
  const mod = await load('larajobs-html');
  const jobs = mod.parseLarajobsHome(fixture('larajobs-home.html').toString('utf8'));
  check('larajobs-html: one job per card', jobs.length === 2, jobs.length);
  check('larajobs-html: title, company, location from the card', jobs[0].title === 'Senior Laravel Developer' && jobs[0].company === 'Shout About Us' && jobs[0].location === 'Remote (3 to 4 hours overlap with US Pacific)', jobs[0]);
  check('larajobs-html: URL is the /job/<id> link the RSS feed uses', jobs[1].url === 'https://larajobs.com/job/3949', jobs[1].url);
  let threw = false;
  try { await mod.default.provider.fetch({}, fakeCtx(() => '<html><body>maintenance</body></html>')); } catch { threw = true; }
  check('larajobs-html: a page with no job cards is an error, not a silent zero', threw);
});

await suite('himalayas-search', async () => {
  const mod = await load('himalayas-search');
  const page1 = JSON.parse(fixture('himalayas-search-p1.json').toString('utf8'));
  check('himalayas-search: max_pages defaults to 5 and is capped at 20', mod.pageLimit(undefined) === 5 && mod.pageLimit(99) === 20 && mod.pageLimit(3) === 3);
  check('himalayas-search: a short page ends the walk', !mod.hasNextPage({ jobs: page1.jobs.slice(0, 5), totalCount: 325 }, 1));
  check('himalayas-search: reaching totalCount ends the walk', !mod.hasNextPage({ jobs: page1.jobs, totalCount: 40 }, 2) && mod.hasNextPage(page1, 1));

  const relink = (jobs, n) => jobs.map((j, i) => ({ ...j, applicationLink: `https://himalayas.app/companies/x/jobs/p${n}-${i}`, guid: `g${n}-${i}` }));
  const pages = { 1: page1, 2: { ...page1, jobs: relink(page1.jobs, 2) }, 3: { ...page1, jobs: relink(page1.jobs.slice(0, 5), 3) } };
  const ctx = fakeCtx((u) => {
    const m = u.match(/^https:\/\/himalayas\.app\/jobs\/api\/search\?q=laravel&page=(\d+)$/);
    return m && pages[m[1]] ? JSON.stringify(pages[m[1]]) : undefined;
  });
  const jobs = await mod.default.provider.fetch({ name: 'Himalayas (laravel)', provider: 'himalayas-search' }, ctx);
  check('himalayas-search: walks pages until a short one', ctx.calls.length === 3 && jobs.length === 45, { calls: ctx.calls.length, jobs: jobs.length });
  check('himalayas-search: jobs carry title, company and URL', jobs.every((j) => j.title && j.company && /^https:\/\//.test(j.url)));

  const capped = fakeCtx((u) => (u.includes('page=') ? JSON.stringify(page1) : undefined));
  await mod.default.provider.fetch({ provider: 'himalayas-search', max_pages: 2 }, capped);
  check('himalayas-search: max_pages bounds the requests', capped.calls.length === 2, capped.calls.length);
});

await suite('arc-dev', async () => {
  const mod = await load('arc-dev');
  const jobs = mod.parseArcPage(fixture('arc-laravel.html').toString('utf8'));
  check('arc-dev: jobs read from __NEXT_DATA__', jobs.length === 2, jobs.length);
  check('arc-dev: job URL is /remote-jobs/j/<slug>-<key>', jobs[0].url === 'https://arc.dev/remote-jobs/j/resource-innovations-senior-software-engineer-osenibm4gb', jobs[0].url);
  check('arc-dev: company, country list and posted time', jobs[0].company === 'Resource Innovations' && jobs[0].location === 'Remote (US, CO, IL, CA, AZ)' && jobs[0].postedAt === 1793146817000, jobs[0]);
  let threw = false;
  try { mod.parseArcPage('<html></html>'); } catch { threw = true; }
  check('arc-dev: a page without __NEXT_DATA__ is an error', threw);
});
