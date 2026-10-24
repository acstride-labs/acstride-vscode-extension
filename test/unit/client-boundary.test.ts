import { expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';

it('keeps Codeforces transport outside the host and permits only the dedicated AI client to make AI requests', async () => {
  async function sources(folder: string): Promise<string[]> {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((entry) =>
          entry.isDirectory()
            ? sources(path.join(folder, entry.name))
            : /\.[cm]?[jt]sx?$/.test(entry.name)
              ? fs.readFile(path.join(folder, entry.name), 'utf8').then((s) => [s])
              : [],
        ),
      )
    ).flat();
  }
  const aiClient = await fs.readFile('src/infrastructure/ai/client.ts', 'utf8');
  for (const source of [...(await sources('src')), ...(await sources('webview/src'))]) {
    if (source === aiClient) {
      expect(source).not.toContain('codeforces.com');
      continue;
    }
    expect(source).not.toMatch(
      /\bfetch\s*\(|\bXMLHttpRequest\b|from ['"](?:node:)?https?['"]|\brequire\(['"](?:node:)?https?['"]\)/,
    );
    expect(source).not.toContain('.sample-test');
  }
  await expect(fs.access('resources/helpers/public-fetch.py')).rejects.toThrow();
});
