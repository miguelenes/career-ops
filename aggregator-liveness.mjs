// Aggregator timestamps can outlive an employer's posting. Uncertain originals
// are deferred without poisoning scan-history, so a later scan can try again.
import { checkLivenessViaApi } from './liveness-api.mjs';
import { classifyLiveness } from './liveness-core.mjs';
import { htmlToText } from './providers/_html-to-text.mjs';

export async function checkAggregatorOriginal(job, { ctx, checkApi = checkLivenessViaApi } = {}) {
  const raw = job.originalUrl;
  if (!raw) return { result: 'uncertain', code: 'missing_original' };
  let url;
  try {
    url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid original');
  } catch {
    return { result: 'uncertain', code: 'invalid_original' };
  }
  try {
    const api = await checkApi(url.href);
    if (api) return api;
    // The shared transport rejects private IPs and redirects and bounds the body.
    const body = await ctx.fetchText(url.href, { redirect: 'error', timeoutMs: 15_000 });
    return classifyLiveness({ status: 200, requestedUrl: url.href, finalUrl: url.href, bodyText: htmlToText(body) });
  } catch (err) {
    return err?.status === 404 || err?.status === 410
      ? { result: 'expired', code: 'http_gone' }
      : { result: 'uncertain', code: 'original_unreachable' };
  }
}
