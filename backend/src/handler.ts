import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { scoreQuote } from './engine/score-quote';
import { loadKnowledgeBase } from './kb/kb-loader';
import { quoteRequestSchema } from './validation/quote-request.schema';

/** The parts of an API Gateway event we use. A real event fits; tests and server.ts build one without casts. */
export type QuoteEvent = Pick<APIGatewayProxyEvent, 'httpMethod' | 'headers' | 'body'>;
export type QuoteContext = Pick<Context, 'awsRequestId'>;

const ALLOWED_METHODS = 'POST, OPTIONS';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': ALLOWED_METHODS,
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;

function respond(statusCode: number, body?: unknown, extraHeaders: Record<string, string> = {}): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...RESPONSE_HEADERS, ...extraHeaders },
    body: body === undefined ? '' : JSON.stringify(body),
  };
}

/** Lambda entry point for POST /policy/quote. HTTP shape and validation only; scoring lives in the engine. */
export async function handler(event: QuoteEvent, context: QuoteContext): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod.toUpperCase();
  if (method === 'OPTIONS') return respond(204);
  if (method !== 'POST') return respond(405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: ALLOWED_METHODS });

  let payload: unknown;
  try {
    payload = JSON.parse(event.body ?? '');
  } catch {
    return respond(400, { error: 'INVALID_JSON' });
  }

  const parsed = quoteRequestSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return respond(400, { error: 'VALIDATION_ERROR', issues });
  }

  try {
    return respond(200, scoreQuote(parsed.data, loadKnowledgeBase()));
  } catch (error) {
    console.error(`[${context.awsRequestId}] Quote failed:`, error);
    return respond(500, { error: 'INTERNAL_ERROR', requestId: context.awsRequestId });
  }
}
