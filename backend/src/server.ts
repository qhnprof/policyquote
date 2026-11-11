import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { APIGatewayProxyResult } from 'aws-lambda';
import { handler, type QuoteEvent } from './handler';
import { loadKnowledgeBase } from './kb/kb-loader';

// Local HTTP adapter for `npm start` and the Docker image. In AWS, API Gateway calls handler() directly.

const DEFAULT_PORT = 3000;
const QUOTE_PATH = '/policy/quote';
const HEALTH_PATH = '/health';
const MAX_BODY_BYTES = 1_000_000;

class BodyTooLargeError extends Error {}

/** Node can give a repeated header as string[]; API Gateway's type wants a single string. */
function toEventHeaders(headers: IncomingHttpHeaders): QuoteEvent['headers'] {
  const result: QuoteEvent['headers'] = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) result[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

/**
 * Reads the body as UTF-8. An oversized body is drained (not buffered) and then rejected, so the
 * client still receives the 413 instead of a connection reset.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let bytes = 0;
    let tooLarge = false;
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      if (tooLarge) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => (tooLarge ? reject(new BodyTooLargeError()) : resolve(chunks.join(''))));
    req.on('error', reject);
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function writeResult(res: ServerResponse, result: APIGatewayProxyResult): void {
  const headers = Object.fromEntries(Object.entries(result.headers ?? {}).map(([name, value]) => [name, String(value)]));
  res.writeHead(result.statusCode, headers);
  res.end(result.body);
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (method === 'GET' && pathname === HEALTH_PATH) {
    writeJson(res, 200, { status: 'ok', kbVersion: loadKnowledgeBase().version });
    return;
  }

  if (pathname === QUOTE_PATH && (method === 'POST' || method === 'OPTIONS')) {
    const event: QuoteEvent = {
      httpMethod: method,
      headers: toEventHeaders(req.headers),
      body: method === 'POST' ? await readBody(req) : null,
    };
    writeResult(res, await handler(event, { awsRequestId: randomUUID() }));
    return;
  }

  writeJson(res, 404, { error: 'NOT_FOUND' });
}

export function createAppServer(): Server {
  return createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (error instanceof BodyTooLargeError) {
        writeJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
        return;
      }
      const requestId = randomUUID();
      console.error(`[${requestId}] Request failed:`, error);
      if (!res.headersSent) writeJson(res, 500, { error: 'INTERNAL_ERROR', requestId });
    });
  });
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${raw}`);
  return port;
}

if (require.main === module) {
  // Fail fast: an invalid KB stops the server (tsx watch restarts it when the KB is fixed).
  const kb = loadKnowledgeBase();
  const port = parsePort(process.env.PORT);
  createAppServer().listen(port, () => {
    console.log(`PolicyQuote API listening on http://localhost:${port} (KB v${kb.version}, ${kb.factors.length} factors)`);
  });
}
