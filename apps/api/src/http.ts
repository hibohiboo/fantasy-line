import type { APIGatewayProxyResult } from 'aws-lambda';

export function json(statusCode: number, data: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}
