const LEVELS = ["error", "warn", "info", "debug"] as const;

export type LogLevel = (typeof LEVELS)[number];

function levelRank(level: LogLevel): number {
  return LEVELS.indexOf(level);
}

function currentLevel(): LogLevel {
  const raw = process.env["LOG_LEVEL"];
  if (raw !== undefined && (LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }
  return "info";
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (levelRank(level) > levelRank(currentLevel())) {
    return;
  }
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  });
  process.stderr.write(line + "\n");
}

export const logger = {
  error(message: string, fields?: Record<string, unknown>): void {
    write("error", message, fields);
  },
  warn(message: string, fields?: Record<string, unknown>): void {
    write("warn", message, fields);
  },
  info(message: string, fields?: Record<string, unknown>): void {
    write("info", message, fields);
  },
  debug(message: string, fields?: Record<string, unknown>): void {
    write("debug", message, fields);
  },
};
