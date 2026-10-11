import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The bundled documentation corpus is Poolboy's `site/` build output, shipped
// beside the compiled CLI (see package.json `files`). It is read-only and fully
// offline — this module never performs any network access.
//
// Layout at runtime:
//   installed/built:  <pkg>/dist/cli.js  -> <pkg>/site
//   dev (tsx):        <pkg>/src/docs.ts  -> <pkg>/site
function corpusRoot(): string {
  const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'site'
  );
  if (!existsSync(path.join(root, 'graph.json')))
    throw new Error(
      'Bundled docs corpus not found. Run `pnpm build:corpus` to generate site/.'
    );
  return root;
}

interface GraphNavEntry {
  prev?: string;
  next?: string;
  backlinks?: string[];
}

interface GraphFileEntry {
  title?: string;
  bytes: number;
  sha256: string;
  links?: string[];
  type?: string;
}

interface Graph {
  version: string;
  root: string;
  llms: { bytes: number; sha256: string };
  files: Record<string, GraphFileEntry>;
  nav: Record<string, GraphNavEntry>;
  artifacts?: Record<string, { bytes: number; sha256: string }>;
}

async function loadGraph(root: string): Promise<Graph> {
  return JSON.parse(
    await readFile(path.join(root, 'graph.json'), 'utf8')
  ) as Graph;
}

// The stable corpus revision is the SHA-256 of graph.json. Its manifest
// records the SHA-256 of every document, llms.txt, and generated artifact, so
// this digest is a compact revision token for comparing packaged and Pages
// corpus inputs.
async function revision(root: string): Promise<string> {
  const bytes = await readFile(path.join(root, 'graph.json'));
  return createHash('sha256').update(bytes).digest('hex');
}

// Resolve a caller-supplied document path strictly inside the corpus. Corpus
// keys are root-absolute ("/scan.md"); leading separators are stripped so an
// absolute-looking input cannot escape to the filesystem root, and the resolved
// path (after collapsing any "..") must still live under root. A final realpath
// check rejects symlink escapes.
async function resolveDoc(root: string, rel: string): Promise<string> {
  const clean = rel.replace(/^[/\\]+/, '');
  if (!clean || clean === '.') throw new Error(`Not a document path: ${rel}`);
  const target = path.resolve(root, clean);
  const inside = target === root || target.startsWith(root + path.sep);
  if (!inside)
    throw new Error(`Refusing to read outside the docs corpus: ${rel}`);
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    throw new Error(`No such document in the corpus: ${rel}`);
  }
  const realRoot = await realpath(root);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep))
    throw new Error(`Refusing to read outside the docs corpus: ${rel}`);
  return real;
}

function orderedPaths(graph: Graph): string[] {
  const ordered = graph.files[graph.root] ? [graph.root] : [];
  const seen = new Set(ordered);
  let current = Object.keys(graph.nav).find(
    (key) => graph.files[key] && !graph.nav[key]?.prev
  );
  while (current && !seen.has(current)) {
    ordered.push(current);
    seen.add(current);
    current = graph.nav[current]?.next;
  }
  ordered.push(
    ...Object.keys(graph.files)
      .filter((key) => !seen.has(key))
      .sort()
  );
  return ordered;
}

async function indexText(root: string, json: boolean): Promise<string> {
  const graph = await loadGraph(root);
  const rev = await revision(root);
  const paths = orderedPaths(graph);
  if (json)
    return JSON.stringify(
      {
        revision: rev,
        root: graph.root,
        documents: paths.map((key) => ({
          path: key,
          title: graph.files[key]?.title,
          type: graph.files[key]?.type,
          prev: graph.nav[key]?.prev,
          next: graph.nav[key]?.next,
          backlinks: graph.nav[key]?.backlinks,
        })),
      },
      null,
      2
    );
  const list = paths.map((key) => {
    const title = graph.files[key]?.title;
    return title ? `  ${key}  —  ${title}` : `  ${key}`;
  });
  return [
    `Crooked Pattern offline docs — revision ${rev}`,
    `root: ${graph.root}`,
    '',
    ...list,
    '',
    'Read a document:   ars docs <path>        (e.g. ars docs scan.md)',
    'Full graph + nav:  ars docs --graph',
    'llms.txt entry:    ars docs --llms',
    'Corpus revision:   ars docs --revision',
  ].join('\n');
}

interface DocsRequest {
  path?: string;
  graph?: boolean;
  revision?: boolean;
  llms?: boolean;
  json?: boolean;
}

/** Render an offline docs request against the bundled corpus (no network). */
export async function renderDocs(
  req: DocsRequest,
  root: string = corpusRoot()
): Promise<string> {
  if (req.revision) return revision(root);
  if (req.graph)
    return (await readFile(path.join(root, 'graph.json'), 'utf8')).trimEnd();
  if (req.llms)
    return (await readFile(path.join(root, 'llms.txt'), 'utf8')).trimEnd();
  if (req.path) {
    const target = await resolveDoc(root, req.path);
    return (await readFile(target, 'utf8')).trimEnd();
  }
  return indexText(root, req.json ?? false);
}
