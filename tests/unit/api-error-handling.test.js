const assert = require('assert');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

describe('Black Box Testing - API Error Handling & Integration', function() {
  this.timeout(10000);

  it('health endpoint returns correct content-type and status 200', async function() {
    const res = await fetch(`${BASE_URL}/healthz`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  it('public stats returns all required fields with non-negative numbers', async function() {
    const res = await fetch(`${BASE_URL}/api/public/stats`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(typeof data.students === 'number' && data.students >= 0);
    assert(typeof data.companies === 'number' && data.companies >= 0);
    assert(typeof data.placements === 'number' && data.placements >= 0);
    assert(typeof data.internships === 'number' && data.internships >= 0);
    assert.strictEqual(data.sampleData, true);
  });

  it('opportunities list returns items array with pagination metadata', async function() {
    const res = await fetch(`${BASE_URL}/api/opportunities?page=1&pageSize=5`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.items));
    assert.strictEqual(data.page, 1);
    assert.strictEqual(data.pageSize, 5);
    assert(typeof data.total === 'number');
  });

  it('filtering by type returns only matching opportunities', async function() {
    const res = await fetch(`${BASE_URL}/api/opportunities?type=internship`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.items));
    data.items.forEach(item => {
      assert.strictEqual(item.type, 'internship');
    });
  });

  it('getting single opportunity with a valid ID returns complete object', async function() {
    // Dynamically retrieve the first valid opportunity ID from the database
    const listRes = await fetch(`${BASE_URL}/api/opportunities?pageSize=1`);
    assert.strictEqual(listRes.status, 200);
    const listData = await listRes.json();
    assert(listData.items.length > 0, 'No opportunities found to test single fetch');
    const validId = listData.items[0].id;

    const res = await fetch(`${BASE_URL}/api/opportunities/${validId}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, validId);
    assert(typeof data.title === 'string' && data.title.length > 0);
    assert(typeof data.company === 'string' && data.company.length > 0);
    assert(Array.isArray(data.skills));
    assert(typeof data.stipend === 'number');
  });

  it('opportunity object contains all expected schema fields', async function() {
    const listRes = await fetch(`${BASE_URL}/api/opportunities?pageSize=1`);
    const listData = await listRes.json();
    const validId = listData.items[0].id;

    const res = await fetch(`${BASE_URL}/api/opportunities/${validId}`);
    const data = await res.json();
    const requiredFields = [
      'id', 'title', 'company', 'companyId', 'location', 'mode',
      'type', 'department', 'deadline', 'skills', 'stipend', 'matchScore'
    ];
    requiredFields.forEach(field => {
      assert.ok(field in data, `Missing required field: ${field}`);
    });
  });

  it('getting non-existent or invalid opportunity id gracefully returns 404', async function() {
    const res = await fetch(`${BASE_URL}/api/opportunities/non-existent-uuid-000`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.ok(data.error, 'Should contain error description');
  });

  it('requesting invalid page parameter triggers validation error', async function() {
    const res = await fetch(`${BASE_URL}/api/opportunities?page=invalid_number`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error, 'Should contain validation error message');
  });
});
