import { createEvent, type H3Event } from "h3";
import type { Env } from "../server/lib/types";

export interface TestEventOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** Build an H3 event stubbed with Cloudflare bindings for handler-level tests. */
export function makeEvent(path: string, opts: TestEventOptions): H3Event {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    setHeader(name: string, value: string): void {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
    end(): void {},
    write(): void {},
  };
  const req = {
    method: opts.method ?? "GET",
    url: path,
    headers: opts.headers ?? {},
    rawHeaders: [] as string[],
    body: opts.body,
  };
  const event = createEvent(req as never, res as never);
  event.context.cloudflare = {
    env: opts.env,
    ctx: opts.waitUntil ? { waitUntil: opts.waitUntil } : undefined,
  };
  return event;
}

export function responseStatus(event: H3Event): number {
  return (event.node.res as { statusCode?: number }).statusCode ?? 200;
}

export function responseHeader(event: H3Event, name: string): string | undefined {
  return (event.node.res as { getHeader?: (n: string) => string | undefined }).getHeader?.(name);
}

/** waitUntil collector: lets the test await dispatched work. */
export function waitCollector(): {
  waitUntil: (promise: Promise<unknown>) => void;
  flush: () => Promise<void>;
} {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (promise: Promise<unknown>): void => {
      pending.push(promise);
    },
    flush: (): Promise<void> => Promise.allSettled(pending).then(() => undefined),
  };
}
