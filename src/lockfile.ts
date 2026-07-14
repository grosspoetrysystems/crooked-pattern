import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type LockfileFormat = 'pnpm' | 'npm' | 'yarn' | 'bun';

export interface LockfilePackage {
  name: string;
  version: string;
  direct: boolean;
}

export interface LockfileInventory {
  lockfile: string;
  format: LockfileFormat;
  parsed: boolean;
  packages: LockfilePackage[];
  package_count: number;
  direct_count: number;
  transitive_count: number;
  note?: string;
}

interface LockfileCandidate {
  file: string;
  format: LockfileFormat;
  parse?: (text: string) => Map<string, string>;
  unparseableNote?: string;
}

// pnpm first: this repo dogfoods it, and priority decides which lockfile
// becomes the inventory when a project ships several.
const candidates: LockfileCandidate[] = [
  { file: 'pnpm-lock.yaml', format: 'pnpm', parse: parsePnpmLock },
  { file: 'package-lock.json', format: 'npm', parse: parseNpmLock },
  { file: 'npm-shrinkwrap.json', format: 'npm', parse: parseNpmLock },
  { file: 'yarn.lock', format: 'yarn', parse: parseYarnLock },
  { file: 'bun.lock', format: 'bun', parse: parseBunLock },
  {
    file: 'bun.lockb',
    format: 'bun',
    unparseableNote:
      'bun.lockb is a binary lockfile; run `bun install --save-text-lockfile` to emit a parseable bun.lock.',
  },
];

export async function readLockfileInventory(
  root: string,
  directDependencies: string[]
): Promise<LockfileInventory | undefined> {
  for (const candidate of candidates) {
    const text = await readFileSafe(path.join(root, candidate.file));
    if (text === undefined) continue;
    if (!candidate.parse)
      return unparsed(candidate, candidate.unparseableNote ?? '');
    const entries = candidate.parse(text);
    if (!entries.size)
      return unparsed(
        candidate,
        `Found ${candidate.file}, but no package entries could be extracted; falling back to file presence.`
      );
    return buildInventory(candidate, entries, directDependencies);
  }
  return undefined;
}

function buildInventory(
  candidate: LockfileCandidate,
  entries: Map<string, string>,
  directDependencies: string[]
): LockfileInventory {
  const direct = new Set(directDependencies);
  const packages = [...entries.entries()]
    .map(([key, version]) => ({
      name: key.slice(0, key.lastIndexOf('@@')),
      version,
      direct: direct.has(key.slice(0, key.lastIndexOf('@@'))),
    }))
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
    );
  const directCount = packages.filter((entry) => entry.direct).length;
  return {
    lockfile: candidate.file,
    format: candidate.format,
    parsed: true,
    packages,
    package_count: packages.length,
    direct_count: directCount,
    transitive_count: packages.length - directCount,
  };
}

function unparsed(
  candidate: LockfileCandidate,
  note: string
): LockfileInventory {
  return {
    lockfile: candidate.file,
    format: candidate.format,
    parsed: false,
    packages: [],
    package_count: 0,
    direct_count: 0,
    transitive_count: 0,
    note,
  };
}

// Entries are keyed `${name}@@${version}` so the same name at different
// versions stays distinct while duplicates collapse.
function addEntry(entries: Map<string, string>, name: string, version: string) {
  const cleanName = name.trim();
  const cleanVersion = version.trim();
  if (!cleanName || !cleanVersion) return;
  entries.set(`${cleanName}@@${cleanVersion}`, cleanVersion);
}

function parseNpmLock(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  const parsed = safeJson<{
    packages?: Record<string, { version?: unknown; link?: unknown }>;
    dependencies?: Record<string, unknown>;
  }>(text);
  if (!parsed) return entries;
  if (parsed.packages) {
    for (const [key, value] of Object.entries(parsed.packages)) {
      const marker = key.lastIndexOf('node_modules/');
      if (marker === -1 || !value || value.link === true) continue;
      const name = key.slice(marker + 'node_modules/'.length);
      if (typeof value.version === 'string')
        addEntry(entries, name, value.version);
    }
    return entries;
  }
  collectNpmV1(parsed.dependencies, entries);
  return entries;
}

function collectNpmV1(dependencies: unknown, entries: Map<string, string>) {
  if (!dependencies || typeof dependencies !== 'object') return;
  for (const [name, value] of Object.entries(dependencies)) {
    if (!value || typeof value !== 'object') continue;
    const record = value as { version?: unknown; dependencies?: unknown };
    if (typeof record.version === 'string')
      addEntry(entries, name, record.version);
    collectNpmV1(record.dependencies, entries);
  }
}

// Purpose-built line scanner for the `packages:` section of pnpm-lock.yaml
// v5/v6/v9; avoids taking a YAML dependency for one deterministic block.
function parsePnpmLock(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  let inPackages = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) {
      inPackages = line === 'packages:';
      continue;
    }
    if (!inPackages) continue;
    const match = line.match(/^ {2}(\S.*):\s*$/);
    if (!match) continue;
    const descriptor = unquote(match[1]);
    const split = splitPnpmDescriptor(descriptor);
    if (split) addEntry(entries, split.name, split.version);
  }
  return entries;
}

function splitPnpmDescriptor(descriptor: string) {
  let key = descriptor.replace(/^\//, '');
  const peerSuffix = key.indexOf('(');
  if (peerSuffix !== -1) key = key.slice(0, peerSuffix);
  const at = key.lastIndexOf('@');
  if (at > 0) return { name: key.slice(0, at), version: key.slice(at + 1) };
  // v5 style: name/version
  const slash = key.lastIndexOf('/');
  if (slash > 0 && /^\d/.test(key.slice(slash + 1)))
    return { name: key.slice(0, slash), version: key.slice(slash + 1) };
  return undefined;
}

// Handles classic (v1) and berry (YAML) yarn.lock files with one scanner:
// top-level selector lines followed by an indented version field.
function parseYarnLock(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  let currentName: string | undefined;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!line.startsWith(' ')) {
      currentName = undefined;
      const key = line.endsWith(':') ? line.slice(0, -1) : undefined;
      if (!key || key === '__metadata') continue;
      const selector = unquote(key.split(',')[0].trim());
      if (selector.includes('@workspace:')) continue;
      const at = selector.lastIndexOf('@');
      if (at <= 0) continue;
      currentName = selector.slice(0, at);
      continue;
    }
    if (!currentName) continue;
    const version = line.match(/^ {2}version:?\s+"?([^"\s]+)"?\s*$/);
    if (version) {
      addEntry(entries, currentName, version[1]);
      currentName = undefined;
    }
  }
  return entries;
}

function parseBunLock(text: string): Map<string, string> {
  const entries = new Map<string, string>();
  // bun.lock is JSONC with trailing commas.
  const parsed = safeJson<{ packages?: Record<string, unknown> }>(
    text.replace(/,(\s*[}\]])/g, '$1')
  );
  if (!parsed?.packages) return entries;
  for (const value of Object.values(parsed.packages)) {
    if (!Array.isArray(value) || typeof value[0] !== 'string') continue;
    const at = value[0].lastIndexOf('@');
    if (at <= 0) continue;
    addEntry(entries, value[0].slice(0, at), value[0].slice(at + 1));
  }
  return entries;
}

function unquote(value: string) {
  return value.replace(/^['"]/, '').replace(/['"]$/, '');
}

function safeJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function readFileSafe(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}
