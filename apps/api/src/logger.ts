export function logInfo(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', ...fields }));
}
