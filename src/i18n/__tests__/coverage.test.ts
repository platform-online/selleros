/**
 * i18n coverage gate — stricter than the parity test.
 *
 * Parity proves EN/BN dictionaries agree with each other. This proves the
 * dictionaries agree with the CODE: every literal key passed to t(...)
 * anywhere under src/ (quotes, double quotes, or an interpolation-free
 * template) must exist in BOTH dictionaries and resolve to a non-empty,
 * non-identity value. That is the exact way a raw key like "orders.new2"
 * leaks into the UI on a rarely visited screen.
 *
 * Dynamic lookups (t(`prefix.${x}`)) are covered at runtime by the route-boot
 * test, which asserts the missingKeys set stays empty on every screen.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { en } from '../en';
import { bn } from '../bn';

const SRC_DIR = join(process.cwd(), 'src');
const enMap = en as Record<string, string>;
const bnMap = bn as Record<string, string>;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(p, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
      // The dictionaries define keys themselves — scanning them would be circular.
      if (!/i18n[/\\](en|bn)\.tsx?$/.test(p)) out.push(p);
    }
  }
  return out;
}

interface Hit {
  key: string;
  file: string;
  line: number;
}

/** t('…'), t("…"), or t(`…`) with no ${…} interpolation. */
const LITERAL_CALL = /(?<![.\w$])t\(\s*('([^']+)'|"([^"]+)"|`([^`$]+)`)/g;
const KEY_SHAPE = /^[a-z][\w]*(?:\.[\w-]+)+$/;

function discoverLiteralKeys(): Map<string, Hit[]> {
  const found = new Map<string, Hit[]>();
  for (const file of sourceFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(LITERAL_CALL)) {
      const key = m[2] ?? m[3] ?? m[4];
      if (!key || !KEY_SHAPE.test(key)) continue;
      const hit: Hit = { key, file: relative(SRC_DIR, file), line: text.slice(0, m.index).split('\n').length };
      const list = found.get(key) ?? [];
      list.push(hit);
      found.set(key, list);
    }
  }
  return found;
}

const discovered = discoverLiteralKeys();
const hits = (list: Hit[]) => list.map((h) => `${h.key} (${h.file}:${h.line})`).join('\n');

describe('i18n source coverage', () => {
  it('scans the real source tree', () => {
    const files = sourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(40);
    // The whole app uses hundreds of keys; a scan finding almost none is broken.
    expect(discovered.size).toBeGreaterThan(500);
  });

  it('every literal t() key exists in the English dictionary', () => {
    const missing = [...discovered.entries()].filter(([k]) => !(k in enMap)).map(([, list]) => list);
    expect(missing.map(hits).join('\n')).toBe('');
  });

  it('every literal t() key exists in the Bangla dictionary', () => {
    const missing = [...discovered.entries()].filter(([k]) => !(k in bnMap)).map(([, list]) => list);
    expect(missing.map(hits).join('\n')).toBe('');
  });

  it('no literal key resolves to an empty or self-referential value', () => {
    const bad = [...discovered.keys()].filter(
      (k) => !(enMap[k] ?? '').trim() || !(bnMap[k] ?? '').trim() || enMap[k] === k,
    );
    expect(bad).toEqual([]);
  });
});
