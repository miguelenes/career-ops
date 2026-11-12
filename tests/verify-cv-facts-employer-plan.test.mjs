// tests/verify-cv-facts-employer-plan.test.mjs — the employer-plan horizon.
//
// A cover letter that restates what the ROLE's opening window calls for —
// "Your first six months call for trusted partnerships" — asserts nothing
// about the candidate's past. The plan-horizon exception already recognizes a
// proposed window when a forward marker shares its clause ("in the first six
// months I would ..."); the employer-plan sentence has no modal of its own, so
// the second signal never fired, the window was extracted as the claim
// "6 months", and the gate blocked a letter over a number that was never the
// candidate's to evidence. No source can back a plan the employer wrote.
//
// The narrow half of the fix is pinned here as well: only the second-person
// possessive stands alone. "My first six months were spent firefighting" is a
// past claim about the candidate and must stay a claim.
import { pass, fail } from './helpers.mjs';
import { metricClaims, auditClaims, verifyFacts } from '../verify-cv-facts.mjs';

console.log('\nEmployer-plan horizon (verify-cv-facts)');

const claimsOf = (text) => [...metricClaims(text)].sort().join(' | ');

// The false positive that motivated the fix, in both shapes a letter writes
// it: the spelled-out number and the digit, with and without a modal.
const cases = [
  ['employer plan, spelled number', 'Your first six months call for trusted partnerships, distributed ownership, and a strategic roadmap.'],
  ['employer plan, digit', 'Your first 6 months call for a strategic roadmap the CEO can challenge.'],
  ['employer plan with a modal', 'In your first six months you would see engineers shipping weekly.'],
  ['candidate plan with a modal', 'In the first six months I would map the delivery friction.'],
];
for (const [label, text] of cases) {
  const claims = claimsOf(text);
  if (claims === '') pass(`${label}: no metric claim extracted`);
  else fail(`${label}: extracted "${claims}", but the role's opening window is not a claim about the candidate`);
}

// An end-to-end audit must not report the window as invented either.
const invented = auditClaims(
  'Your first six months call for trusted partnerships and a strategic roadmap.',
  'No numbers here.',
).invented;
if (invented.length === 0) pass('full audit does not report the employer-plan window as invented');
else fail(`full audit reported the employer-plan window as invented: ${invented.join(', ')}`);

// The exception stays narrow. Each of these keeps its claim.
const kept = [
  ['first-person past window', 'My first six months were spent firefighting.', '6 months'],
  ['bare past-tense window', 'Revenue grew in the first 12 months.', '12 months'],
  ['personal experience count', 'I have 6 months of incident-response experience.', '6 months'],
];
for (const [label, text, expected] of kept) {
  const claims = claimsOf(text);
  if (claims === expected) pass(`${label}: still a claim ("${expected}")`);
  else fail(`${label}: expected "${expected}", got "${claims}"`);
}

// A candidate-owned non-time count stays checked even when it addresses the employer.
const teams = claimsOf('I led your first 3 teams.');
if (teams === '3 teams') pass('a non-time noun behind the same lead is still a claim');
else fail(`a non-time noun behind the same lead changed: expected "3 teams", got "${teams}"`);

// And the verdict a rendered cover letter actually receives: pass, not warn,
// because the gate dropped the window rather than failing to read it.
const verdict = verifyFacts(
  'Your first six months call for trusted partnerships and a strategic roadmap.',
  { sourcePaths: [], configPath: '/nonexistent' },
).verdict;
if (verdict === 'pass') pass('a letter built around the employer-plan window passes');
else fail(`a letter built around the employer-plan window returned "${verdict}"`);
