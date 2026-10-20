import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/index.js';

test('CLI lists issues and PRs through the selected GitHub repository', async () => {
  const lines = [];
  const output = { log: (line) => lines.push(line), error: () => assert.fail('unexpected usage error') };
  const github = {
    listIssues: async (repository) => { assert.equal(repository, 'owner/repo'); return [{ number: 1 }]; },
    listPullRequests: async (repository) => { assert.equal(repository, 'owner/repo'); return [{ number: 2 }]; },
  };
  assert.equal(await main(['issues', 'owner/repo'], output, undefined, github), 0);
  assert.deepEqual(JSON.parse(lines.pop()), [{ number: 1 }]);
  assert.equal(await main(['prs', 'owner/repo'], output, undefined, github), 0);
  assert.deepEqual(JSON.parse(lines.pop()), [{ number: 2 }]);
});

test('CLI refuses ambiguous GitHub listing arguments', async () => {
  const errors = [];
  const output = { log: () => assert.fail('unexpected output'), error: (line) => errors.push(line) };
  assert.equal(await main(['issues'], output), 2);
  assert.equal(await main(['prs', 'owner/repo', '--web'], output), 2);
  assert.equal(errors.length, 2);
});
