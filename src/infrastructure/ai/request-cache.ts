import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defaultAiCacheOptions, type AiCacheOptions } from '../../shared/ai-protocol';
export interface AiRequestInput {
  endpoint: string;
  model: string;
  messages: { role: 'system' | 'user'; content: string }[];
  stream: false;
}
interface Entry {
  key: string;
  input: AiRequestInput;
  output: string;
}
/** General AI input/output LRU. Credentials only affect the digest; they are never persisted. */
export class AiRequestCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<string>>();
  private loaded?: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private abort = new AbortController();
  private running = 0;
  private waiters: (() => void)[] = [];
  private options: AiCacheOptions;
  constructor(
    private file: string,
    options: AiCacheOptions = defaultAiCacheOptions,
  ) {
    this.options = { ...options };
  }
  async configure(options: AiCacheOptions) {
    this.options = { ...options };
    await (this.loaded ??= this.load());
    this.prune();
    await this.persist();
  }
  async request(
    input: AiRequestInput,
    run: (signal: AbortSignal) => Promise<string>,
    credentialScope = '',
  ) {
    // Canonical order, normalized endpoint, and credential partition avoid accidental cross-account hits.
    const canonical: AiRequestInput = {
      endpoint: input.endpoint,
      model: input.model,
      messages: input.messages.map(({ role, content }) => ({ role, content })),
      stream: false,
    };
    const key = createHash('sha256')
      .update(JSON.stringify([credentialScope, canonical]))
      .digest('hex');
    if (!this.options.enabled) return this.execute(run);
    const previous = this.pending.get(key);
    if (previous) return previous;
    const task = this.perform(key, canonical, run);
    this.pending.set(key, task);
    try {
      return await task;
    } finally {
      this.pending.delete(key);
    }
  }
  private async execute(run: (signal: AbortSignal) => Promise<string>) {
    if (this.running >= 10) await new Promise<void>((resolve) => this.waiters.push(resolve));
    else this.running++;
    try {
      this.abort.signal.throwIfAborted();
      return await run(this.abort.signal);
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.running--;
    }
  }
  private bytes(entry: Entry) {
    return Buffer.byteLength(JSON.stringify(entry), 'utf8');
  }
  private prune() {
    let size = [...this.entries.values()].reduce((sum, entry) => sum + this.bytes(entry), 0);
    while (
      this.entries.size > this.options.maxEntries ||
      size > this.options.maxSizeMb * 1024 * 1024
    ) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      size -= this.bytes(this.entries.get(oldest)!);
      this.entries.delete(oldest);
    }
  }
  private async perform(
    key: string,
    input: AiRequestInput,
    run: (signal: AbortSignal) => Promise<string>,
  ) {
    await (this.loaded ??= this.load());
    let entry = this.entries.get(key);
    if (!entry) entry = { key, input, output: await this.execute(run) };
    if (this.options.enabled && this.bytes(entry) <= this.options.maxSizeMb * 1024 * 1024) {
      this.entries.delete(key);
      this.entries.set(key, entry);
      this.prune();
      await this.persist();
    }
    return entry.output;
  }
  private persist() {
    const data = JSON.stringify({ version: 1, entries: [...this.entries.values()] });
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        const temp = this.file + '.' + randomUUID() + '.tmp';
        await fs.writeFile(temp, data, { mode: 0o600 });
        await fs.rename(temp, this.file);
      });
    return this.writes;
  }
  private async load() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (data.version === 1 && Array.isArray(data.entries))
        for (const entry of data.entries) {
          if (
            typeof entry?.key === 'string' &&
            /^[a-f0-9]{64}$/.test(entry.key) &&
            typeof entry.output === 'string' &&
            typeof entry.input?.endpoint === 'string' &&
            typeof entry.input?.model === 'string' &&
            Array.isArray(entry.input?.messages)
          )
            this.entries.set(entry.key, entry);
        }
      this.prune();
    } catch {}
  }
  dispose() {
    this.abort.abort();
  }
}
