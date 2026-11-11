import { handler, type QuoteEvent } from '../src/handler';
import { loadFixtureKb, loadRealKb, restoreRealKb } from './helpers';

const context = { awsRequestId: 'test-request-id' };

const validBody = {
  customerName: 'Jane Doe',
  age: 40,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'sw1a 1aa',
  previousClaims: 0,
};

const event = (overrides: Partial<QuoteEvent>): QuoteEvent => ({
  httpMethod: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(validBody),
  ...overrides,
});

const parseBody = (body: string): unknown => JSON.parse(body);

beforeEach(() => {
  loadRealKb();
});
afterEach(() => {
  restoreRealKb();
  jest.restoreAllMocks();
});

describe('handler', () => {
  it('200: returns a full quote for a valid request', async () => {
    const response = await handler(event({}), context);
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    expect(parseBody(response.body)).toEqual({
      monthlyPremium: 30,
      annualPremium: 360,
      riskBand: 'STANDARD',
      riskScore: 0,
      riskSummary: expect.stringContaining('No additional risk factors.'),
      coverageDetails: {
        propertyType: 'House',
        propertyValue: 300000,
        basePremium: 300,
        coverageLoadFactor: 1.2,
        riskMultiplier: 1,
      },
      appliedFactors: [],
      kbVersion: loadRealKb().version,
    });
  });

  it('400 VALIDATION_ERROR: lists each issue with its path', async () => {
    const response = await handler(event({ body: JSON.stringify({ ...validBody, age: 17, postcode: 'nope' }) }), context);
    expect(response.statusCode).toBe(400);
    const body = parseBody(response.body);
    expect(body).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(body).toHaveProperty('issues', expect.arrayContaining([
      expect.objectContaining({ path: 'age' }),
      expect.objectContaining({ path: 'postcode', message: 'Must be a valid UK postcode' }),
    ]));
  });

  it.each([['{not json'], [''], [null]])('400 INVALID_JSON for body %p', async (body) => {
    const response = await handler(event({ body }), context);
    expect(response.statusCode).toBe(400);
    expect(parseBody(response.body)).toEqual({ error: 'INVALID_JSON' });
  });

  it('405 for GET, with CORS and Allow headers', async () => {
    const response = await handler(event({ httpMethod: 'GET', body: null }), context);
    expect(response.statusCode).toBe(405);
    expect(response.headers).toMatchObject({ Allow: 'POST, OPTIONS', 'Access-Control-Allow-Origin': '*' });
  });

  it('204 for an OPTIONS preflight', async () => {
    const response = await handler(event({ httpMethod: 'OPTIONS', body: null }), context);
    expect(response.statusCode).toBe(204);
    expect(response.headers).toMatchObject({ 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  });

  it('500 INTERNAL_ERROR with the request id and no stack trace when the KB is invalid', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => loadFixtureKb('duplicate-id')).toThrow();

    const response = await handler(event({}), context);
    expect(response.statusCode).toBe(500);
    expect(parseBody(response.body)).toEqual({ error: 'INTERNAL_ERROR', requestId: 'test-request-id' });
    expect(response.body).not.toMatch(/at |Duplicate/);
    expect(consoleError).toHaveBeenCalled();
  });
});
