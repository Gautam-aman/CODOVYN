# GitHub integration

The current integration lists open issues, pull requests, and Actions runs for an explicit `OWNER/REPO`; inspects selected issue and PR details and bounded patches; and exposes separate explicit issue and PR creation commands. It uses the user's installed `gh` executable and existing GitHub CLI authentication. CODOVYN does not store a GitHub token or send one to an agent. The runtime suppresses interactive GitHub CLI prompts and returns a generic error if a request fails, so raw authentication or network diagnostics are not displayed in the UI.

```sh
gh auth login
node apps/cli/src/index.js issues OWNER/REPO
node apps/cli/src/index.js issue OWNER/REPO ISSUE_NUMBER
node apps/cli/src/index.js prs OWNER/REPO
node apps/cli/src/index.js pr OWNER/REPO PR_NUMBER
node apps/cli/src/index.js pr-diff OWNER/REPO PR_NUMBER
node apps/cli/src/index.js pr-preview OWNER/REPO main feature/fix
node apps/cli/src/index.js runs OWNER/REPO BRANCH
node apps/cli/src/index.js issue-create OWNER/REPO "Issue title" issue-body.md bug
node apps/cli/src/index.js pr-create OWNER/REPO main feature/fix "Fix issue" pr-body.md
```

Issue results contain number, title, state, URL, and label names. Pull-request results contain number, title, state, URL, head/base branch names, and draft state. Each list requests at most 30 records by default. The selected detail commands return a body as untrusted text without executing it. Actions results include run status, conclusion, commit, branch, and URL. The package API accepts list limits from 1 to 100.

The separate `pr-diff` command returns a patch for a numbered PR, without checking out or executing its code. Output is limited to 1 MiB. It was exercised against [GitHub CLI PR #14766](https://github.com/cli/cli/pull/14766) using the authenticated `gh` session. Treat PR patches as untrusted text when reviewing them or providing them to agents.

Issue creation reads a local UTF-8 Markdown body file, limited to 65,536 bytes. The command accepts up to 10 existing label names. CODOVYN passes the body to `gh` through a temporary private file and removes it after the request. A successful response returns the new issue URL and number. A failed or ambiguous response must be checked on GitHub before retrying because the remote issue may already exist. No issue is created automatically by an agent task.

PR creation is limited to two branches in the same repository. The read-only `pr-preview` command returns their bounded comparison diff through the [GitHub compare API](https://docs.github.com/en/rest/commits/commits#compare-two-commits). The create command reads a local Markdown body file, limited to 65,536 bytes, then displays the repository, base, head, title, body, and diff in an interactive terminal and requires the user to type `create`. Noninteractive invocation refuses approval. CODOVYN requests the diff again before invoking `gh pr create` with an explicit head branch, which avoids `gh`'s optional branch-push prompt. Branch changes after the second comparison are still possible. A failed or malformed create response is uncertain: inspect GitHub before retrying to avoid duplicate PRs. The preview was exercised live against a public branch; creation is covered by simulated tests, not a live GitHub submission.

The local Git workflow uses the user's configured Git remote authentication independently of `gh`. The CLI can review a bounded diff, inspect status, stage selected paths, commit the index, create a branch, fetch, fast-forward pull, and explicitly push the current branch. It does not force-push or merge during pull. Repository-local Git hooks are disabled for branch, commit, fetch, pull, and push commands; run project checks explicitly before committing or pushing. The diff display is limited to 1 MiB, but larger staged changes can still be committed.

Comments, reviews, multiple-account selection, and OAuth flows are not implemented. Issue/PR details, the PR comparison preview, and Actions listing were exercised through an authenticated GitHub CLI session; tests remain offline and deterministic. The issue-creation path created and verified [issue #4](https://github.com/Gautam-aman/CODOVYN/issues/4) through this CLI. No PR was opened for CODOVYN.
