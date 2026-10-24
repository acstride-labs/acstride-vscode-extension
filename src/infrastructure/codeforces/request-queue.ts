type Job = {
  priority: number;
  run: () => Promise<unknown>;
  resolve: (value: any) => void;
  reject: (error: unknown) => void;
};
export class RequestQueue {
  private jobs: Job[] = [];
  private running = false;
  private stopped = false;
  schedule<T>(run: () => Promise<T>, priority = 10): Promise<T> {
    if (this.stopped) return Promise.reject(new Error('Codeforces connection closed.'));
    const promise = new Promise<T>((resolve, reject) => {
      this.jobs.push({ run, priority, resolve, reject });
    });
    void this.drain();
    return promise;
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length && !this.stopped) {
        this.jobs.sort((a, b) => a.priority - b.priority);
        const job = this.jobs.shift()!;
        try {
          job.resolve(await job.run());
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.stopped = true;
    for (const job of this.jobs.splice(0)) job.reject(new Error('Codeforces connection closed.'));
  }
}
