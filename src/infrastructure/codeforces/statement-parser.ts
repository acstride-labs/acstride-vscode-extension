import * as cheerio from 'cheerio';
import sanitizeHtml from 'sanitize-html';
import type { Statement } from '../../domain/contest';
import type { TestCase } from '../../domain/models';

export function parseStatement(
  html: string,
  url: string,
): { statement: Statement; samples: TestCase[] } {
  const $ = cheerio.load(html),
    root = $('.problem-statement').first();
  if (!root.length)
    throw new Error(
      'Codeforces did not return a problem statement. The problem may be unavailable or require site verification.',
    );
  const preText = (selector: string) =>
    root
      .find(selector)
      .toArray()
      .map((node) => {
        const pre = $(node).clone();
        pre.find('br').replaceWith('\n');
        pre.find('div.test-example-line').each((_, div) => {
          $(div).append('\n');
        });
        return pre.text().replace(/\r\n/g, '\n').replace(/\n?$/, '\n');
      });
  const inputs = preText('.sample-test .input pre'),
    outputs = preText('.sample-test .output pre');
  if (inputs.length !== outputs.length)
    throw new Error(
      'Sample input/output counts differ; statement cached only after a valid parse.',
    );
  root.find('img').each((_, node) => {
    const src = $(node).attr('src');
    if (src) {
      try {
        const target = new URL(src, url);
        if (target.protocol === 'https:') $(node).attr('src', target.href);
        else $(node).remove();
      } catch {
        $(node).remove();
      }
    }
  });
  root.find('a').each((_, node) => {
    const href = $(node).attr('href');
    if (href) {
      try {
        $(node).attr('href', new URL(href, url).href);
      } catch {
        $(node).removeAttr('href');
      }
    }
  });
  const clean = sanitizeHtml(root.html() || '', {
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
    allowProtocolRelative: false,
  });
  return {
    statement: {
      title: root.find('.title').first().text(),
      html: clean,
      timeLimit: root.find('.time-limit').text(),
      memoryLimit: root.find('.memory-limit').text(),
      fetchedAt: Date.now(),
    },
    samples: inputs.map((input, i) => ({ id: `sample-${i + 1}`, input, expected: outputs[i] })),
  };
}
