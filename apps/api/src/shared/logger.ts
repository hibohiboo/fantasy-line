type LogLevel = 'INFO' | 'WARN' | 'ERROR';

interface LogFields {
  message: string;
  requestId: string;
  userId?: string;
  villageId?: number;
  [key: string]: unknown;
}

function log(level: LogLevel, fields: LogFields): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, ...fields }));
}

export const logInfo = (fields: LogFields) => log('INFO', fields);
export const logWarn = (fields: LogFields) => log('WARN', fields);
export const logError = (fields: LogFields) => log('ERROR', fields);
