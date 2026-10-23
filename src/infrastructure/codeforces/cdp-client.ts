import WebSocket from 'ws';

/** One local, private-profile Chrome connection. No arbitrary remote endpoints. */
export class CdpClient {
  private listeners = new Set<(method: string, params: any, sessionId?: string) => void>();
  onEvent(listener: (method: string, params: any, sessionId?: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  get connected() {
    return this.socket.readyState === WebSocket.OPEN;
  }
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private constructor(private socket: WebSocket) {
    socket.on('message', (bytes) => {
      try {
        const message = JSON.parse(bytes.toString());
        if (!message.id && message.method) {
          for (const listener of this.listeners)
            listener(message.method, message.params, message.sessionId);
          return;
        }
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.error)
          request.reject(new Error(`Chrome command failed: ${message.error.message}`));
        else request.resolve(message.result || {});
      } catch {
        this.close();
      }
    });
    socket.on('close', () => this.rejectAll());
    socket.on('error', () => this.rejectAll());
  }
  static async connect(endpoint: string) {
    const url = new URL(endpoint);
    if (
      url.protocol !== 'ws:' ||
      url.hostname !== '127.0.0.1' ||
      !/^\/devtools\/browser\/[A-Za-z0-9-]+$/.test(url.pathname)
    )
      throw new Error('Only the dedicated browser’s loopback debugging connection is allowed.');
    const socket = new WebSocket(url, { handshakeTimeout: 5000, maxPayload: 12000000 });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new CdpClient(socket);
  }
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
    if (this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('Dedicated browser disconnected. Open it and reconnect.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Chrome command timed out. No write was retried.'));
      }, 20000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
        (error) => {
          if (error) {
            clearTimeout(timer);
            this.pending.delete(id);
            reject(error);
          }
        },
      );
    });
  }
  private rejectAll() {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(
        new Error(
          'Dedicated browser disconnected. Submission receipts may be uncertain; do not blindly resubmit.',
        ),
      );
    }
    this.pending.clear();
  }
  close() {
    this.rejectAll();
    this.socket.close();
  }
}
