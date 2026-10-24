import { expect, it, vi } from 'vitest';
import { AiAssistance, parseAssistantResult } from '../../src/application/ai-assistance';
import {
  defaultAssistantOptions,
  renderAssistantPrompt,
  assistantRequestSchema,
  assistantOptionsSchema,
  assistantCopySchema,
} from '../../src/shared/ai-assistance';
import type { AiSettings } from '../../src/vscode/ai-settings';
import type { AiClient } from '../../src/infrastructure/ai/client';
const target = {
  contestId: 2261,
  index: 'A',
  collection: 'contest' as const,
  language: 'python' as const,
};
function fixture() {
  const options = defaultAssistantOptions('ja');
  const settings = {
    assistanceOptions: () => options,
    config: () => ({ baseUrl: 'http://localhost:1234/v1', model: 'test-model' }),
    key: async () => '',
  };
  const complete = vi.fn(async (..._args: unknown[]) => 'analysis');
  return {
    options,
    complete,
    service: new AiAssistance(
      settings as unknown as AiSettings,
      { complete } as unknown as AiClient,
    ),
  };
}
it('replaces metadata placeholders globally while leaving the saved prompt intact', () => {
  const options = {
    ...defaultAssistantOptions('ru').hint,
    prompt: '{{language}} / {{programmingLanguage}} / {{hintCount}} / {{language}}',
    hintCount: 5,
  };
  expect(renderAssistantPrompt(options, 'kotlin')).toBe('Russian / Kotlin / 5 / Russian');
  expect(options.prompt).toContain('{{language}}');
});
it('validates hint counts, target languages and requests; no source replacement command exists', () => {
  expect(
    assistantOptionsSchema.safeParse({
      ...defaultAssistantOptions(),
      hint: { ...defaultAssistantOptions().hint, hintCount: 0 },
    }).success,
  ).toBe(false);
  expect(
    assistantRequestSchema.safeParse({ type: 'aiAssist', kind: 'debug', requestId: 'x', target })
      .success,
  ).toBe(true);
  expect(
    assistantRequestSchema.safeParse({
      type: 'aiAssist',
      kind: 'coding',
      requestId: 'x',
      target: { ...target, index: '../secret' },
    }).success,
  ).toBe(false);
  expect(
    assistantCopySchema.safeParse({ type: 'replaceAiCode', requestId: 'x', text: 'code' }).success,
  ).toBe(false);
});
it('checks complete hint arrays and strips optional fences without accepting invalid model replies', () => {
  expect(
    parseAssistantResult('hint', '```json\n{"hints":["observe", "derive", "implement"]}\n```', 3)
      .hints,
  ).toHaveLength(3);
  expect(() => parseAssistantResult('hint', '{"hints":["one"]}', 3)).toThrow('invalid hints');
  expect(() => parseAssistantResult('hint', '<script>bad</script>', 3)).toThrow('invalid hints');
  expect(() => parseAssistantResult('coding', '   ', 3)).toThrow('empty');
  expect(parseAssistantResult('coding', '```python\nprint(42)\n```', 3)).toEqual({
    text: 'print(42)',
  });
});
it('debug sends the original statement and exact current source with an issue-only response contract', async () => {
  const f = fixture();
  await f.service.run('debug', target, 'English original', 'unsaved source');
  const args = f.complete.mock.calls[0];
  const messages = args[2] as { role: string; content: string }[];
  expect(messages[0].content).toContain('Japanese');
  expect(messages[0].content).toContain('Never output complete corrected');
  expect(JSON.parse(messages[1].content)).toEqual({
    originalEnglishStatement: 'English original',
    programmingLanguage: 'python',
    sourceCode: 'unsaved source',
  });
  f.service.dispose();
});
it('coding uses the selected programming language and never includes the existing source', async () => {
  const f = fixture();
  f.complete.mockResolvedValue('print(1)');
  await f.service.run('coding', target, 'Original', 'must-not-send');
  const messages = f.complete.mock.calls[0][2] as { content: string }[];
  expect(messages[0].content).toContain('Python 3');
  expect(messages[1].content).not.toContain('must-not-send');
  expect(messages[1].content).not.toContain('sourceCode');
  f.service.dispose();
});
it('coalesces concurrent requests even when the general cache is off, and allows retry after failure', async () => {
  const f = fixture();
  let reject!: (e: Error) => void;
  f.complete.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const a = f.service.run('debug', target, 'Original', 'same');
  const b = f.service.run('debug', target, 'Original', 'same');
  await Promise.resolve();
  await Promise.resolve();
  expect(f.complete).toHaveBeenCalledTimes(1);
  reject(new Error('offline'));
  await expect(a).rejects.toThrow('offline');
  await expect(b).rejects.toThrow('offline');
  await expect(f.service.run('debug', target, 'Original', 'same')).resolves.toEqual({
    text: 'analysis',
  });
  expect(f.complete).toHaveBeenCalledTimes(2);
  f.service.dispose();
});
it('rejects hidden features before making a model request', async () => {
  const f = fixture();
  f.options.hint.show = false;
  await expect(f.service.run('hint', target, 'Original')).rejects.toThrow('Enable this AI feature');
  expect(f.complete).not.toHaveBeenCalled();
  f.service.dispose();
});
