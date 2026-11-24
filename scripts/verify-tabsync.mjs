#!/usr/bin/env node
/**
 * Verification harness for the multi-tab opener and the mirror.
 *
 * The mirror is the part of this app most likely to break in a way nobody notices: a
 * replay loop does not throw, it just makes the tabs click each other forever. So the
 * loop guards are tested directly here rather than being trusted.
 *
 * Run with:  node scripts/verify-tabsync.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` (${detail})` : ''}`);
  }
}

const out = mkdtempSync(join(tmpdir(), 'zuno-tabsync-'));
try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/lib/tab-sync.ts',
      '--outDir',
      out,
      '--module',
      'esnext',
      '--target',
      'es2020',
      '--skipLibCheck',
      '--moduleResolution',
      'bundler',
      '--ignoreConfig',
    ],
    { stdio: 'inherit' },
  );

  const ts = await import(join(out, 'tab-sync.js'));

  // -------------------------------------------------------------------------------------
  console.log('\n[1] Tab count is clamped into the offered range');
  // -------------------------------------------------------------------------------------
  check('clamps 0 up to the minimum', ts.clampOpenCount(0) === ts.MIN_OPEN_COUNT, '');
  check('clamps 1 up to the minimum', ts.clampOpenCount(1) === ts.MIN_OPEN_COUNT, '');
  check('keeps a value in range', ts.clampOpenCount(6) === 6, '');
  check('clamps above the maximum', ts.clampOpenCount(999) === ts.MAX_OPEN_COUNT, '');
  check('floors a fraction', ts.clampOpenCount(4.9) === 4, '');
  check('falls back on NaN', ts.clampOpenCount(NaN) === ts.DEFAULT_OPEN_COUNT, '');
  check('falls back on Infinity', ts.clampOpenCount(Infinity) === ts.DEFAULT_OPEN_COUNT, '');

  // -------------------------------------------------------------------------------------
  console.log('\n[2] Mirror group always has exactly one leader');
  // -------------------------------------------------------------------------------------
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const m = ts.startMirror(ids, 0);
  check('starts enabled', m.enabled === true, '');
  check('first tab is the leader', m.leaderId === 'a', '');
  check('every other tab follows', m.followerIds.length === 4, `${m.followerIds.join(',')}`);
  check('leader is not also a follower', !m.followerIds.includes(m.leaderId), '');
  check(
    'leader + followers == the whole group',
    new Set([m.leaderId, ...m.followerIds]).size === ids.length,
    '',
  );
  check('a single tab cannot mirror', ts.startMirror(['a']).enabled === false, '');
  check('an empty group cannot mirror', ts.startMirror([]).enabled === false, '');

  // -------------------------------------------------------------------------------------
  console.log('\n[3] Moving the leader keeps the invariant');
  // -------------------------------------------------------------------------------------
  const m2 = ts.setLeader(m, 'c');
  check('the new leader is the one asked for', m2.leaderId === 'c', '');
  check('the old leader became a follower', m2.followerIds.includes('a'), '');
  check('the new leader is not a follower', !m2.followerIds.includes('c'), '');
  check('the group size is unchanged', m2.followerIds.length + 1 === 5, '');
  check('an unknown id is a no-op', ts.setLeader(m, 'zzz').leaderId === 'a', '');
  check('a disabled mirror stays disabled', ts.setLeader(ts.MIRROR_OFF, 'a').enabled === false, '');

  // -------------------------------------------------------------------------------------
  console.log('\n[4] Closing tabs cannot leave a leaderless group');
  // -------------------------------------------------------------------------------------
  const m3 = ts.removeFromMirror(m, 'b');
  check('a follower is simply dropped', m3.followerIds.length === 3 && m3.leaderId === 'a', '');
  const m4 = ts.removeFromMirror(m, 'a');
  check('closing the leader promotes a follower', m4.leaderId === 'b', `leader=${m4.leaderId}`);
  check('the promoted leader is not a follower', !m4.followerIds.includes('b'), '');
  const m5 = ts.removeFromMirror(ts.startMirror(['a', 'b']), 'a');
  check('closing down to one tab turns mirroring off', m5.enabled === false, '');
  const m6 = ts.removeFromMirror(ts.startMirror(['a', 'b']), 'b');
  check('closing the only follower turns mirroring off', m6.enabled === false, '');

  // -------------------------------------------------------------------------------------
  console.log('\n[5] Leader / follower classification is exclusive');
  // -------------------------------------------------------------------------------------
  check('the leader is the leader', ts.isLeader(m, 'a') === true, '');
  check('the leader is not a follower', ts.isFollower(m, 'a') === false, '');
  check('a follower is a follower', ts.isFollower(m, 'b') === true, '');
  check('a follower is not the leader', ts.isLeader(m, 'b') === false, '');
  check('an outsider is neither', !ts.isLeader(m, 'zzz') && !ts.isFollower(m, 'zzz'), '');
  check(
    'no tab is ever both',
    ids.every((id) => !(ts.isLeader(m, id) && ts.isFollower(m, id))),
    '',
  );

  // -------------------------------------------------------------------------------------
  console.log('\n[6] Incoming actions are validated before replay');
  // -------------------------------------------------------------------------------------
  check('accepts a click', ts.parseSyncAction({ kind: 'click', x: 10, y: 20 }) !== null, '');
  check('accepts a scroll', ts.parseSyncAction({ kind: 'scroll', x: 0, y: 300 }) !== null, '');
  check('accepts a key', ts.parseSyncAction({ kind: 'key', key: 'Enter' }) !== null, '');
  check('accepts text', ts.parseSyncAction({ kind: 'text', text: 'hi' }) !== null, '');
  check(
    'accepts an http navigate',
    ts.parseSyncAction({ kind: 'navigate', url: 'https://example.com/' }) !== null,
    '',
  );
  check('accepts a JSON string payload', ts.parseSyncAction('{"kind":"click","x":1,"y":2}') !== null, '');
  check('rejects malformed JSON', ts.parseSyncAction('{not json') === null, '');
  check('rejects a non-object', ts.parseSyncAction(42) === null, '');
  check('rejects an unknown kind', ts.parseSyncAction({ kind: 'eval', code: 'x' }) === null, '');
  check('rejects a click with no coordinates', ts.parseSyncAction({ kind: 'click' }) === null, '');
  check('rejects NaN coordinates', ts.parseSyncAction({ kind: 'click', x: NaN, y: 1 }) === null, '');
  check('rejects a string coordinate', ts.parseSyncAction({ kind: 'click', x: '1', y: '2' }) === null, '');
  // The important one: a javascript: or data: URL must never be replayed into every tab.
  check(
    'rejects a javascript: navigate',
    ts.parseSyncAction({ kind: 'navigate', url: 'javascript:alert(1)' }) === null,
    '',
  );
  check(
    'rejects a data: navigate',
    ts.parseSyncAction({ kind: 'navigate', url: 'data:text/html,<script>x</script>' }) === null,
    '',
  );
  check('rejects an empty navigate', ts.parseSyncAction({ kind: 'navigate', url: '' }) === null, '');

  // -------------------------------------------------------------------------------------
  console.log('\n[7] The generated scripts carry the loop guards');
  // -------------------------------------------------------------------------------------
  const leader = ts.buildLeaderScript();
  const follower = ts.buildFollowerScript({ kind: 'click', x: 5, y: 6 });
  check('the leader script is idempotent', leader.includes('__vth_mirror_leader'), '');
  check('the leader reports clicks', leader.includes("kind: 'click'"), '');
  check('the leader reports scroll', leader.includes("kind: 'scroll'"), '');
  check('the leader reports keys', leader.includes("kind: 'key'"), '');
  check('the leader does not replay anything', !leader.includes('elementFromPoint'), '');
  check('the follower resolves the element under the point', follower.includes('elementFromPoint'), '');
  check('the follower marks its replay', follower.includes('__vth_replay'), '');
  check('the follower does not install the leader listeners', !follower.includes('__vth_mirror_leader'), '');
  check('the follower script is valid JS', (() => {
    try {
      new Function(follower);
      return true;
    } catch {
      return false;
    }
  })(), '');
  check('the leader script is valid JS', (() => {
    try {
      new Function(leader);
      return true;
    } catch {
      return false;
    }
  })(), '');
  // A payload with a quote in it must not break out of the generated string.
  const tricky = ts.buildFollowerScript({ kind: 'text', text: 'a"b\\c\nd' });
  check('a hostile payload still produces valid JS', (() => {
    try {
      new Function(tricky);
      return true;
    } catch {
      return false;
    }
  })(), '');

  // -------------------------------------------------------------------------------------
  console.log('\n[8] Actions are described for the status line');
  // -------------------------------------------------------------------------------------
  check('describes a click', ts.describeAction({ kind: 'click', x: 10, y: 20 }).includes('10'), '');
  check('describes a navigate', ts.describeAction({ kind: 'navigate', url: 'https://x.com/' }).includes('x.com'), '');
  check('describes a key', ts.describeAction({ kind: 'key', key: 'Enter' }).includes('Enter'), '');
  check(
    'truncates a long typed string',
    ts.describeAction({ kind: 'text', text: 'x'.repeat(200) }).length < 60,
    '',
  );

  console.log(`\n${'='.repeat(60)}`);
  console.log(`PASS=${pass}  FAIL=${fail}`);
  console.log(fail === 0 ? 'ALL_PASS = true' : 'ALL_PASS = false');
  process.exit(fail === 0 ? 0 : 1);
} finally {
  rmSync(out, { recursive: true, force: true });
}
