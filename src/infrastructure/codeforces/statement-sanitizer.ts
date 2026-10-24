import sanitizeHtml from 'sanitize-html';

// Defense in depth for external process data. No website parsing or networking.
export function sanitizeStatement(html: string, assets: string[]) {
  const names = new Set(assets);
  return sanitizeHtml(html, {
    allowedTags: [
      'div',
      'span',
      'p',
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'sub',
      'sup',
      'pre',
      'code',
      'br',
      'ul',
      'ol',
      'li',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'img',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'hr',
      'blockquote',
    ],
    allowedAttributes: {
      '*': ['class'],
      img: ['src', 'alt', 'width', 'height'],
      a: ['href', 'title'],
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: { img: ['https', 'cfide-asset'] },
    allowProtocolRelative: false,
    transformTags: {
      img: (_tag, attrs) => {
        const source = attrs.src || '';
        if (source.startsWith('acstride-asset:')) {
          const name = source.slice('acstride-asset:'.length);
          attrs.src =
            names.has(name) && /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/.test(name)
              ? `cfide-asset:${name}`
              : '';
        } else attrs.src = '';
        return { tagName: 'img', attribs: attrs };
      },
    },
  });
}
