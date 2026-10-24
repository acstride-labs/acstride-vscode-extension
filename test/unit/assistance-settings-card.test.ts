import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { defaultAssistantOptions, defaultAssistantPrompts } from '../../src/shared/ai-assistance';
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
      if (!(i in harness.slots))
        harness.slots[i] = typeof initial === 'function' ? initial() : initial;
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
const componentPath = '../../webview/src/settings/AssistanceSettingsCard';
const { AssistanceSettingsCard } = await import(componentPath);
let events: EventTarget;
const options = defaultAssistantOptions();
function render(currentOptions = options) {
  harness.cursor = 0;
  const tree = AssistanceSettingsCard({ options: currentOptions });
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
function button(text: string) {
  return elements(render(), 'button').find((p) => p.children === text);
}
beforeEach(() => {
  harness.slots = [];
  harness.effects = [];
  harness.send.mockClear();
  events = new EventTarget();
  vi.stubGlobal('window', events);
  render();
});
afterEach(() => vi.unstubAllGlobals());
it('keeps submitted prompts while the host acknowledges before publishing updated settings', () => {
  elements(render(), 'textarea')[0].onChange({ target: { value: 'Custom {{language}}' } });
  button('Save').onClick();
  message({ type: 'assistanceSettingsSaved' });
  expect(elements(render(), 'textarea')[0].value).toBe('Custom {{language}}');
  expect(harness.send).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'saveAssistanceSettings',
      options: expect.objectContaining({
        hint: expect.objectContaining({ prompt: 'Custom {{language}}' }),
      }),
    }),
  );
});
it('restores a default only after confirmation and still requires explicit save', () => {
  elements(render(), 'textarea')[0].onChange({ target: { value: 'Custom prompt' } });
  elements(render(), 'button')
    .filter((p) => p.children === 'Restore default prompt')[0]
    .onClick();
  expect(elements(render(), 'textarea')[0].value).toBe('Custom prompt');
  button('Cancel').onClick();
  expect(elements(render(), 'textarea')[0].value).toBe('Custom prompt');
  elements(render(), 'button')
    .filter((p) => p.children === 'Restore default prompt')[0]
    .onClick();
  button('Confirm restore').onClick();
  expect(elements(render(), 'textarea')[0].value).toBe(defaultAssistantPrompts.hint);
  expect(harness.send).not.toHaveBeenCalled();
});
it('unlocks saving after a persistence failure and keeps the unsaved draft', () => {
  elements(render(), 'textarea')[1].onChange({ target: { value: 'Debug draft' } });
  elements(render(), 'button')
    .filter((p) => p.children === 'Save')[1]
    .onClick();
  message({ type: 'assistanceSettingsFailed', error: 'disk unavailable' });
  expect(elements(render(), 'textarea')[1].value).toBe('Debug draft');
  expect(elements(render(), 'button').filter((p) => p.children === 'Save')[1].disabled).toBe(false);
});

it('saves only the selected card and leaves other drafts unsaved', () => {
  elements(render(), 'textarea')[0].onChange({ target: { value: 'Hint draft' } });
  elements(render(), 'textarea')[1].onChange({ target: { value: 'Debug draft' } });
  elements(render(), 'button')
    .filter((p) => p.children === 'Save')[1]
    .onClick();
  const request = harness.send.mock.calls.at(-1)![0];
  expect(request.kind).toBe('debug');
  expect(request.options.hint.prompt).toBe(options.hint.prompt);
  expect(request.options.debug.prompt).toBe('Debug draft');
  message({ type: 'assistanceSettingsSaved' });
  expect(elements(render(), 'textarea')[0].value).toBe('Hint draft');
  expect(elements(render(), 'button').filter((p) => p.children === 'Save')[0].disabled).toBe(false);
});
