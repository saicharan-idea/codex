import { EventEmitter } from 'node:events';
export const realtimeBus = new EventEmitter();
realtimeBus.setMaxListeners(1000);
export type RealtimeEvent = { type: string; domain: 'food'|'grocery'; userId?: string; payload: unknown; ts: string };
export function publishEvent(event: RealtimeEvent){ realtimeBus.emit('event', event); }
