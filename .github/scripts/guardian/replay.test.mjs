import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { classifyHttpError } from '../lib/http.mjs';
import { evaluatePolicy } from './policy.mjs';
import { runGuardian } from './index.mjs';
import { STATES } from './constants.mjs';
import {
  baseConfig,
  checkRun,
  createApi,
  makeIssue,
  makePull,
  NOW,
  REPOSITORY,
  review,
} from './test-helpers.mjs';

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

test('replay: assignment-to-ready lifecycle keeps one summary and one notification per ready head', async () => {
  const scenario = JSON.parse(await readFile(fixture('lifecycle.json'), 'utf8'));
  const api = createApi({
    pull: makePull({ number: scenario.pr, user: { login: scenario.author, type: 'User' } }),
    issues: new Map([[scenario.issue, makeIssue(scenario.issue)]]),
    permissions: { maintainer: { permission: 'write' } },
  });
  api.state.searchPulls = [{ number: scenario.pr }];
  const config = baseConfig();
  let expectedNotifications = 0;
  let notifiedHead = null;

  for (const step of scenario.steps) {
    api.state.issues.get(scenario.issue).assignees = step.assignee ? [{ login: step.assignee }] : [];
    api.state.pull.draft = Boolean(step.draft);
    api.state.pull.updated_at = step.updatedAt ?? '2026-10-20T00:00:00Z';
    api.state.checkRuns = step.checks.map(([name, conclusion]) => checkRun(name, { conclusion }));
    api.state.reviews = step.reviews.map(([login, state]) => review(login, state));

    const result = await runGuardian({
      eventName: 'pull_request_target',
      event: { pull_request: { number: scenario.pr } },
      api,
      config,
      now: NOW,
    });

    assert.equal(result.failed, 0, step.name);
    assert.equal(result.results[0].state, step.expected, step.name);
    const summaries = api.state.comments.filter((comment) => comment.body.startsWith('<!-- codovyn-guardian-summary -->'));
    assert.equal(summaries.length, 1, `${step.name}: exactly one summary`);

    const headSha = api.state.pull.head.sha;
    if (step.expected === STATES.READY_FOR_MAINTAINER_REVIEW && headSha !== notifiedHead) {
      expectedNotifications += 1;
      notifiedHead = headSha;
    }
    const notifications = api.state.comments.filter((comment) => comment.body.startsWith('<!-- codovyn-guardian-notification:'));
    assert.equal(notifications.length, expectedNotifications, `${step.name}: notification count`);
  }
});

test('replay: permission and rate-limit shapes from PRs #58, #60, and #61', async () => {
  const scenario = JSON.parse(await readFile(fixture('403-shapes.json'), 'utf8'));
  for (const shape of scenario.shapes) {
    const error = classifyHttpError({
      status: shape.status,
      method: shape.method,
      path: shape.path,
      headers: new Headers(shape.headers ?? {}),
      body: shape.body,
    });
    assert.equal(error.kind, shape.expected, shape.name);
    assert.equal(error.status, shape.status, shape.name);
    const diagnostic = error.diagnostic();
    assert.match(diagnostic, new RegExp(`classification=${shape.expected}`), shape.name);
    assert.equal(diagnostic.includes('Bearer'), false, shape.name);
  }
});

test('replay: security and policy bypass cases', async () => {
  const scenario = JSON.parse(await readFile(fixture('security-cases.json'), 'utf8'));
  for (const item of scenario.cases) {
    const issue = makeIssue(42, item.issue ?? {});
    const permissions = Object.fromEntries(
      Object.entries(item.permissions ?? {}).map(([login, permission]) => [login, { permission }]),
    );
    const labelEvents = (item.events ?? []).map(([action, actor]) => ({
      event: action,
      actor: { login: actor, type: /\[bot\]$/.test(actor) ? 'Bot' : 'User' },
      label: { name: 'no-issue-required' },
      created_at: '2026-10-21T10:00:00Z',
    }));
    const api = createApi({
      pull: makePull({ body: item.body, labels: (item.labels ?? []).map((name) => ({ name })) }),
      issues: new Map([[42, issue]]),
      permissions,
      labelEvents,
    });
    const result = await evaluatePolicy({
      api,
      pull: api.state.pull,
      repository: REPOSITORY,
    });
    assert.equal(result.status, item.expected, item.name);
  }
});
