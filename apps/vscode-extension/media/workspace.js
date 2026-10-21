const vscode = acquireVsCodeApi();
const request = document.getElementById('request');
const agent = document.getElementById('agent');
const run = document.getElementById('run');
const cancel = document.getElementById('cancel');
const status = document.getElementById('status');
const timeline = document.getElementById('timeline');
const empty = document.getElementById('empty');
const tasks = document.getElementById('tasks');
const refresh = document.getElementById('refresh');
const diffOutput = document.getElementById('diff-output');
const editOption = document.createElement('option');
editOption.value = 'codex-edit';
editOption.textContent = 'Codex CLI · edit draft';
agent.append(editOption);
for (const [value, label] of [
  ['claude-edit', 'Claude Code · edit draft'],
  ['auto-edit', 'Codex → Claude · edit draft'],
]) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  agent.append(option);
}

const draftActions = document.createElement('div');
draftActions.className = 'draft-actions';
const reviewDraft = document.createElement('button');
reviewDraft.type = 'button';
reviewDraft.textContent = 'Review agent draft';
const acceptDraft = document.createElement('button');
acceptDraft.type = 'button';
acceptDraft.textContent = 'Apply reviewed patch';
const rejectDraft = document.createElement('button');
rejectDraft.type = 'button';
rejectDraft.textContent = 'Discard draft';
draftActions.append(reviewDraft, acceptDraft, rejectDraft);
document.querySelector('.diff').append(draftActions);
let currentTaskId = null;
let draftAvailable = false;
let reviewedHash = null;

function updateDraftActions() {
  reviewDraft.disabled = !draftAvailable || !currentTaskId;
  acceptDraft.disabled = !reviewedHash;
  rejectDraft.disabled = !draftAvailable || !currentTaskId || reviewedHash === null;
}
updateDraftActions();

function appendActivity(items) {
  for (const item of items || []) {
    const row = document.createElement('li');
    row.className = item.type;
    row.textContent = item.text;
    timeline.append(row);
  }
}

run.addEventListener('click', () => {
  const value = request.value.trim();
  if (!value) { request.focus(); return; }
  vscode.postMessage({ type: 'run', mode: agent.value, request: value });
});
cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
refresh.addEventListener('click', () => vscode.postMessage({ type: 'tasks' }));
document.getElementById('working-diff').addEventListener('click', () => vscode.postMessage({ type: 'diff', staged: false }));
document.getElementById('staged-diff').addEventListener('click', () => vscode.postMessage({ type: 'diff', staged: true }));
reviewDraft.addEventListener('click', () => {
  if (currentTaskId) vscode.postMessage({ type: 'draft-review', id: currentTaskId });
});
acceptDraft.addEventListener('click', () => {
  if (currentTaskId && reviewedHash) vscode.postMessage({ type: 'draft-accept', id: currentTaskId });
});
rejectDraft.addEventListener('click', () => {
  if (currentTaskId) vscode.postMessage({ type: 'draft-reject', id: currentTaskId });
});
request.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run.click(); }
});

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'running') {
    currentTaskId = null;
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = 'Running';
    run.disabled = true;
    cancel.disabled = false;
    timeline.replaceChildren();
    empty.textContent = 'Waiting for agent activity…';
  } else if (data.type === 'progress') {
    appendActivity(data.entries);
    if (data.entries?.length) empty.textContent = '';
  } else if (data.type === 'result' || data.type === 'history') {
    currentTaskId = data.taskId || null;
    draftAvailable = !!data.draftReviewAvailable;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = data.status === 'completed' ? 'Completed' : data.status;
    run.disabled = false;
    cancel.disabled = true;
    timeline.replaceChildren();
    appendActivity(data.timeline);
    if (data.type === 'history') request.value = data.request || '';
    empty.textContent = data.timeline?.length ? '' : 'No activity was recorded.';
  } else if (data.type === 'tasks') {
    tasks.replaceChildren();
    for (const task of data.tasks || []) {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'task';
      button.textContent = `${task.request} · ${task.status}`;
      button.addEventListener('click', () => vscode.postMessage({ type: 'history', id: task.id }));
      row.append(button);
      if (task.status !== 'running') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'task-delete';
        remove.textContent = 'Delete';
        remove.setAttribute('aria-label', `Delete saved task: ${task.request}`);
        remove.addEventListener('click', () => vscode.postMessage({ type: 'delete-task', id: task.id }));
        row.append(remove);
      }
      tasks.append(row);
    }
    if (!data.tasks?.length) {
      const row = document.createElement('li');
      row.textContent = 'No saved tasks for this repository.';
      tasks.append(row);
    }
  } else if (data.type === 'tasks-error') {
    tasks.replaceChildren();
    const row = document.createElement('li');
    row.textContent = data.text;
    tasks.append(row);
  } else if (data.type === 'task-deleted') {
    if (currentTaskId === data.id) { currentTaskId = null; draftAvailable = false; reviewedHash = null; updateDraftActions(); }
    status.textContent = 'Task deleted';
    timeline.replaceChildren();
    empty.textContent = 'Select a saved task or start a new one.';
  } else if (data.type === 'diff') {
    diffOutput.textContent = data.text || 'No tracked changes in this diff.';
  } else if (data.type === 'draft-review') {
    currentTaskId = data.taskId;
    draftAvailable = true;
    reviewedHash = data.patchHash || '';
    diffOutput.textContent = data.patch || 'This draft has no changes to apply.';
    updateDraftActions();
    diffOutput.focus();
  } else if (data.type === 'draft-accepted' || data.type === 'draft-rejected') {
    draftAvailable = false;
    reviewedHash = null;
    updateDraftActions();
    status.textContent = data.type === 'draft-accepted' ? 'Patch applied' : 'Draft discarded';
    diffOutput.textContent = data.type === 'draft-accepted'
      ? 'Reviewed patch applied to the repository. Run your project checks before committing.' : 'Draft discarded.';
  } else if (data.type === 'diff-error') {
    diffOutput.textContent = data.text;
  } else if (data.type === 'error') {
    status.textContent = 'Error';
    run.disabled = false;
    cancel.disabled = true;
    empty.textContent = data.text;
  }
});

vscode.postMessage({ type: 'ready' });
