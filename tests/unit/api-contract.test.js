const assert = require('assert');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

describe('Black Box Testing - API Contract Validation (Live Backend)', function() {
  this.timeout(25000);

  it('health endpoint should return HTTP 200 and { status: "ok" }', async function() {
    const res = await fetch(`${BASE_URL}/healthz`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('application/json'));
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert(typeof body.status === 'string');
  });

  it('public stats should return required numeric metrics >= 0', async function() {
    const res = await fetch(`${BASE_URL}/api/public/stats`);
    assert.strictEqual(res.status, 200);
    const stats = await res.json();
    assert(typeof stats.students === 'number', 'students must be a number');
    assert(typeof stats.companies === 'number', 'companies must be a number');
    assert(typeof stats.placements === 'number', 'placements must be a number');
    assert(typeof stats.internships === 'number', 'internships must be a number');
    assert(stats.students >= 0, 'students count cannot be negative');
    assert(stats.companies >= 0, 'companies count cannot be negative');
    assert(stats.placements >= 0, 'placements count cannot be negative');
    assert(stats.internships >= 0, 'internships count cannot be negative');
    assert.strictEqual(stats.sampleData, true);
  });

  it('opportunities list should return paginated envelope with items array', async function() {
    const res = await fetch(`${BASE_URL}/api/opportunities?page=1&pageSize=6`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert(Array.isArray(body.items), 'items must be an array');
    assert(typeof body.total === 'number', 'total must be a number');
    assert(typeof body.page === 'number', 'page must be a number');
    assert(typeof body.pageSize === 'number', 'pageSize must be a number');
    assert.strictEqual(body.page, 1);
    assert.strictEqual(body.pageSize, 6);
    assert(body.items.length <= 6, 'items count cannot exceed pageSize');
  });

  it('opportunity items conform to required schema and types', async function() {
    const res = await fetch(`${BASE_URL}/api/opportunities?page=1&pageSize=1`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert(body.items.length > 0, 'Should have at least one opportunity in database');
    const item = body.items[0];

    assert(typeof item.id === 'string' && item.id.length > 0, 'id must be non-empty string');
    assert(typeof item.title === 'string' && item.title.length > 0, 'title must be non-empty string');
    assert(typeof item.company === 'string' && item.company.length > 0, 'company must be non-empty string');
    assert(['internship', 'full-time'].includes(item.type), `unexpected type: ${item.type}`);
    assert(['onsite', 'hybrid', 'remote'].includes(item.mode), `unexpected mode: ${item.mode}`);
    assert(Array.isArray(item.skills), 'skills must be an array');
    assert(typeof item.matchScore === 'number', 'matchScore must be a number');
    assert(item.matchScore >= 55 && item.matchScore <= 99, 'matchScore must be between 55 and 99');
  });
});
