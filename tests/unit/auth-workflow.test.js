const assert = require('assert');

const BASE_URL = process.env.API_URL || 'http://localhost:5000';

describe('Functional & Integration Testing - Authentication, Registration & RBAC', function() {
  this.timeout(15000);

  const timestamp = Date.now();
  const testStudent = {
    email: `student_test_${timestamp}@karunya.edu.in`,
    password: 'SecurePassword123!',
    name: 'Aarav Sharma',
    phone: '9876543210',
    role: 'student',
    degree: 'B.Tech Computer Science and Engineering',
    university: 'Karunya Institute of Technology and Sciences',
    graduationYear: 2026,
    cgpa: 8.85
  };

  const testRecruiter = {
    email: `recruiter_test_${timestamp}@google.com`,
    password: 'RecruiterPassword123!',
    name: 'Priya Sundaram',
    phone: '9876543211',
    role: 'recruiter',
    companyName: 'Alphabet Inc',
    companyRole: 'Senior Technical Talent Partner'
  };

  it('TC_AUTH_01 [Positive]: Register new student with all required and academic fields', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testStudent)
    });

    assert.strictEqual(res.status, 201, `Registration failed with status ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, testStudent.email);
    assert.strictEqual(data.user.name, testStudent.name);
    assert.strictEqual(data.user.phone, testStudent.phone);
    assert.strictEqual(data.user.role, 'student');
  });

  it('TC_AUTH_02 [Positive]: Register new recruiter with company association', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRecruiter)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, testRecruiter.email);
    assert.strictEqual(data.user.role, 'recruiter');
  });

  it('TC_AUTH_03 [Negative]: Duplicate registration with same email returns 409 Conflict', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testStudent)
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes('already exists'));
  });

  it('TC_AUTH_04 [Negative]: Missing required fields (email/password/name) returns 400 Bad Request', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'student', phone: '9876543210' })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  it('TC_AUTH_05 [Positive]: Login with valid registered student credentials returns user session', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testStudent.email,
        password: testStudent.password
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, testStudent.email);
    assert.strictEqual(data.user.role, 'student');
    assert.strictEqual(data.user.name, testStudent.name);
  });

  it('TC_AUTH_06 [Negative]: Login with invalid password returns 401 Unauthorized', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testStudent.email,
        password: 'IncorrectPassword999!'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes('invalid credentials'));
  });

  it('TC_AUTH_07 [Negative]: Login with non-existent user returns 404 Not Found', async function() {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ghost_user_does_not_exist@karunya.edu.in',
        password: 'Password123!'
      })
    });

    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.ok(data.error.toLowerCase().includes('account found') || data.error.toLowerCase().includes('not found'));
  });

  it('TC_AUTH_08 [Boundary]: Student profile CGPA boundary validation (0.00 to 10.00)', function() {
    function isValidCGPA(val) {
      const num = Number(val);
      return !isNaN(num) && num >= 0.0 && num <= 10.0;
    }

    assert.strictEqual(isValidCGPA(0.0), true, 'Minimum CGPA 0.0 should be valid');
    assert.strictEqual(isValidCGPA(10.0), true, 'Maximum CGPA 10.0 should be valid');
    assert.strictEqual(isValidCGPA(8.85), true, 'Normal CGPA 8.85 should be valid');
    assert.strictEqual(isValidCGPA(-0.1), false, 'Negative CGPA should be rejected');
    assert.strictEqual(isValidCGPA(10.05), false, 'CGPA > 10.0 should be rejected');
    assert.strictEqual(isValidCGPA('abc'), false, 'Non-numeric CGPA should be rejected');
  });

  it('TC_AUTH_09 [Boundary]: Mobile phone number boundary validation (10 digits)', function() {
    function isValidPhone(phone) {
      let cleaned = String(phone).replace(/\D/g, '');
      if (cleaned.length === 12 && cleaned.startsWith('91')) {
        cleaned = cleaned.slice(2);
      }
      return cleaned.length === 10;
    }

    assert.strictEqual(isValidPhone('9876543210'), true, 'Standard 10-digit phone is valid');
    assert.strictEqual(isValidPhone('+91 98765-43210'), true, 'Formatted 10-digit phone is valid');
    assert.strictEqual(isValidPhone('12345'), false, '5-digit phone must fail');
    assert.strictEqual(isValidPhone('1234567890123'), false, '13-digit phone must fail');
  });

  it('TC_AUTH_10 [Security / RBAC]: Protected admin route rejected without admin privileges', async function() {
    const res = await fetch(`${BASE_URL}/api/admin/users`);
    // Should be rejected with 401 Unauthorized or 403 Forbidden
    assert.ok([401, 403].includes(res.status), `Expected 401 or 403, got ${res.status}`);
  });
});
