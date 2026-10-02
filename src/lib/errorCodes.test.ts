import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { errorMessages } from './errors';

const ROOT = join(__dirname, '..', '..');

function files(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, extensions);
    return extensions.some((ext) => name.endsWith(ext)) && !name.includes('.test.') ? [path] : [];
  });
}

describe('server error codes', () => {
  it('has a French message for every PV_* code raised by SQL or engines', () => {
    const sources = [
      ...files(join(ROOT, 'supabase', 'migrations'), ['.sql']),
      ...files(join(ROOT, 'supabase', 'functions'), ['.ts']),
    ];
    const codes = new Set(sources.flatMap((path) => readFileSync(path, 'utf8').match(/PV_[A-Z_]+[A-Z]/g) ?? []));
    const missing = [...codes].filter((code) => !(code in errorMessages));
    expect(missing).toEqual([]);
  });
});
