#!/usr/bin/env node

/**
 * Bump version across all version-bearing files:
 *   - package.json
 *   - manifest.json
 *   - .claude/SNAPSHOT.md
 *   - README.md (badge)
 *
 * Usage:
 *   node scripts/bump-version.js patch   # 1.0.0 → 1.0.1
 *   node scripts/bump-version.js minor   # 1.0.0 → 1.1.0
 *   node scripts/bump-version.js major   # 1.0.0 → 2.0.0
 *   node scripts/bump-version.js 2.3.1   # set exact version
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readJSON(file) {
  return JSON.parse(readFileSync(resolve(ROOT, file), 'utf-8'));
}

function writeJSON(file, data) {
  writeFileSync(resolve(ROOT, file), JSON.stringify(data, null, 2) + '\n');
}

function readText(file) {
  return readFileSync(resolve(ROOT, file), 'utf-8');
}

function writeText(file, content) {
  writeFileSync(resolve(ROOT, file), content);
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);

  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default:
      if (/^\d+\.\d+\.\d+$/.test(type)) return type;
      console.error(`Unknown version type: ${type}`);
      console.error('Usage: bump-version.js [patch|minor|major|X.Y.Z]');
      process.exit(1);
  }
}

const type = process.argv[2];
if (!type) {
  console.error('Usage: node scripts/bump-version.js [patch|minor|major|X.Y.Z]');
  process.exit(1);
}

// 1. Read current version from package.json
const pkg = readJSON('package.json');
const oldVersion = pkg.version;
const newVersion = bumpVersion(oldVersion, type);

console.log(`Bumping version: ${oldVersion} → ${newVersion}\n`);

// 2. Update package.json
pkg.version = newVersion;
writeJSON('package.json', pkg);
console.log(`  ✓ package.json`);

// 3. Update manifest.json
const manifest = readJSON('manifest.json');
manifest.version = newVersion;
writeJSON('manifest.json', manifest);
console.log(`  ✓ manifest.json`);

// 4. Update .claude/SNAPSHOT.md
const snapshotPath = '.claude/SNAPSHOT.md';
let snapshot = readText(snapshotPath);
snapshot = snapshot.replace(
  /\*\*Version:\*\*\s*[\d.]+/,
  `**Version:** ${newVersion}`
);
writeText(snapshotPath, snapshot);
console.log(`  ✓ .claude/SNAPSHOT.md`);

// 5. Update README.md badge
const readmePath = 'README.md';
let readme = readText(readmePath);
readme = readme.replace(
  /badge\/version-[\d.]+-/,
  `badge/version-${newVersion}-`
);
writeText(readmePath, readme);
console.log(`  ✓ README.md (badge)`);

console.log(`\nDone! Version is now ${newVersion}`);
console.log(`\nNext steps:`);
console.log(`  1. Update CHANGELOG.md with changes`);
console.log(`  2. Commit: git commit -am "release: v${newVersion}"`);
console.log(`  3. Tag: git tag v${newVersion}`);
