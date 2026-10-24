import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReadSession } from '../../src/infrastructure/codeforces/read-session';
const folders: string[] = [];
const sessions: ReadSession[] = [];
afterEach(async () => {
  sessions.splice(0).forEach((session) => session.dispose());
  await Promise.all(
    folders.splice(0).map((folder) => fs.rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'cfide-read-session-'));
  folders.push(folder);
  const script = path.join(folder, 'server.mjs');
  await fs.writeFile(
    script,
    `import {createInterface} from 'node:readline';
const input=createInterface({input:process.stdin});
input.on('line',line=>{const r=JSON.parse(line);const send=(type,data)=>console.log(JSON.stringify({protocol:1,requestId:r.requestId,type,ok:true,data}));
if(r.command==='disconnect'){send('problem',{index:'A'});setTimeout(()=>process.exit(1),10);return;}
if(r.command==='download'){send('problem',{index:'A'});send('assets',{index:'A'});send('result',{pid:process.pid});return;}
send('result',{pid:process.pid});});`,
  );
  const session = new ReadSession(process.execPath, [script]);
  sessions.push(session);
  return session;
}
it('reuses one process and waits for ordered async progress handlers before resolving', async () => {
  const session = await fixture();
  const first = await session.request({ command: 'capabilities' });
  const order: string[] = [];
  const result = await session.request({ command: 'download' }, async (event) => {
    if (event.type === 'problem') await new Promise((resolve) => setTimeout(resolve, 20));
    order.push(event.type);
  });
  expect(result).toEqual(first);
  expect(order).toEqual(['problem', 'assets']);
});
it('retains completed progress on disconnect and restarts for the next read', async () => {
  const session = await fixture();
  const order: string[] = [];
  await expect(
    session.request({ command: 'disconnect' }, async (event) => {
      order.push(event.type);
    }),
  ).rejects.toThrow('disconnected');
  expect(order).toEqual(['problem']);
  await expect(session.request({ command: 'capabilities' })).resolves.toHaveProperty('pid');
  session.dispose();
  expect(() => session.request({ command: 'capabilities' })).toThrow('closed');
});
