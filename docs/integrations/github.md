# GitHub integration

The current integration lists open issues and pull requests for an explicit `OWNER/REPO`. It uses the user's installed `gh` executable and existing GitHub CLI authentication. CODOVYN does not store a GitHub token or send one to an agent. The runtime suppresses interactive GitHub CLI prompts and returns a generic error if the request fails, so raw authentication or network diagnostics are not displayed in the UI.

```sh
gh auth login
node apps/cli/src/index.js issues OWNER/REPO
node apps/cli/src/index.js prs OWNER/REPO
```

Issue results contain number, title, state, URL, and label names. Pull-request results contain number, title, state, URL, head/base branch names, and draft state. Each query requests at most 30 records by default. Neither operation fetches issue bodies, PR diffs, or repository code. The package API accepts a limit from 1 to 100.

The local Git workflow uses the user's configured Git remote authentication independently of `gh`. The CLI can review a bounded diff, stage selected paths, commit the index, and explicitly push the current branch. It does not force-push. Repository-local Git hooks are disabled for CODOVYN's commit command; run project checks explicitly before a commit.

GitHub issue and PR creation, comments, reviews, Actions status, multiple-account selection, and OAuth flows are not implemented. Nothing in this integration creates a PR. Tests use injected CLI output; the issue and PR list commands were also checked against this repository using an authenticated GitHub CLI session.
