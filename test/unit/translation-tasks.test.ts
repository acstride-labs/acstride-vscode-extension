import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TranslationTasks } from '../../src/application/translation-tasks';
describe('translation tasks', () => {
  it('coalesces requests, persists LRU, sanitizes HTML and invalidates changed prompts', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'acstride-translation-'));
    const file = path.join(dir, 'cache.json');
    const tasks = new TranslationTasks(file, 2);
    let calls = 0;
    const run = async () => {
      calls++;
      return '<p onclick="bad()">译文 $$$x$$$</p><script>bad()</script>';
    };
    try {
      const [a, b] = await Promise.all([
        tasks.translate(['one'], 'source', run),
        tasks.translate(['one'], 'source', run),
      ]);
      expect(a).toBe(b);
      expect(calls).toBe(1);
      expect(a).not.toContain('script');
      expect(a).not.toContain('onclick');
      expect(a).toContain('$$$x$$$');
      await tasks.translate(['two'], 'source', run);
      await tasks.translate(['one'], 'source', run); // touch one; two becomes oldest
      await tasks.translate(['three'], 'source', run);
      const restored = new TranslationTasks(file, 2);
      await restored.translate(['one'], 'source', run);
      expect(calls).toBe(3);
      await restored.translate(['two'], 'source', run);
      expect(calls).toBe(4);
      await restored.translate(['one', 'new prompt'], 'source', run);
      expect(calls).toBe(5);
      restored.dispose();
    } finally {
      tasks.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('does not cache failures', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'acstride-translation-'));
    const tasks = new TranslationTasks(path.join(dir, 'cache.json'));
    try {
      await expect(
        tasks.translate('key', '', async () => {
          throw new Error('offline');
        }),
      ).rejects.toThrow('offline');
      expect(await tasks.translate('key', '', async () => '<p>ok</p>')).toBe('<p>ok</p>');
    } finally {
      tasks.dispose();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
