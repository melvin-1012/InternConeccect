const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

const allOpportunities = [
  {
    id: 'opp_1',
    title: 'Software Engineering Intern',
    company: 'Tech Corp',
    type: 'internship',
    mode: 'hybrid',
    location: 'Mumbai',
    deadline: '2026-12-31',
    skills: ['React', 'Node.js'],
    stipend: 15000,
    verified: true,
    matchScore: 85,
  },
  {
    id: 'opp_2',
    title: 'Frontend Developer Intern',
    company: 'Web Solutions',
    type: 'internship',
    mode: 'remote',
    location: 'Bangalore',
    deadline: '2026-11-15',
    skills: ['React', 'TypeScript'],
    stipend: 12000,
    verified: true,
    matchScore: 78,
  },
  {
    id: 'opp_3',
    title: 'Backend Engineer Intern',
    company: 'Data Systems',
    type: 'internship',
    mode: 'onsite',
    location: 'Delhi',
    deadline: '2026-10-30',
    skills: ['Node.js', 'Python'],
    stipend: 18000,
    verified: false,
    matchScore: 71,
  },
];

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/public/stats', (req, res) => {
  res.json({
    students: 150,
    companies: 25,
    placements: 80,
    internships: 45,
    sampleData: true,
  });
});

app.get('/api/opportunities', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 12;
  const type = req.query.type;

  let filtered = allOpportunities;
  if (type) {
    filtered = filtered.filter(o => o.type === type);
  }
  if (req.query.mode) {
    filtered = filtered.filter(o => o.mode === req.query.mode);
  }

  const total = filtered.length;
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  res.json({ items, total, page, pageSize });
});

app.get('/api/opportunities/:id', (req, res) => {
  const opportunity = allOpportunities.find(o => o.id === req.params.id);
  if (!opportunity) {
    res.status(404).json({ error: 'Opportunity not found' });
    return;
  }
  res.json({
    id: opportunity.id,
    title: opportunity.title,
    company: opportunity.company,
    companyLogo: null,
    location: opportunity.location,
    mode: opportunity.mode,
    type: opportunity.type,
    department: 'Engineering',
    deadline: opportunity.deadline,
    status: 'published',
    skills: opportunity.skills,
    description: 'Build web applications.',
    stipend: opportunity.stipend,
    duration: '3 months',
    applicants: 12,
    matchScore: opportunity.matchScore,
    verified: true,
    eligibility: 'Current students',
    responsibilities: ['Write code', 'Attend meetings'],
    requirements: ['Know React', 'Know Node.js'],
    benefits: ['Mentorship', 'Certificate'],
  });
});

const port = process.env.MOCK_PORT || 5000;
app.listen(port, () => {
  console.log(`Mock API server running on port ${port}`);
});

module.exports = app;
