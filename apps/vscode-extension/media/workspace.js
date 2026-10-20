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
request.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run.click(); }
});

window.addEventListener('message', ({ data }) => {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'running') {
    status.textContent = 'Running';
    run.disabled = true;
    cancel.disabled = false;
    timeline.replaceChildren();
    empty.textContent = 'Waiting for agent activity…';
  } else if (data.type === 'progress') {
    appendActivity(data.entries);
    if (data.entries?.length) empty.textContent = '';
  } else if (data.type === 'result' || data.type === 'history') {
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
    status.textContent = 'Task deleted';
    timeline.replaceChildren();
    empty.textContent = 'Select a saved task or start a new one.';
  } else if (data.type === 'diff') {
    diffOutput.textContent = data.text || 'No tracked changes in this diff.';
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
