import { EventEmitter } from 'node:events';
import type { ScheduledMessageStore } from '../storage/scheduled.js';
import type { ScheduledMessage } from '../storage/types.js';

export interface SchedulerEvents {
  'message.due': (message: ScheduledMessage) => void;
  'message.sent': (message: ScheduledMessage) => void;
  'message.failed': (message: ScheduledMessage, error: Error) => void;
}

export class MessageScheduler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private readonly checkIntervalMs: number;

  constructor(
    private store: ScheduledMessageStore,
    checkIntervalSeconds: number = 30
  ) {
    super();
    this.checkIntervalMs = checkIntervalSeconds * 1000;
  }

  /**
   * Start the scheduler.
   */
  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => this.checkDueMessages(), this.checkIntervalMs);
    // Also check immediately
    this.checkDueMessages();
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Schedule a new message.
   */
  schedule(
    chatJid: string,
    content: string,
    scheduledTime: Date,
    mediaPath?: string
  ): ScheduledMessage {
    return this.store.create({
      chatJid,
      content,
      scheduledTime: scheduledTime.toISOString(),
      mediaPath: mediaPath || null,
    });
  }

  /**
   * Cancel a scheduled message.
   */
  cancel(id: string): boolean {
    return this.store.cancel(id);
  }

  /**
   * Get all pending messages.
   */
  getPending(): ScheduledMessage[] {
    return this.store.getPending();
  }

  /**
   * Mark a message as sent.
   */
  markSent(id: string): void {
    this.store.updateStatus(id, 'sent');
  }

  /**
   * Mark a message as failed.
   */
  markFailed(id: string): void {
    this.store.updateStatus(id, 'failed');
  }

  private checkDueMessages(): void {
    const dueMessages = this.store.getDue();

    for (const message of dueMessages) {
      this.emit('message.due', message);
    }
  }
}
