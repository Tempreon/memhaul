import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { unzipSync } from 'fflate';

/** Ceilings that make a zip bomb fail fast instead of exhausting memory. */
const MAX_ENTRY_BYTES = 512 * 1024 * 1024; // 512 MiB per file
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB total, uncompressed

/**
 * A read-only view over an export, whether it arrived as a .zip, an already
 * unzipped directory, or a single JSON file. Adapters read through this so they
 * never care which of the three the user actually pointed at.
 */
export interface Archive {
  /** All contained file paths, posix-style and relative to the archive root. */
  files(): string[];
  /** Raw bytes for a path, or undefined if it isn't present. */
  readBytes(path: string): Uint8Array | undefined;
  /** UTF-8 text for a path, or undefined if it isn't present. */
  readText(path: string): string | undefined;
  /**
   * First file whose basename equals `name` (case-insensitive), or undefined.
   * Handy because exports sometimes nest everything under a top folder.
   */
  find(name: string): string | undefined;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

class MapArchive implements Archive {
  constructor(private readonly entries: Map<string, Uint8Array>) {}

  files(): string[] {
    return [...this.entries.keys()];
  }

  readBytes(path: string): Uint8Array | undefined {
    return this.entries.get(path);
  }

  readText(path: string): string | undefined {
    const bytes = this.entries.get(path);
    return bytes ? decoder.decode(bytes) : undefined;
  }

  find(name: string): string | undefined {
    const wanted = name.toLowerCase();
    for (const path of this.entries.keys()) {
      if (basename(path).toLowerCase() === wanted) return path;
    }
    return undefined;
  }
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join('/');
}

function walkDir(root: string): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      // lstat (not stat) so we DON'T follow symlinks — a symlink cycle would
      // otherwise recurse forever. We simply skip symlinks.
      const st = lstatSync(full);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile()) {
        entries.set(toPosix(relative(root, full)), readFileSync(full));
      }
    }
  }
  return entries;
}

/** A running uncompressed-byte budget, shared across the files of one open. */
interface SizeBudget {
  total: number;
}

/**
 * Unzip one .zip into a path->bytes map, enforcing the size ceilings against a
 * shared budget so a set of sibling zips (a batched export) can't collectively
 * blow past the total even if each one is individually under it.
 */
function readZipEntries(inputPath: string, budget: SizeBudget): Map<string, Uint8Array> {
  let raw: Buffer;
  try {
    raw = readFileSync(inputPath);
  } catch (err) {
    throw new Error(`Cannot read zip "${inputPath}": ${(err as Error).message}`);
  }
  let unzipped: Record<string, Uint8Array>;
  // Enforce size ceilings from the zip's own headers BEFORE decompressing each
  // entry, so a zip bomb (which declares its huge inflated size) fails fast
  // instead of exhausting memory. `filter` runs per entry pre-inflation.
  try {
    unzipped = unzipSync(new Uint8Array(raw), {
      filter(file) {
        if (file.originalSize > MAX_ENTRY_BYTES) {
          throw new Error(
            `entry "${file.name}" declares ${Math.round(file.originalSize / 1e6)}MB uncompressed, ` +
              `over the ${Math.round(MAX_ENTRY_BYTES / 1e6)}MB per-file limit`,
          );
        }
        budget.total += file.originalSize;
        if (budget.total > MAX_TOTAL_BYTES) {
          throw new Error(
            `total uncompressed size exceeds ${Math.round(MAX_TOTAL_BYTES / 1e9)}GB`,
          );
        }
        return true;
      },
    });
  } catch (err) {
    throw new Error(
      `"${inputPath}" could not be unzipped (${(err as Error).message}). ` +
        'If it looks like a zip bomb or is corrupt, that is intentional; ' +
        'if you already unzipped it, point memhaul at the folder instead.',
    );
  }
  const entries = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(unzipped)) {
    // fflate includes directory entries as zero-length; skip them.
    if (path.endsWith('/')) continue;
    entries.set(path, bytes);
  }
  return entries;
}

// Claude splits a large account into `<name>-batch-0000.zip`, `-batch-0001.zip`, …
// Pointed at any one of them, we merge every sibling so nothing after the first
// batch is silently dropped — the same intent as the ChatGPT chunk merge, one
// level up (whole zips instead of files inside one zip).
const BATCH_ZIP_RE = /^(.+)-batch-\d+\.zip$/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Sibling `<stem>-batch-NNNN.zip` files in `dir`, name-sorted; always ≥1. */
function siblingBatchZips(dir: string, stem: string, self: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [self];
  }
  const re = new RegExp(`^${escapeRegExp(stem)}-batch-\\d+\\.zip$`, 'i');
  const matches = names.filter((n) => re.test(n)).sort();
  return matches.length ? matches.map((n) => join(dir, n)) : [self];
}

/**
 * Open an export from a filesystem path. Accepts a .zip, a directory, or a
 * single file. Throws a user-facing error if the path can't be read.
 */
export function openArchive(inputPath: string): Archive {
  let st;
  try {
    st = statSync(inputPath);
  } catch {
    throw new Error(`Cannot read "${inputPath}" — no such file or directory.`);
  }

  if (st.isDirectory()) {
    return new MapArchive(walkDir(inputPath));
  }

  const lower = inputPath.toLowerCase();
  if (lower.endsWith('.zip')) {
    const budget: SizeBudget = { total: 0 };
    const batch = BATCH_ZIP_RE.exec(basename(inputPath));
    const zips = batch
      ? siblingBatchZips(dirname(inputPath), batch[1]!, inputPath)
      : [inputPath];

    if (zips.length === 1) {
      return new MapArchive(readZipEntries(zips[0]!, budget));
    }

    // Merge sibling batches. First occurrence of a path wins its natural name;
    // a later batch that repeats the same path (e.g. its own conversations.json)
    // is kept under a `<batch-stem>/…` prefix so both survive — basename globs
    // (conversations*.json, memories.json) still find every copy.
    const merged = new Map<string, Uint8Array>();
    for (const zipPath of zips) {
      const label = basename(zipPath).replace(/\.zip$/i, '');
      for (const [path, bytes] of readZipEntries(zipPath, budget)) {
        merged.set(merged.has(path) ? `${label}/${path}` : path, bytes);
      }
    }
    return new MapArchive(merged);
  }

  // A single loose file (e.g. someone points at conversations.json directly).
  const entries = new Map<string, Uint8Array>();
  entries.set(toPosix(basename(inputPath)), readFileSync(inputPath));
  return new MapArchive(entries);
}
