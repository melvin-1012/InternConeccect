const assert = require('assert');

describe('Black Box Testing - API Error Handling', function() {
  it('health endpoint returns correct content-type', async function() {
    const res = await fetch('http://localhost:5000/healthz');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  it('public stats returns all required fields', async function() {
    const res = await fetch('http://localhost:5000/api/public/stats');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(typeof data.students === 'number' && data.students >= 0);
    assert(typeof data.companies === 'number' && data.companies >= 0);
    assert(typeof data.placements === 'number' && data.placements >= 0);
    assert(typeof data.internships === 'number' && data.internships >= 0);
    assert.strictEqual(data.sampleData, true);
  });

  it('opportunities list returns items array with pagination', async function() {
    const res = await fetch('http://localhost:5000/api/opportunities?page=1&pageSize=5');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.items));
    assert.strictEqual(data.page, 1);
    assert.strictEqual(data.pageSize, 5);
    assert(typeof data.total === 'number');
  });

  it('filtering by type returns only matching opportunities', async function() {
    const res = await fetch('http://localhost:5000/api/opportunities?type=internship');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    data.items.forEach(item => {
      assert.strictEqual(item.type, 'internship');
    });
  });

  it('getting single opportunity returns complete object', async function() {
    const res = await fetch('http://localhost:5000/api/opportunities/opp_1');
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, 'opp_1');
    assert(typeof data.title === 'string' && data.title.length > 0);
    assert(typeof data.company === 'string' && data.company.length > 0);
    assert(Array.isArray(data.skills));
    assert(typeof data.stipend === 'number');
  });

  it('opportunity object contains all expected fields', async function() {
    const res = await fetch('http://localhost:5000/api/opportunities/opp_1');
    const data = await res.json();
    const requiredFields = ['id','title','company','location','mode','type','department','deadline','skills','stipend','matchScore'];
    requiredFields.forEach(field => {
      assert.ok(field in data, `Missing field: ${field}`);
    });
  });
});
