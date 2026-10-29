const assert = require('assert');

function calculateMatchScore(jobSkills, studentSkills) {
  const jobSkillsLower = jobSkills.map(s => s.toLowerCase());
  const studentSkillsSet = new Set((studentSkills ?? []).map(s => s.toLowerCase()));
  const sharedSkills = jobSkillsLower.filter(s => studentSkillsSet.has(s)).length;
  if (!studentSkills || studentSkills.length === 0) return 72;
  return Math.min(99, Math.max(55, 62 + sharedSkills * 9));
}

describe('White Box Testing - Match Score Edge Cases', function() {
  it('empty job skills array returns base formula score', function() {
    assert.strictEqual(calculateMatchScore([], ['React', 'Node']), 62);
  });

  it('single matching skill gives 71', function() {
    assert.strictEqual(calculateMatchScore(['React'], ['React', 'Node']), 71);
  });

  it('all job skills matched gives maximum increment', function() {
    assert.strictEqual(calculateMatchScore(['React', 'Node', 'Python'], ['React', 'Node', 'Python', 'Go']), 89);
  });

  it('no matching skills still returns base score', function() {
    assert.strictEqual(calculateMatchScore(['Java', 'C++'], ['React', 'Node']), 62);
  });

  it('score never exceeds 99 cap', function() {
    const result = calculateMatchScore(['A','B','C','D','E','F','G','H','I','J'], ['A','B','C','D','E','F','G','H','I','J']);
    assert.strictEqual(result, 99);
  });

  it('score never falls below 55 floor', function() {
    const result = calculateMatchScore(['A'], []);
    assert.strictEqual(result, 72);
  });

  it('duplicate skills in job list count each time', function() {
    assert.strictEqual(calculateMatchScore(['React', 'React', 'Node'], ['React', 'Node']), 89);
  });

  it('null student skills returns default', function() {
    assert.strictEqual(calculateMatchScore(['React'], null), 72);
  });
});
