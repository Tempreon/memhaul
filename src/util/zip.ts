import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
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
    let totalBytes = 0;
    try {
      unzipped = unzipSync(new Uint8Array(raw), {
        filter(file) {
          if (file.originalSize > MAX_ENTRY_BYTES) {
            throw new Error(
              `entry "${file.name}" declares ${Math.round(file.originalSize / 1e6)}MB uncompressed, ` +
                `over the ${Math.round(MAX_ENTRY_BYTES / 1e6)}MB per-file limit`,
            );
          }
          totalBytes += file.originalSize;
          if (totalBytes > MAX_TOTAL_BYTES) {
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
          'if you already unzipped it, point memory-porter at the folder instead.',
      );
    }
    const entries = new Map<string, Uint8Array>();
    for (const [path, bytes] of Object.entries(unzipped)) {
      // fflate includes directory entries as zero-length; skip them.
      if (path.endsWith('/')) continue;
      entries.set(path, bytes);
    }
    return new MapArchive(entries);
  }

  // A single loose file (e.g. someone points at conversations.json directly).
  const entries = new Map<string, Uint8Array>();
  entries.set(toPosix(basename(inputPath)), readFileSync(inputPath));
  return new MapArchive(entries);
}
