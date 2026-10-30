import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadChangedFiles,
  loadRepositoryPolicy,
} from './repository-policy.mjs';
import { createApi, makePull } from './test-helpers.mjs';

test('branch protection supplies required checks and review policy', async () => {
  const api = createApi({
    branchProtection: {
      required_status_checks: {
        contexts: ['protected/e2e'],
        checks: [{ context: 'protected/unit', app_id: 15368 }],
      },
      required_pull_request_reviews: { dismiss_stale_reviews: false },
    },
  });
  const result = await loadRepositoryPolicy({ api, pull: makePull() });
  assert.deepEqual(result.requiredChecks.map((check) => check.name), ['protected/e2e', 'protected/unit']);
  assert.equal(result.requiredChecks.find((check) => check.name === 'protected/unit').appId, 15368);
  assert.equal(result.dismissStaleReviews, false);
  assert.ok(result.sources.includes('branch-protection'));
});

test('rulesets supply required checks and strict stale-review policy', async () => {
  const api = createApi({
    rulesets: [{
      id: 3,
      target: 'branch',
      enforcement: 'active',
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'] } },
    }],
    rulesetDetails: {
      3: {
        id: 3,
        rules: [
          {
            type: 'required_status_checks',
            parameters: { required_status_checks: [{ context: 'ruleset/e2e', integration_id: 99 }] },
          },
          {
            type: 'pull_request',
            parameters: { dismiss_stale_reviews_on_push: true },
          },
        ],
      },
    },
  });
  const result = await loadRepositoryPolicy({ api, pull: makePull() });
  assert.deepEqual(result.requiredChecks.map((check) => check.name), ['ruleset/e2e']);
  assert.equal(result.requiredChecks[0].appId, 99);
  assert.equal(result.dismissStaleReviews, true);
});

test('non-branch and disabled rulesets are ignored', async () => {
  const api = createApi({
    rulesets: [
      { id: 1, target: 'tag', enforcement: 'active' },
      { id: 2, target: 'branch', enforcement: 'disabled' },
      { id: 3, target: 'branch', enforcement: 'active', conditions: { ref_name: { include: ['refs/heads/main'], exclude: ['refs/heads/main'] } } },
    ],
  });
  const result = await loadRepositoryPolicy({ api, pull: makePull() });
  assert.deepEqual(result.requiredChecks, []);
});

test('an unreadable policy is reported as unavailable, not as an empty trusted policy', async () => {
  const api = createApi({
    errors: {
      getBranchProtection: { status: 403, message: 'Resource not accessible by integration' },
      listRepositoryRulesets: { status: 403, message: 'Resource not accessible by integration' },
    },
  });
  const result = await loadRepositoryPolicy({ api, pull: makePull() });
  assert.deepEqual(result.requiredChecks, []);
  assert.equal(result.dismissStaleReviews, null);
  assert.ok(result.unavailable.some((item) => item.startsWith('branch-protection:')));
  assert.ok(result.unavailable.some((item) => item.startsWith('rulesets:')));
});

test('a complete changed-file list is deduplicated and includes renamed paths', async () => {
  const api = createApi({
    files: [
      { filename: 'apps/web/src/a.ts' },
      { filename: 'apps/web/src/a.ts' },
      { filename: 'apps/web/src/b.ts', previous_filename: 'apps/web/src/old.ts' },
    ],
  });
  const result = await loadChangedFiles({ api, pull: makePull() });
  assert.deepEqual(result.files, ['apps/web/src/a.ts', 'apps/web/src/b.ts', 'apps/web/src/old.ts']);
});

test('a truncated or unavailable changed-file list is unknown', async () => {
  const truncated = createApi({ files: Array.from({ length: 3000 }, (_, index) => ({ filename: `file-${index}.ts` })) });
  assert.equal((await loadChangedFiles({ api: truncated, pull: makePull() })).files, null);
  const failed = createApi({ errors: { listPullFiles: { status: 403, message: 'denied' } } });
  assert.equal((await loadChangedFiles({ api: failed, pull: makePull() })).files, null);
});
