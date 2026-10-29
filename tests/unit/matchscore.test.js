const assert = require('assert');

function calculateMatchScore(jobSkills, studentSkills) {
  const jobSkillsLower = jobSkills.map(s => s.toLowerCase());
  const studentSkillsSet = new Set((studentSkills ?? []).map(s => s.toLowerCase()));
  const sharedSkills = jobSkillsLower.filter(s => studentSkillsSet.has(s)).length;
  if (!studentSkills || studentSkills.length === 0) return 72;
  return Math.min(99, Math.max(55, 62 + sharedSkills * 9));
}

describe('White Box Testing - Match Score Logic', function() {
  it('returns 72 when no student profile/skills', function() {
    assert.strictEqual(calculateMatchScore(["React", "Node"], undefined), 72);
    assert.strictEqual(calculateMatchScore(["React"], []), 72);
  });

  it('returns higher score with more shared skills', function() {
    const job = ["React", "TypeScript", "Node"];
    assert.strictEqual(calculateMatchScore(job, ["React"]), 62 + 1*9);
    assert.strictEqual(calculateMatchScore(job, ["React", "TypeScript"]), 80);
    assert.strictEqual(calculateMatchScore(job, ["React", "TypeScript", "Node"]), 89);
  });

  it('caps at 99 and floors at 55', function() {
    const job = ["A","B","C","D","E"];
    assert.strictEqual(calculateMatchScore(job, ["A","B","C","D","E","F"]), 99);
    const job2 = ["OnlyOne"];
    assert.strictEqual(calculateMatchScore(job2, []), 72);
  });

  it('is case-insensitive', function() {
    assert.strictEqual(calculateMatchScore(["REACT"], ["react"]), 71);
  });
});
