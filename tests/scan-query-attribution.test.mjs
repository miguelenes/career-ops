import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPipelineOffer, formatScanHistoryRow } from '../scan.mjs';
import { parseScanHistoryLine, SCAN_HISTORY_COLUMNS } from '../lib/scan-history-columns.mjs';

test('named search is recorded in both output formats', () => {
  const offer = { url: 'https://example.com/jobs/1', company: 'Example', title: 'Engineer', queryName: 'AI roles' };
  assert.match(formatPipelineOffer(offer), /\| query: AI roles$/);
  assert.equal(parseScanHistoryLine(formatScanHistoryRow(offer, '2026-11-22')).query_name, 'AI roles');
  assert.equal(SCAN_HISTORY_COLUMNS.at(-1), 'query_name');
});

test('missing and unsafe names do not corrupt output', () => {
  const offer = { url: 'https://example.com/jobs/1', company: 'Example', title: 'Engineer' };
  assert.doesNotMatch(formatPipelineOffer(offer), /query:/);
  assert.equal(parseScanHistoryLine(formatScanHistoryRow(offer, '2026-11-22')).query_name, '');
  offer.queryName = '=roles\tnew\nline';
  assert.equal(parseScanHistoryLine(formatScanHistoryRow(offer, '2026-11-22')).query_name, '=roles new line');
  assert.doesNotMatch(formatPipelineOffer(offer), /[\n\t]/);
});
