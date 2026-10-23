// A pinned desktop Chrome compatibility profile, not a real browser or a challenge solver.
// Let fetch manage compression, transport negotiation, Host and Content-Length itself.
export function browserNavigationHeaders(method: string, referer?: string): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    ...(referer ? { Referer: referer } : {}),
    ...(method === 'POST'
      ? {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: 'https://codeforces.com',
        }
      : {}),
  };
}
