import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  const message = event.queryStringParameters ?? 'echo';
  return {
    statusCode: 200,
    headers: { 'Content-type': 'application/json' },
    body: JSON.stringify({ message }),
  };
};
