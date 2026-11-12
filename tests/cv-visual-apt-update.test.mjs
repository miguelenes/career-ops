import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';

// Execute the Dockerfile's actual POSIX shell transaction, isolating all paths.
const dockerfile = readFileSync(new URL('./cv-visual/Dockerfile', import.meta.url), 'utf8');
const run = dockerfile.match(/^RUN ([\s\S]*?)\n\nENV/m)[1].replace(/\\\n/g, '');
test('CV Dockerfile snapshot preference and archive fallback', { skip: process.platform === 'win32' }, () => {
for (const scenario of ['healthy', 'transient', 'update-outage', 'install-outage', 'both-down']) {
  const root = mkdtempSync(join(tmpdir(), 'cv-apt-'));
  try {
    for (const dir of ['etc/apt/sources.list.d', 'var/lib/apt/lists']) mkdirSync(join(root, dir), { recursive: true });
    const log = join(root, 'calls');
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'bin/apt-get'), `#!/bin/sh

  source=archive
  case "$(cat '${root}/etc/apt/sources.list.d/ubuntu.sources')" in *snapshot.ubuntu.com*) source=snapshot;; esac
  echo "$source $*" >> '${log}'
  [ "$1" != update ] || [ "$2" = --error-on=any ] || exit 99
  [ "$SCENARIO" != both-down ] || exit 100
  if [ "$source" = snapshot ]; then
    case "$SCENARIO:$1" in
      update-outage:update|install-outage:install) exit 100;;
      transient:update) [ -f '${root}/retried' ] || { touch '${root}/retried'; exit 100; };;
    esac
  fi
exit 0
`, { mode: 0o755 });
    writeFileSync(join(root, 'bin/fc-cache'), `#!/bin/sh\necho cache >> '${log}'\n`, { mode: 0o755 });
    const script = `
sleep() { :; }

${run.replaceAll('/etc/apt/', `${root}/etc/apt/`).replaceAll('/var/lib/apt/', `${root}/var/lib/apt/`)}
`;
    writeFileSync(join(root, 'run.sh'), script);
    const result = spawnSync('/bin/sh', [join(root, 'run.sh')], { env: { ...process.env, SCENARIO: scenario, PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, scenario === 'both-down' ? 1 : 0, `${scenario}: ${result.stderr}`);
    const calls = readFileSync(log, 'utf8');
    if (scenario !== 'both-down') assert.ok(calls.includes('install -y --no-install-recommends fonts-liberation fonts-noto-cjk poppler-utils'), scenario);
    const fallback = !['healthy', 'transient'].includes(scenario);
    assert.equal(calls.includes('archive update --error-on=any'), fallback, scenario);
    assert.equal(calls.includes('cache'), scenario !== 'both-down', scenario);
    if (!fallback) {
      assert.ok(readFileSync(join(root, 'etc/apt/sources.list.d/ubuntu.sources'), 'utf8').includes('https://snapshot.ubuntu.com/ubuntu/20260901T000000Z/'));
    }
    if (scenario === 'both-down') assert.equal(calls.match(/archive update/g).length, 5);
    if (fallback) {
      assert.equal(calls.match(/snapshot update/g).length, 5, scenario);
      const sources = readFileSync(join(root, 'etc/apt/sources.list.d/ubuntu.sources'), 'utf8');
      assert.ok(sources.includes('https://archive.ubuntu.com/ubuntu/'));
      assert.ok(sources.includes('https://security.ubuntu.com/ubuntu/'));
      assert.ok(!sources.includes('Check-Valid-Until: no'));
    }
    console.log(`PASS ${scenario}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
});
