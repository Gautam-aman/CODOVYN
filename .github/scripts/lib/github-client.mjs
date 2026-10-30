import { requestJson } from './http.mjs';

/**
 * Small GitHub REST client used by the repository automation.
 *
 * The client is intentionally explicit about every endpoint it touches. It
 * supports an injected fetch implementation so the full request/response
 * surface can be replayed in tests without network access.
 */
export function createGitHubClient({
  token,
  owner,
  repo,
  fetchImpl = globalThis.fetch,
  apiBase = 'https://api.github.com',
  sleep,
  maxAttempts = 3,
} = {}) {
  if (!token) throw new Error('A GitHub token is required');
  if (!owner || !repo) throw new Error('A repository owner and name are required');

  const repositoryRoot = `${apiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const repositoryPath = `/repos/${owner}/${repo}`;

  async function request(path, { method = 'GET', body, retry } = {}) {
    const url = path.startsWith('https://') ? path : `${repositoryRoot}${path}`;
    const response = await requestJson(fetchImpl, url, {
      method,
      token,
      body,
      retry,
      maxAttempts,
      sleep,
    });
    return response.data;
  }

  async function requestOrNull(path, options) {
    try {
      return await request(path, options);
    } catch (error) {
      if (error?.status === 404) return null;
      throw error;
    }
  }

  async function paginate(path, { maxPages = 10, maxItems = 1000 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const separator = path.includes('?') ? '&' : '?';
      const batch = await request(`${path}${separator}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) {
        throw new Error(`Expected an array from GitHub pagination for ${path}`);
      }
      items.push(...batch);
      if (items.length >= maxItems && batch.length === 100) throw new Error('GitHub pagination bound reached; evidence incomplete');
      if (batch.length < 100) return items;
    }
    throw new Error('GitHub pagination bound reached; evidence incomplete');
  }

  async function paginateSearch(path, { maxItems = 100 } = {}) {
    const result = await request(path);
    if (result?.incomplete_results || result?.total_count > maxItems) throw new Error('GitHub search evidence incomplete');
    if (!Array.isArray(result?.items)) {
      throw new Error(`Expected a search result from GitHub for ${path}`);
    }
    return result.items.slice(0, maxItems);
  }

  const client = {
    owner,
    repo,
    repository: `${owner}/${repo}`,
    repositoryPath,

    request,

    getPull: (number) => request(`/pulls/${number}`),
    getIssue: (number) => request(`/issues/${number}`),
    getIssueOrNull: (number) => requestOrNull(`/issues/${number}`),
    getCommit: (ref) => request(`/commits/${encodeURIComponent(ref)}`),
    getAuthenticatedUser: () => request(`${apiBase}/user`),

    listPullComments: (number) => paginate(`/issues/${number}/comments`),
    createPullComment: (number, body) => request(`/issues/${number}/comments`, {
      method: 'POST',
      body: { body },
    }),
    updatePullComment: (_number, commentId, body) => request(`/issues/comments/${commentId}`, {
      method: 'PATCH',
      body: { body },
    }),
    deletePullComment: (_number, commentId) => request(`/issues/comments/${commentId}`, {
      method: 'DELETE',
    }),

    listIssueComments: (number) => paginate(`/issues/${number}/comments`),
    createIssueComment: (number, body) => request(`/issues/${number}/comments`, {
      method: 'POST',
      body: { body },
    }),
    updateIssueComment: (_number, commentId, body) => request(`/issues/comments/${commentId}`, {
      method: 'PATCH',
      body: { body },
    }),

    listIssueEvents: (number, options) => paginate(`/issues/${number}/events`, options),
    listIssueTimeline: (number, options) => paginate(`/issues/${number}/timeline`, options),
    listReviews: (number, options) => paginate(`/pulls/${number}/reviews`, options),
    listPullFiles: (number) => paginate(`/pulls/${number}/files`, {
      maxPages: 30,
      maxItems: 3000,
    }),

    getBranchProtection: (branch) => requestOrNull(
      `/branches/${encodeURIComponent(branch)}/protection`,
    ),
    listRepositoryRulesets: () => paginate('/rulesets', { maxPages: 3, maxItems: 100 }),
    getRuleset: (id) => requestOrNull(`/rulesets/${encodeURIComponent(id)}`),

    listCheckRunsForRef: async (ref, { maxPages = 10, maxItems = 1000 } = {}) => {
      const runs = [];
      for (let page = 1; page <= maxPages; page += 1) {
        const batch = await request(
          `/commits/${encodeURIComponent(ref)}/check-runs?filter=latest&per_page=100&page=${page}`,
        );
        if (!Array.isArray(batch?.check_runs)) {
          throw new Error('Expected check_runs in the GitHub response');
        }
        runs.push(...batch.check_runs);
        if (runs.length >= maxItems && batch.check_runs.length === 100) throw new Error('GitHub check pagination incomplete');
        if (batch.check_runs.length < 100) return runs;
      }
      throw new Error('GitHub check pagination incomplete');
    },

    getCombinedStatus: async (ref) => {
      const result = await request(`/commits/${encodeURIComponent(ref)}/status?per_page=100`);
      if (!Array.isArray(result?.statuses) || (Number.isSafeInteger(result.total_count) && result.total_count > result.statuses.length)) throw new Error('Combined status evidence incomplete');
      return result;
    },
    createCheckRun: (body) => request('/check-runs', { method: 'POST', body }),
    updateCheckRun: (checkRunId, body) => request(`/check-runs/${checkRunId}`, {
      method: 'PATCH',
      body,
    }),

    listPullsForCommit: async (sha) => {
      try {
        const pulls = await request(`/commits/${encodeURIComponent(sha)}/pulls`);
        return Array.isArray(pulls) ? pulls : [];
      } catch (error) {
        if (error?.status === 404 || error?.status === 422) return [];
        throw error;
      }
    },

    searchOpenPullsForIssue: (issueNumber) => paginateSearch(
      `${apiBase}/search/issues?q=${encodeURIComponent(`repo:${owner}/${repo} is:pr is:open #${issueNumber}`)}&per_page=100`,
    ),

    getCollaboratorPermission: async (login) => {
      if (!login) return null;
      return requestOrNull(`/collaborators/${encodeURIComponent(login)}/permission`);
    },

    listOpenPulls: (options) => paginate('/pulls?state=open', options),
    listIssuesAssignedTo: (login) => paginate(
      `/issues?state=open&assignee=${encodeURIComponent(login)}`,
    ),
    assignIssue: (number, login) => request(`/issues/${number}/assignees`, {
      method: 'POST',
      body: { assignees: [login] },
    }),
    unassignIssue: (number, login) => request(`/issues/${number}/assignees`, {
      method: 'DELETE',
      body: { assignees: [login] },
    }),

    getLabel: (name) => requestOrNull(`/labels/${encodeURIComponent(name)}`),
    createLabel: async (label) => {
      try {
        return await request('/labels', { method: 'POST', body: label });
      } catch (error) {
        // 422 means the label already exists, which is the desired state.
        if (error?.status === 422) return null;
        throw error;
      }
    },
    ensureLabel: async (name, { color = 'FBCA04', description } = {}) => {
      const existing = await client.getLabel(name);
      if (existing) return existing;
      return client.createLabel({ name, color, description });
    },
    addLabels: (number, labels) => request(`/issues/${number}/labels`, {
      method: 'POST',
      body: { labels },
    }),
    removeLabel: async (number, name) => {
      try {
        return await request(`/issues/${number}/labels/${encodeURIComponent(name)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },

    /**
     * Return the actor and action of the most recent label event for a PR.
     * A bounded scan returns null instead of guessing when history is too long.
     */
    latestLabelEvent: async (number, labelName, { maxPages = 10 } = {}) => {
      let latest = null;
      for (let page = 1; page <= maxPages; page += 1) {
        const batch = await request(`/issues/${number}/events?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) return null;
        for (const event of batch) {
          if (!['labeled', 'unlabeled'].includes(event?.event)) continue;
          if (event?.label?.name?.toLowerCase() !== String(labelName).toLowerCase()) continue;
          latest = event;
        }
        if (batch.length < 100) return latest;
      }
      // A full bounded scan may have omitted a newer authorization or revocation.
      return null;
    },
  };

  return client;
}
