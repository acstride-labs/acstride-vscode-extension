export const fixtureContest = {
  id: 1234,
  name: 'Fixture Contest',
  phase: 'CODING' as const,
  type: 'CF',
  durationSeconds: 7200,
  startTimeSeconds: 1700000000,
};

export const structuredProblem = (title = 'A. Sum', value = '5') => ({
  statement: {
    title,
    html: '<p>Compute $$$a+b$$$.</p>',
    timeLimit: '2 seconds',
    memoryLimit: '256 megabytes',
    fetchedAt: Date.now(),
  },
  samples: [{ id: 'sample-1', input: '2 3\n', expected: `${value}\n` }],
});
