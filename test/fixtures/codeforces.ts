export const statementHtml = (title = 'A. Sum', value = '5') =>
  `<!doctype html><html><body><div class="problem-statement"><div class="header"><div class="title">${title}</div><div class="time-limit">time limit per test 2 seconds</div><div class="memory-limit">memory limit per test 256 megabytes</div></div><p>Compute $$$a+b$$$.</p><div class="sample-test"><div class="input"><div class="title">Input</div><pre>2 3<br></pre></div><div class="output"><div class="title">Output</div><pre>${value}<br></pre></div></div></div></body></html>`;
export const signedIn = `<div class="lang-chooser"><a href="/profile/tester">tester</a><a href="/logout">Logout</a></div><script>var handle = "tester";</script>`;
export const loginHtml = `<form id="enterForm"><input type="hidden" name="csrf_token" value="login-token"><input type="hidden" name="ftaa" value="fixture-client"><input type="hidden" name="bfaa" value="fixture-bfaa"></form>`;
export const submitHtml = `${signedIn}<form class="submit-form"><input type="hidden" name="csrf_token" value="submit-token"><select name="programTypeId"><option value="999">GNU G++20 fixture</option><option value="998">PyPy 3 fixture</option></select></form>`;
export const fixtureContest = {
  id: 1234,
  name: 'Fixture Contest',
  phase: 'CODING' as const,
  type: 'CF',
  durationSeconds: 7200,
  startTimeSeconds: 1700000000,
};
