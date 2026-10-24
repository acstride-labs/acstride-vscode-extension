import { beforeEach, afterEach, expect, it, vi } from 'vitest';
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
          harness.slots[i] = value;
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
vi.mock('katex/contrib/auto-render', () => ({ default: vi.fn() }));
const componentPath = '../../webview/src/statement/StatementView';
const { StatementView } = await import(componentPath);
let events: EventTarget;
function render() {
  harness.cursor = 0;
  const tree = StatementView();
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
function statement(index: string, collection = 'contest', contestId = 2261) {
  message({
    type: 'statement',
    translationEnabled: true,
    contestId,
    index,
    collection,
    statement: { fetchedAt: 1, html: `<p>Original ${index}</p>` },
    problems: [],
    language: 'cpp',
  });
}
function toggle() {
  elements(render(), 'button')
    .find((p) => p.className?.includes('translation-toggle'))
    .onClick();
}
function showingTranslation() {
  return elements(render(), 'button').find((p) => p.className?.includes('translation-toggle'))[
    'aria-pressed'
  ];
}
beforeEach(() => {
  harness.slots = [];
  harness.effects = [];
  harness.send.mockClear();
  events = new EventTarget();
  vi.stubGlobal('window', events);
  render();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('restores a pending translation without starting another request and accepts its background result', () => {
  statement('A');
  toggle();
  statement('B');
  expect(showingTranslation()).toBe(false);
  message({
    type: 'translation',
    contestId: 2261,
    index: 'A',
    collection: 'contest',
    status: 'ready',
    html: '<p>Translated A</p>',
  });
  expect(showingTranslation()).toBe(false);
  statement('A');
  expect(showingTranslation()).toBe(true);
  expect(
    elements(render(), 'div').find((p) => p.className === 'statement').dangerouslySetInnerHTML
      .__html,
  ).toBe('<p>Translated A</p>');
  expect(harness.send.mock.calls.filter(([m]) => m.type === 'translateStatement')).toHaveLength(1);
});
it('remembers original mode independently for each contest and standalone problem', () => {
  statement('A');
  toggle();
  statement('B');
  toggle();
  statement('A');
  expect(showingTranslation()).toBe(true);
  toggle();
  statement('B');
  expect(showingTranslation()).toBe(true);
  statement('A');
  expect(showingTranslation()).toBe(false);
  statement('A', 'standalone');
  expect(showingTranslation()).toBe(false);
  statement('A', 'contest', 2000);
  expect(showingTranslation()).toBe(false);
  message({ type: 'translationAvailability', enabled: false });
  statement('B');
  expect(showingTranslation()).toBe(false);
});
it('keeps the pending selection when returning before the translation finishes', () => {
  statement('A');
  toggle();
  statement('B');
  statement('A');
  expect(showingTranslation()).toBe(true);
  expect(harness.send.mock.calls.filter(([m]) => m.type === 'translateStatement')).toHaveLength(1);
});
