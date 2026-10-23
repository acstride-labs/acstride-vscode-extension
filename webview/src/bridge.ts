import type { WebviewRequest } from '../../src/shared/protocol';
import type { contestRequestSchema } from '../../src/shared/contest-protocol';
import type { z } from 'zod';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
export const send = (message: WebviewRequest | z.infer<typeof contestRequestSchema>) =>
  api.postMessage(message);
