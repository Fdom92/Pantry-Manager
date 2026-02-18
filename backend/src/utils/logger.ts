type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: any;
}

export const logger = {
  info(message: string, meta?: Record<string, any>): void {
    log('info', message, meta);
  },

  warn(message: string, meta?: Record<string, any>): void {
    log('warn', message, meta);
  },

  error(message: string, meta?: Record<string, any>): void {
    log('error', message, meta);
  },

  debug(message: string, meta?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development') {
      log('debug', message, meta);
    }
  },
};

function log(level: LogLevel, message: string, meta?: Record<string, any>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  // In production, output structured JSON for Render
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    // In development, use readable format
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[${level.toUpperCase()}] ${message}${metaStr}`);
  }
}
