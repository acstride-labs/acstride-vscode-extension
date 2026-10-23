import en from './locales/en.json';
import zh from './locales/zh-CN.json';
import ru from './locales/ru.json';
import ja from './locales/ja.json';
export const locales = ['en', 'zh-CN', 'ru', 'ja'] as const;
export type Locale = (typeof locales)[number];
export type LocalePreference = Locale | 'auto';
export const catalogs: Record<Locale, Record<string, string>> = { en, 'zh-CN': zh, ru, ja };
const patterns = Object.keys(en)
  .filter((key) => /\{[a-zA-Z][a-zA-Z0-9]*\}/.test(key))
  .map((key) => {
    const names: string[] = [];
    const expression = key
      .split(/(\{[a-zA-Z][a-zA-Z0-9]*\})/)
      .map((part) => {
        if (/^\{[a-zA-Z][a-zA-Z0-9]*\}$/.test(part)) {
          names.push(part.slice(1, -1));
          return '([\\s\\S]+?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { key, names, regex: new RegExp('^' + expression + '$') };
  });
export function resolveLocale(preference = 'auto', editorLanguage = 'en'): Locale {
  if (locales.includes(preference as Locale)) return preference as Locale;
  const language = editorLanguage.toLowerCase();
  if (['zh-cn', 'zh', 'zh-hans'].includes(language)) return 'zh-CN';
  if (/^ru(?:-|$)/.test(language)) return 'ru';
  if (/^ja(?:-|$)/.test(language)) return 'ja';
  return 'en';
}
export function translate(
  locale: Locale,
  key: string,
  values: Record<string, string | number> = {},
): string {
  // Diagnostics remain in their original form in storage. Translate known parameterized messages at presentation time.
  if (!Object.hasOwn(en, key)) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(key);
      if (match)
        return translate(
          locale,
          pattern.key,
          Object.fromEntries(pattern.names.map((name, i) => [name, match[i + 1]])),
        );
    }
    for (const catalog of Object.values(catalogs)) {
      const original = Object.keys(catalog).find((candidate) => catalog[candidate] === key);
      if (original) {
        key = original;
        break;
      }
    }
  }
  const catalog = catalogs[locale] ?? catalogs.en;
  const message = Object.hasOwn(catalog, key)
    ? catalog[key]
    : Object.hasOwn(catalogs.en, key)
      ? catalogs.en[key]
      : key;
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
