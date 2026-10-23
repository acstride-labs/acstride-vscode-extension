import type { WebviewRequest } from '../../src/shared/protocol';
import type { contestRequestSchema } from '../../src/shared/contest-protocol';
import type { z } from 'zod';
import type { settingsRequestSchema } from '../../src/shared/settings-protocol';
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const api = acquireVsCodeApi();
export const send = (
  message:
    WebviewRequest | z.infer<typeof contestRequestSchema> | z.infer<typeof settingsRequestSchema>,
) => api.postMessage(message);
