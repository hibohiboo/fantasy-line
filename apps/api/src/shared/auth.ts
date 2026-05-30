import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { json } from './http';

export function getOwnerId(
  event: APIGatewayProxyEvent,
): string | APIGatewayProxyResult {
  const ownerId = event.headers?.['X-User-Id'];
  if (!ownerId) {
    return json(401, { error: 'Unauthorized' });
  }
  return ownerId;
}
