import { createHash } from 'node:crypto';

export const REPOSITORY = 'Gautam-aman/CODOVYN';
export const BOT_LOGIN = 'github-actions[bot]';
export const NOW = Date.parse('2026-10-22T12:00:00Z');

let nextCommentId = 1000;
let nextCheckRunId = 5000;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function makePull(overrides = {}) {
  return {
    number: 90,
    state: 'open',
    draft: false,
    merged: false,
    merged_at: null,
    mergeable: true,
    mergeable_state: 'clean',
    body: 'Closes #42',
    title: 'Fix the routing table',
    user: { login: 'alice', type: 'User' },
    author_association: 'CONTRIBUTOR',
    base: { ref: 'main', repo: { full_name: REPOSITORY } },
    head: { sha: 'a'.repeat(40), repo: { full_name: 'alice/CODOVYN' } },
    labels: [],
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-20T00:00:00Z',
    html_url: `https://github.com/${REPOSITORY}/pull/90`,
    ...clone(overrides),
  };
}

export function makeIssue(number, overrides = {}) {
  const issue = {
    number,
    state: 'open',
    title: `Issue ${number}`,
    repository: { full_name: REPOSITORY },
    assignees: [],
    labels: [],
    ...clone(overrides),
  };
  issue.assignees = (issue.assignees ?? []).map((user) => (typeof user === 'string' ? { login: user } : user));
  return issue;
}

export function checkRun(name, { status = 'completed', conclusion = 'success', appId = 15368, app = 'github-actions', externalId = null } = {}) {
  return {
    id: nextCheckRunId++,
    name,
    status,
    conclusion,
    external_id: externalId,
    head_sha: 'a'.repeat(40),
    app: { id: appId, slug: app, name: app },
    started_at: '2026-10-22T11:50:00Z',
    completed_at: status === 'completed' ? '2026-10-22T11:55:00Z' : null,
    output: { title: name, summary: '' },
  };
}

export function makeComment({ id, login = BOT_LOGIN, type = 'Bot', body }) {
  return { id: id ?? nextCommentId++, user: { login, type }, body };
}

export function createApi({
  pull = makePull(),
  issues = new Map([[42, makeIssue(42)]]),
  comments = [],
  checkRuns = ['ubuntu-latest','macos-latest','windows-latest'].map(os => checkRun(`test (${os})`)),
  statuses = [],
  reviews = [],
  permissions = {},
  labelEvents = [],
  timelineEvents = [],
  commitDate = '2026-10-22T11:55:00Z',
  pullRequestsForCommit = [],
  searchPulls = [],
  openPulls = [],
  files = [],
  branchProtection = null,
  rulesets = [],
  rulesetDetails = {},
  errors = {},
} = {}) {
  const state = {
    pull: clone(pull),
    issues: new Map(issues),
    comments: clone(comments),
    checkRuns: clone(checkRuns),
    statuses: clone(statuses),
    reviews: clone(reviews),
    permissions: { ...permissions },
    labelEvents: clone(labelEvents),
    timelineEvents: clone(timelineEvents),
    commitDate,
    pullRequestsForCommit: clone(pullRequestsForCommit),
    searchPulls: clone(searchPulls),
    openPulls: clone(openPulls),
    files: clone(files),
    branchProtection: clone(branchProtection),
    rulesets: clone(rulesets),
    rulesetDetails: clone(rulesetDetails),
    errors: { ...errors },
    calls: [],
  };

  function maybeThrow(key) {
    if (!state.errors[key]) return;
    const { status = 500, message = key } = state.errors[key];
    const error = Object.assign(new Error(message), { status });
    error.diagnostic = () => `GitHub API ${key} HTTP ${status} classification=${status === 403 ? 'permission' : 'unknown'}`;
    throw error;
  }

  const api = {
    repository: REPOSITORY,
    state,
    calls: state.calls,

    getPull: async (number) => {
      state.calls.push(['getPull', number]);
      maybeThrow('getPull');
      if (number !== state.pull.number) throw Object.assign(new Error('Not Found'), { status: 404 });
      return clone(state.pull);
    },
    getIssue: async (number) => {
      state.calls.push(['getIssue', number]);
      maybeThrow('getIssue');
      const issue = state.issues.get(number);
      if (!issue) throw Object.assign(new Error('Not Found'), { status: 404 });
      if (issue.error) throw Object.assign(new Error(issue.error.message ?? 'error'), { status: issue.error.status });
      return clone(issue);
    },
    listPullComments: async (number) => {
      state.calls.push(['listPullComments', number]);
      maybeThrow('listPullComments');
      return state.comments;
    },
    listIssueComments: async (number) => {
      state.calls.push(['listIssueComments', number]);
      maybeThrow('listIssueComments');
      return state.comments;
    },
    createPullComment: async (number, body) => {
      state.calls.push(['createPullComment', number, body]);
      maybeThrow('createPullComment');
      const comment = makeComment({ body });
      state.comments.push(comment);
      return comment;
    },
    createIssueComment: async (number, body) => {
      state.calls.push(['createIssueComment', number, body]);
      maybeThrow('createIssueComment');
      const comment = makeComment({ body });
      state.comments.push(comment);
      return comment;
    },
    updatePullComment: async (number, id, body) => {
      state.calls.push(['updatePullComment', number, id, body]);
      maybeThrow('updatePullComment');
      const comment = state.comments.find((item) => item.id === id);
      if (!comment) throw Object.assign(new Error('Not Found'), { status: 404 });
      comment.body = body;
      return comment;
    },
    updateIssueComment: async (number, id, body) => {
      state.calls.push(['updateIssueComment', number, id, body]);
      maybeThrow('updateIssueComment');
      const comment = state.comments.find((item) => item.id === id);
      if (!comment) throw Object.assign(new Error('Not Found'), { status: 404 });
      comment.body = body;
      return comment;
    },
    listIssueEvents: async (number) => {
      state.calls.push(['listIssueEvents', number]);
      maybeThrow('listIssueEvents');
      return state.labelEvents;
    },
    listIssueTimeline: async (number) => {
      state.calls.push(['listIssueTimeline', number]);
      maybeThrow('listIssueTimeline');
      return state.timelineEvents;
    },
    latestLabelEvent: async (number, label) => {
      state.calls.push(['latestLabelEvent', number, label]);
      maybeThrow('latestLabelEvent');
      return [...state.labelEvents]
        .filter((event) => event.label?.name?.toLowerCase() === String(label).toLowerCase())
        .at(-1) ?? null;
    },
    getCollaboratorPermission: async (login) => {
      state.calls.push(['getCollaboratorPermission', login]);
      maybeThrow('getCollaboratorPermission');
      const value = state.permissions[login];
      if (value === null) return null;
      return value ?? { permission: 'read' };
    },
    listCheckRunsForRef: async (sha) => {
      state.calls.push(['listCheckRunsForRef', sha]);
      maybeThrow('listCheckRunsForRef');
      return state.checkRuns;
    },
    getCombinedStatus: async (sha) => {
      state.calls.push(['getCombinedStatus', sha]);
      maybeThrow('getCombinedStatus');
      return { state: state.statuses.some((item) => item.state === 'pending') ? 'pending' : 'success', statuses: state.statuses };
    },
    getCommit: async (sha) => {
      state.calls.push(['getCommit', sha]);
      maybeThrow('getCommit');
      return { commit: { committer: { date: state.commitDate }, author: { date: state.commitDate } } };
    },
    listReviews: async (number) => {
      state.calls.push(['listReviews', number]);
      maybeThrow('listReviews');
      return state.reviews;
    },
    listPullFiles: async (number) => {
      state.calls.push(['listPullFiles', number]);
      maybeThrow('listPullFiles');
      return state.files;
    },
    getBranchProtection: async (branch) => {
      state.calls.push(['getBranchProtection', branch]);
      maybeThrow('getBranchProtection');
      return clone(state.branchProtection);
    },
    listRepositoryRulesets: async () => {
      state.calls.push(['listRepositoryRulesets']);
      maybeThrow('listRepositoryRulesets');
      return clone(state.rulesets);
    },
    getRuleset: async (id) => {
      state.calls.push(['getRuleset', id]);
      maybeThrow('getRuleset');
      return clone(state.rulesetDetails[id] ?? null);
    },
    listPullsForCommit: async (sha) => {
      state.calls.push(['listPullsForCommit', sha]);
      maybeThrow('listPullsForCommit');
      return state.pullRequestsForCommit;
    },
    searchOpenPullsForIssue: async (number) => {
      state.calls.push(['searchOpenPullsForIssue', number]);
      maybeThrow('searchOpenPullsForIssue');
      return state.searchPulls;
    },
    listOpenPulls: async () => {
      state.calls.push(['listOpenPulls']);
      maybeThrow('listOpenPulls');
      return state.openPulls;
    },
    getLabel: async (name) => {
      state.calls.push(['getLabel', name]);
      maybeThrow('getLabel');
      return state.pull.labels.find((label) => (typeof label === 'string' ? label : label.name) === name) ?? null;
    },
    createLabel: async (label) => {
      state.calls.push(['createLabel', label]);
      maybeThrow('createLabel');
      return label;
    },
    ensureLabel: async (name) => {
      state.calls.push(['ensureLabel', name]);
      maybeThrow('ensureLabel');
      return { name };
    },
    addLabels: async (number, labels) => {
      state.calls.push(['addLabels', number, labels]);
      maybeThrow('addLabels');
      for (const label of labels) {
        state.pull.labels.push({ name: label });
      }
      return state.pull.labels;
    },
    addLabel: async (number, name) => {
      state.calls.push(['addLabel', number, name]);
      maybeThrow('addLabel');
      state.pull.labels.push({ name });
      return state.pull.labels;
    },
    removeLabel: async (number, name) => {
      state.calls.push(['removeLabel', number, name]);
      maybeThrow('removeLabel');
      state.pull.labels = state.pull.labels.filter((label) => (typeof label === 'string' ? label : label.name) !== name);
      return state.pull.labels;
    },
    createCheckRun: async (body) => {
      state.calls.push(['createCheckRun', body]);
      maybeThrow('createCheckRun');
      const created = {
        ...clone(body),
        id: nextCheckRunId++,
        app: { id: 999, slug: 'github-actions', name: 'GitHub Actions' },
      };
      state.checkRuns.push(created);
      return created;
    },
    updateCheckRun: async (id, body) => {
      state.calls.push(['updateCheckRun', id, body]);
      maybeThrow('updateCheckRun');
      const existing = state.checkRuns.find((item) => item.id === id);
      if (!existing) throw Object.assign(new Error('Not Found'), { status: 404 });
      Object.assign(existing, clone(body));
      return existing;
    },
  };
  // Compatibility aliases for the existing contributor and assignment bots.
  api.issue = api.getIssue;
  api.pull = api.getPull;
  api.comments = api.listIssueComments;
  api.comment = api.createIssueComment;
  api.updateComment = api.updateIssueComment;
  api.searchPulls = api.searchOpenPullsForIssue;
  api.permission = api.getCollaboratorPermission;
  api.exceptionAuthorized = async () => false;
  return api;
}

export function baseConfig(overrides = {}) {
  return {
    dryRun: false,
    notify: true,
    aiReviewEnabled: false,
    aiReviewLogin: 'coderabbitai[bot]',
    staleDays: 30,
    noChecksGraceMinutes: 15,
    maintainers: ['Gautam-aman'],
    botLogin: BOT_LOGIN,
    checkRun: true,
    maxPullsPerRun: 25,
    mergeableRetryMs: 0,
    sleep: async () => {},
    ...overrides,
  };
}

export function review(login, state, submittedAt = '2026-10-21T10:00:00Z', type = 'User', commitId = 'a'.repeat(40)) {
  return {
    id: createHash('sha1').update(`${login}:${state}:${submittedAt}:${commitId}`).digest('hex').slice(0, 10),
    user: { login, type },
    state,
    submitted_at: submittedAt,
    commit_id: commitId,
  };
}

export function labelEvent(action, actor, label = 'no-issue-required', createdAt = '2026-10-21T10:00:00Z') {
  return {
    event: action,
    actor: { login: actor, type: /\[bot\]$/.test(actor) ? 'Bot' : 'User' },
    label: { name: label },
    created_at: createdAt,
  };
}
