import { useEffect, useState } from 'react';
import { resolveLocale, translate, type Locale } from '../../src/shared/i18n';
export function useI18n() {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(document.documentElement.lang));
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type !== 'locale') return;
      const next = resolveLocale(event.data.locale);
      document.documentElement.lang = next;
      setLocale(next);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  return {
    locale,
    t: (key: string, values?: Record<string, string | number>) => translate(locale, key, values),
  };
}
