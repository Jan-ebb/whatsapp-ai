import { EventEmitter } from 'node:events';

export interface SessionEvents {
  locked: () => void;
  unlocked: () => void;
  activity: () => void;
}

export class SessionManager extends EventEmitter {
  private locked: boolean = true;
  private lastActivity: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs: number;

  constructor(idleTimeoutMinutes: number) {
    super();
    this.idleTimeoutMs = idleTimeoutMinutes * 60 * 1000;
  }

  /**
   * Unlock the session.
   */
  unlock(): void {
    this.locked = false;
    this.lastActivity = Date.now();
    this.startIdleTimer();
    this.emit('unlocked');
  }

  /**
   * Lock the session.
   */
  lock(): void {
    this.locked = true;
    this.stopIdleTimer();
    this.emit('locked');
  }

  /**
   * Check if session is locked.
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Record activity to reset idle timer.
   */
  recordActivity(): void {
    if (this.locked) return;

    this.lastActivity = Date.now();
    this.emit('activity');

    // Reset idle timer
    this.startIdleTimer();
  }

  /**
   * Get time since last activity in ms.
   */
  getIdleTime(): number {
    return Date.now() - this.lastActivity;
  }

  private startIdleTimer(): void {
    this.stopIdleTimer();

    if (this.idleTimeoutMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.lock();
      }, this.idleTimeoutMs);
    }
  }

  private stopIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.stopIdleTimer();
    this.removeAllListeners();
  }
}
