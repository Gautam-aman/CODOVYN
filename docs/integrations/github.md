# GitHub integration

The current integration lists open issues and pull requests for an explicit `OWNER/REPO`, and creates issues through a separate explicit command. It uses the user's installed `gh` executable and existing GitHub CLI authentication. CODOVYN does not store a GitHub token or send one to an agent. The runtime suppresses interactive GitHub CLI prompts and returns a generic error if the request fails, so raw authentication or network diagnostics are not displayed in the UI.

```sh
gh auth login
node apps/cli/src/index.js issues OWNER/REPO
node apps/cli/src/index.js prs OWNER/REPO
node apps/cli/src/index.js issue-create OWNER/REPO "Issue title" issue-body.md bug
```

Issue results contain number, title, state, URL, and label names. Pull-request results contain number, title, state, URL, head/base branch names, and draft state. Each query requests at most 30 records by default. Neither operation fetches issue bodies, PR diffs, or repository code. The package API accepts a limit from 1 to 100.

Issue creation reads a local UTF-8 Markdown body file, limited to 65,536 bytes. The command accepts up to 10 existing label names. CODOVYN passes the body to `gh` through a temporary private file and removes it after the request. A successful response returns the new issue URL and number. A failed or ambiguous response must be checked on GitHub before retrying because the remote issue may already exist. No issue is created automatically by an agent task.

The local Git workflow uses the user's configured Git remote authentication independently of `gh`. The CLI can review a bounded diff, stage selected paths, commit the index, and explicitly push the current branch. It does not force-push. Repository-local Git hooks are disabled for CODOVYN's commit command; run project checks explicitly before a commit.

PR creation, comments, reviews, Actions status, multiple-account selection, and OAuth flows are not implemented. Nothing in this integration creates a PR. Tests use injected CLI output; the issue and PR list commands were also checked against this repository using an authenticated GitHub CLI session. The issue-creation path is covered by automated tests but has not yet been exercised through this CLI against GitHub.
