// A page-local clock: pausing and switching tasks retain measured time, while
// leaving the page discards it. Only completing a task submits measured minutes.
export class FocusClock {
  private elapsed = new Map<string, number>();
  private startedAt = 0;
  activeTask: string | null = null;

  start(taskId: string, now: number) {
    this.pause(now);
    if (!this.elapsed.has(taskId)) this.elapsed.set(taskId, 0);
    this.activeTask = taskId;
    this.startedAt = now;
  }

  pause(now: number) {
    if (this.activeTask) this.elapsed.set(this.activeTask, this.milliseconds(this.activeTask, now));
    this.activeTask = null;
  }

  milliseconds(taskId: string, now: number) {
    return (this.elapsed.get(taskId) || 0) + (this.activeTask === taskId ? Math.max(0, now - this.startedAt) : 0);
  }

  minutes(taskId: string, now: number): number | undefined {
    return this.elapsed.has(taskId) ? Math.min(1440, Math.floor(this.milliseconds(taskId, now) / 60000)) : undefined;
  }

  remove(taskId: string) {
    if (this.activeTask === taskId) this.activeTask = null;
    this.elapsed.delete(taskId);
  }
}
