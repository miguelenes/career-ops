import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { portalTopLevelTypos } from '../validate-portals.mjs';

test('source_priority is accepted while a misspelling is flagged', () => {
  deepStrictEqual(portalTopLevelTypos({ source_priority: {} }), []);
  deepStrictEqual(portalTopLevelTypos({ source_priorit: {} }), [
    { key: 'source_priorit', suggestion: 'source_priority' },
  ]);
});
