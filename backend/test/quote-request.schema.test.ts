import { QUOTE_REQUEST_FIELDS, quoteRequestSchema } from '../src/validation/quote-request.schema';

const valid = {
  customerName: 'Jane Doe',
  age: 40,
  propertyType: 'House',
  propertyValue: 300000,
  postcode: 'SW1A 1AA',
  previousClaims: 0,
};

describe('quoteRequestSchema', () => {
  it('accepts a valid request', () => {
    expect(quoteRequestSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['ex4 1aa', 'EX4 1AA'],
    ['EX41AA', 'EX4 1AA'],
    ['  sw1a   1aa ', 'SW1A 1AA'],
    ['m1 1ae', 'M1 1AE'],
  ])('normalises postcode %j to %j', (input, expected) => {
    expect(quoteRequestSchema.parse({ ...valid, postcode: input }).postcode).toBe(expected);
  });

  it.each(['', 'EX4', '12345', 'EX4 1A', 'EXX4 1AA'])('rejects postcode %j', (postcode) => {
    expect(quoteRequestSchema.safeParse({ ...valid, postcode }).success).toBe(false);
  });

  it.each([17, 121, 40.5])('rejects age %p', (age) => {
    const result = quoteRequestSchema.safeParse({ ...valid, age });
    expect(result.error?.issues[0]?.path).toEqual(['age']);
  });

  it.each([18, 120])('accepts age %p at the boundary', (age) => {
    expect(quoteRequestSchema.safeParse({ ...valid, age }).success).toBe(true);
  });

  it.each([
    ['propertyType', 'Castle'],
    ['propertyValue', 0],
    ['propertyValue', 50_000_001],
    ['previousClaims', -1],
    ['previousClaims', 21],
    ['customerName', '   '],
    ['age', '40'],
  ])('rejects %s = %p', (fieldName, value) => {
    expect(quoteRequestSchema.safeParse({ ...valid, [fieldName]: value }).success).toBe(false);
  });

  it('trims customerName', () => {
    expect(quoteRequestSchema.parse({ ...valid, customerName: '  Jane  ' }).customerName).toBe('Jane');
  });

  it('exports the request field names', () => {
    expect(QUOTE_REQUEST_FIELDS).toEqual([
      'customerName',
      'age',
      'propertyType',
      'propertyValue',
      'postcode',
      'previousClaims',
    ]);
  });
});
