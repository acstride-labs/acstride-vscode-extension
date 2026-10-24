import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultAssistantOptions } from '../../src/shared/ai-assistance';
import type { ReactElement } from 'react';

const harness = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  effects: [] as (() => void)[],
  send: vi.fn(),
}));
vi.mock('react', async (original) => {
  const actual = await original<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = harness.cursor++;
      if (!(i in harness.slots)) harness.slots[i] = initial;
      return [
        harness.slots[i],
        (value: unknown) => {
          harness.slots[i] = typeof value === 'function' ? value(harness.slots[i]) : value;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const i = harness.cursor++;
      return (harness.slots[i] ??= { current: initial });
    },
    useEffect: (fn: () => void, deps: unknown[]) => {
      const i = harness.cursor++,
        previous = harness.slots[i];
      if (!previous || deps.some((v, n) => v !== previous[n])) harness.effects.push(fn);
      harness.slots[i] = deps;
    },
  };
});
vi.mock('../../webview/src/bridge', () => ({ send: harness.send }));
vi.mock('../../webview/src/i18n', () => ({ useI18n: () => ({ t: (s: string) => s }) }));
const componentPath = '../../webview/src/ai/AssistantActions';
const { AssistantActions } = await import(componentPath);
const target = {
  contestId: 2261,
  index: 'A',
  collection: 'contest' as const,
  language: 'cpp' as const,
};
let events: EventTarget;
function render(currentTarget = target) {
  harness.cursor = 0;
  const tree = AssistantActions({ kinds: ['hint', 'debug', 'coding'], target: currentTarget });
  harness.effects.splice(0).forEach((effect) => effect());
  return tree;
}
function elements(tree: ReactElement, type: string): any[] {
  const props = tree.props as any;
  return [
    ...(tree.type === type ? [props] : []),
    ...[props.children]
      .flat(Infinity)
      .filter((v) => v && typeof v === 'object' && 'props' in v)
      .flatMap((v) => elements(v, type)),
  ];
}

function message(data: unknown) {
  events.dispatchEvent(new MessageEvent('message', { data }));
}
function open(kind: string) {
  elements(render(), 'button')
    .find((p) => p['aria-label'] === kind)
    .onClick();
  return harness.send.mock.calls.filter(([m]) => m.type === 'aiAssist').at(-1)![0].requestId;
}
beforeEach(() => {
  harness.slots = [];
  harness.effects = [];
  harness.send.mockClear();
  events = new EventTarget();
  vi.stubGlobal('window', events);
  render();
  message({ type: 'assistantOptions', options: defaultAssistantOptions() });
});
afterEach(() => vi.unstubAllGlobals());
it('hides all hints until their own eye control is clicked', () => {
  const requestId = open('AI Hint');
  message({
    type: 'assistantResult',
    requestId,
    status: 'ready',
    result: { hints: ['gentle-secret', 'medium-secret', 'specific-secret'] },
  });
  expect(JSON.stringify(render())).not.toContain('gentle-secret');
  expect(JSON.stringify(render())).not.toContain('specific-secret');
  elements(render(), 'button')
    .find((p) => p['aria-label'] === 'Reveal hint {number}')
    .onClick();
  expect(JSON.stringify(render())).toContain('gentle-secret');
  expect(JSON.stringify(render())).not.toContain('medium-secret');
});
it('ignores an old request after the problem changes', () => {
  const requestId = open('AI Debug');
  const other = { ...target, index: 'B' };
  render(other);
  render(other);
  message({
    type: 'assistantResult',
    requestId,
    status: 'ready',
    result: { text: 'stale result' },
  });
  expect(JSON.stringify(render(other))).not.toContain('stale result');
});
it('coding provides copy only and never a source replacement action', () => {
  const requestId = open('AI Solution');
  message({
    type: 'assistantResult',
    requestId,
    status: 'ready',
    result: { text: 'int main() {}' },
  });
  const tree = render();
  expect(elements(tree, 'textarea')[0].readOnly).toBe(true);
  elements(tree, 'button')
    .find((p) => p.children === 'Copy code')
    .onClick();
  expect(harness.send).toHaveBeenLastCalledWith({
    type: 'copyAiCode',
    requestId,
    text: 'int main() {}',
  });
  expect(elements(tree, 'button').some((p) => JSON.stringify(p).includes('replace'))).toBe(false);
});
it('removes features from the toolbar immediately after their visibility setting changes', () => {
  const options = defaultAssistantOptions();
  options.debug.show = false;
  message({ type: 'assistantOptions', options });
  expect(elements(render(), 'button').some((p) => p['aria-label'] === 'AI Debug')).toBe(false);
  expect(elements(render(), 'button').some((p) => p['aria-label'] === 'AI Hint')).toBe(true);
});
