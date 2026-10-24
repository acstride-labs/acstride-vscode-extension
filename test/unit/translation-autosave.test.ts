import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { defaultTranslationOptions } from '../../src/shared/ai-protocol';

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
const componentPath = '../../webview/src/settings/TranslationSettingsCard';
const { TranslationSettingsCard } = await import(componentPath);
let events: EventTarget;
function render(options = defaultTranslationOptions) {
  harness.cursor = 0;
  const tree = TranslationSettingsCard({ options });
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
function ack() {
  events.dispatchEvent(new MessageEvent('message', { data: { type: 'translationSettingsSaved' } }));
}
beforeEach(() => {
  vi.useFakeTimers();
  harness.slots = [];
  harness.effects = [];
  harness.send.mockClear();
  events = new EventTarget();
  vi.stubGlobal('window', events);
  render();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('saves switches immediately and serializes rapid edits without stale host overwrites', () => {
  let tree = render();
  elements(tree, 'input')[0].onChange({ target: { checked: true } });
  expect(harness.send).toHaveBeenCalledTimes(1);
  tree = render();
  elements(tree, 'input')[1].onChange({ target: { checked: true } });
  render({ ...defaultTranslationOptions, enabled: true });
  expect(harness.send).toHaveBeenCalledTimes(1);
  ack();
  expect(harness.send).toHaveBeenLastCalledWith({
    type: 'saveTranslationSettings',
    options: { ...defaultTranslationOptions, enabled: true, autoTranslate: true },
  });
  ack();
  expect(
    elements(
      render({ ...defaultTranslationOptions, enabled: true, autoTranslate: true }),
      'input',
    )[1].checked,
  ).toBe(true);
});
it('debounces prompt edits, flushes on blur, and never saves empty prompts', () => {
  elements(render(), 'textarea')[0].onChange({ target: { value: 'Translate {{language}}' } });
  vi.advanceTimersByTime(499);
  expect(harness.send).not.toHaveBeenCalled();
  elements(render(), 'textarea')[0].onBlur();
  expect(harness.send).toHaveBeenCalledTimes(1);
  ack();
  elements(render(), 'textarea')[0].onChange({ target: { value: '  ' } });
  vi.advanceTimersByTime(500);
  expect(harness.send).toHaveBeenCalledTimes(1);
});
