#!/usr/bin/env node
/**
 * Point the generated Android release build at the committed release keystore.
 *
 * `expo prebuild` regenerates android/app/build.gradle from the Expo template on every
 * run, and that template signs the release variant with the debug keystore. A debug key
 * is not stable across machines, and Android refuses to install an update whose signing
 * certificate differs from the installed app — which is one of the ways a perfectly good
 * APK ends up reporting "This app was not installed".
 *
 * This script runs after prebuild and rewrites the signing config so the release build
 * uses android-keystore/zuno-release.keystore. It is idempotent and fails loudly if the
 * template ever changes shape, rather than silently producing an unsigned APK.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = resolve(root, 'android/app/build.gradle');
const keystorePath = resolve(root, 'android-keystore/zuno-release.keystore');

if (!existsSync(gradlePath)) {
  console.error(`patch-android-signing: ${gradlePath} not found — run expo prebuild first.`);
  process.exit(1);
}
if (!existsSync(keystorePath)) {
  console.error(`patch-android-signing: ${keystorePath} not found — the release keystore is missing.`);
  process.exit(1);
}

let gradle = readFileSync(gradlePath, 'utf8');

/**
 * Return [start, end) of the brace block that opens at the first `{` at or after
 * `fromIndex`, by counting braces. Working on real offsets avoids the trap of a
 * non-greedy regex silently matching a *later* block of the same name.
 */
function blockRange(text, fromIndex) {
  const open = text.indexOf('{', fromIndex);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return [open, i + 1];
    }
  }
  return null;
}

// ---- 1. Add a `release` block inside signingConfigs -------------------------------
const signingIdx = gradle.search(/signingConfigs\s*\{/);
if (signingIdx === -1) {
  console.error('patch-android-signing: no signingConfigs block found.');
  process.exit(1);
}
const signingRange = blockRange(gradle, signingIdx);
if (!signingRange) {
  console.error('patch-android-signing: could not delimit the signingConfigs block.');
  process.exit(1);
}
const signingBody = gradle.slice(signingRange[0], signingRange[1]);

// Only look for `release` INSIDE signingConfigs — buildTypes.release must not count.
if (!/\brelease\s*\{/.test(signingBody)) {
  const releaseBlock = `
        release {
            storeFile file('../../android-keystore/zuno-release.keystore')
            storePassword 'zunorelease2026'
            keyAlias 'zuno'
            keyPassword 'zunorelease2026'
        }`;
  // Insert just before the closing brace of signingConfigs.
  const insertAt = signingRange[1] - 1;
  gradle = gradle.slice(0, insertAt) + releaseBlock + '\n    ' + gradle.slice(insertAt);
}

// ---- 2. Make buildTypes.release use it -------------------------------------------
const buildTypesIdx = gradle.search(/buildTypes\s*\{/);
if (buildTypesIdx === -1) {
  console.error('patch-android-signing: no buildTypes block found.');
  process.exit(1);
}
const buildTypesRange = blockRange(gradle, buildTypesIdx);
if (!buildTypesRange) {
  console.error('patch-android-signing: could not delimit the buildTypes block.');
  process.exit(1);
}
let buildTypesBody = gradle.slice(buildTypesRange[0], buildTypesRange[1]);

const releaseIdx = buildTypesBody.search(/\brelease\s*\{/);
if (releaseIdx === -1) {
  console.error('patch-android-signing: no release buildType found.');
  process.exit(1);
}
const releaseRange = blockRange(buildTypesBody, releaseIdx);
if (!releaseRange) {
  console.error('patch-android-signing: could not delimit the release buildType.');
  process.exit(1);
}
let releaseBody = buildTypesBody.slice(releaseRange[0], releaseRange[1]);

if (!/signingConfig\s+signingConfigs\.release/.test(releaseBody)) {
  if (!/signingConfig\s+signingConfigs\.debug/.test(releaseBody)) {
    console.error('patch-android-signing: release buildType has no signingConfig line to replace.');
    process.exit(1);
  }
  releaseBody = releaseBody.replace(
    /signingConfig\s+signingConfigs\.debug/,
    'signingConfig signingConfigs.release',
  );
  buildTypesBody =
    buildTypesBody.slice(0, releaseRange[0]) + releaseBody + buildTypesBody.slice(releaseRange[1]);
  gradle =
    gradle.slice(0, buildTypesRange[0]) + buildTypesBody + gradle.slice(buildTypesRange[1]);
}

writeFileSync(gradlePath, gradle);

// ---- 3. Prove the rewrite landed --------------------------------------------------
const check = readFileSync(gradlePath, 'utf8');
const sIdx = check.search(/signingConfigs\s*\{/);
const sRange = blockRange(check, sIdx);
const bIdx = check.search(/buildTypes\s*\{/);
const bRange = blockRange(check, bIdx);
const sBody = sRange ? check.slice(sRange[0], sRange[1]) : '';
const bBody = bRange ? check.slice(bRange[0], bRange[1]) : '';

const ok =
  /\brelease\s*\{[\s\S]*?zuno-release\.keystore/.test(sBody) &&
  /release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(bBody);

if (!ok) {
  console.error('patch-android-signing: rewrite did not take effect.');
  process.exit(1);
}

console.log('patch-android-signing: release build now signs with android-keystore/zuno-release.keystore');
