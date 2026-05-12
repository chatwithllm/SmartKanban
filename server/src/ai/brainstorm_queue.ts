import { runBrainstorm, failBrainstorm } from './brainstorm.js';

type Runner = (insightId: string) => Promise<void>;

let runner: Runner = runBrainstorm;
let onFailure: (insightId: string, error: string) => Promise<void> = failBrainstorm;

const queue: string[] = [];
let running = false;

export function enqueueBrainstorm(insightId: string): void {
  queue.push(insightId);
  if (!running) void drain();
}

async function drain(): Promise<void> {
  running = true;
  while (queue.length > 0) {
    const id = queue.shift()!;
    try {
      await runner(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      try {
        await onFailure(id, msg);
      } catch {
        console.warn('brainstorm queue failure handler threw:', msg);
      }
    }
  }
  running = false;
}

// Test-only hooks
export function _setRunnerForTest(r: Runner): void { runner = r; }
export function _setOnFailureForTest(f: typeof onFailure): void { onFailure = f; }
export function _resetForTest(): void {
  runner = runBrainstorm;
  onFailure = failBrainstorm;
  queue.length = 0;
  running = false;
}
export async function _drainOnceForTest(): Promise<void> {
  while (running || queue.length > 0) {
    await new Promise((r) => setTimeout(r, 5));
  }
}
