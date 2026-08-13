export const log = {
  info: (msg: string | object, ...args: unknown[]): void =>
    console.log(JSON.stringify({ level: "info", msg, ...args })),
  warn: (msg: string | object, ...args: unknown[]): void =>
    console.warn(JSON.stringify({ level: "warn", msg, ...args })),
  error: (msg: string | object, ...args: unknown[]): void =>
    console.error(JSON.stringify({ level: "error", msg, ...args })),
  fatal: (msg: string | object, ...args: unknown[]): void =>
    console.error(JSON.stringify({ level: "fatal", msg, ...args })),
};
