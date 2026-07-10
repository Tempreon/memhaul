/**
 * A tiny, dependency-free argv parser. Hand-rolled on purpose: the whole point
 * of this tool is that you can read every line and trust it does nothing you
 * didn't ask for. No argument library, no plugins, no surprises.
 */

export interface ParsedArgs {
  positional: string[];
  options: Record<string, string | boolean>;
}

/**
 * Parse `argv` (already sliced past node + script). `booleanFlags` names the
 * options that take no value, so `--dry-run <path>` treats `<path>` as
 * positional rather than as the flag's value.
 */
export function parseArgs(
  argv: string[],
  booleanFlags: Set<string> = new Set(),
): ParsedArgs {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === '--') {
      // Everything after `--` is positional.
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        options[body.slice(0, eq)] = body.slice(eq + 1);
        continue;
      }
      if (booleanFlags.has(body)) {
        options[body] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        options[body] = next;
        i++;
      } else {
        options[body] = true;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      // Short flags: -h, -v. Treated as booleans.
      for (const ch of arg.slice(1)) options[ch] = true;
      continue;
    }

    positional.push(arg);
  }

  return { positional, options };
}

/**
 * Read an option as a string, falling back to a default. Throws if the option
 * was given without a value (`--out` at end of argv, or `--out --json`), so a
 * value-taking flag can never silently fall back to its default.
 */
export function optString(
  args: ParsedArgs,
  key: string,
  fallback?: string,
): string | undefined {
  const v = args.options[key];
  if (v === true) throw new Error(`--${key} requires a value`);
  return typeof v === 'string' ? v : fallback;
}

/** Read an option as a boolean (present-and-truthy). */
export function optBool(args: ParsedArgs, key: string): boolean {
  return args.options[key] === true || args.options[key] === 'true';
}
