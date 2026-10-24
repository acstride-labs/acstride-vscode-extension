import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { sanitizeStatement } from '../infrastructure/codeforces/statement-sanitizer';
/** Persistent LRU with in-flight coalescing. Failed requests are never cached. */
export class TranslationTasks {
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private loaded?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private abort = new AbortController();
  private running = 0;
  private waiters: (() => void)[] = [];
  constructor(
    private file: string,
    private capacity = 100,
  ) {}
  async translate(
    identity: unknown,
    source: string,
    run: (signal: AbortSignal) => Promise<string>,
  ) {
    const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const existing = this.pending.get(key);
    if (existing) return existing;
    const task = this.perform(key, source, run);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  private async perform(
    key: string,
    source: string,
    run: (signal: AbortSignal) => Promise<string>,
  ) {
    await (this.loaded ??= this.load());
    let html = this.cache.get(key);
    if (html === undefined) {
      if (this.running >= 2) await new Promise<void>((resolve) => this.waiters.push(resolve));
      this.running++;
      let response: string;
      try {
        this.abort.signal.throwIfAborted();
        response = await run(this.abort.signal);
      } finally {
        this.running--;
        this.waiters.shift()?.();
      }
      const assets = [...source.matchAll(/cfide-asset:([a-f0-9]{64}\.(?:png|jpg|webp|gif))/g)].map(
        (m) => m[1],
      );
      html = sanitizeStatement(
        response
          .replace(/^```(?:html)?\s*/, '')
          .replace(/\s*```$/, '')
          .replaceAll('cfide-asset:', 'acstride-asset:'),
        assets,
      );
      if (!html.trim()) throw new Error('AI service returned no translation.');
    }
    this.cache.delete(key);
    this.cache.set(key, html);
    while (this.cache.size > this.capacity) this.cache.delete(this.cache.keys().next().value!);
    const data = JSON.stringify([...this.cache]);
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + '.' + randomUUID() + '.tmp';
        await fs.writeFile(temp, data, { mode: 0o600 });
        await fs.rename(temp, this.file);
      });
    await this.writes;
    return html;
  }
  private async load() {
    try {
      const entries: unknown = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (Array.isArray(entries))
        for (const item of entries.slice(-this.capacity))
          if (Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string')
            this.cache.set(item[0], item[1]);
    } catch {}
  }
  dispose() {
    this.abort.abort();
  }
}
