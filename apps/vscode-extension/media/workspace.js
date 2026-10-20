const vscode = acquireVsCodeApi();
const request = document.getElementById('request');
const agent = document.getElementById('agent');
const run = document.getElementById('run');
const cancel = document.getElementById('cancel');
const status = document.getElementById('status');
const timeline = document.getElementById('timeline');
const empty = document.getElementById('empty');

run.addEventListener('click', () => {
  const value = request.value.trim();
  if (!value) { request.focus(); return; }
  vscode.postMessage({ type: 'run', mode: agent.value, request: value });
});
cancel.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
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
    for (const item of data.entries || []) {
      const row = document.createElement('li');
      row.className = item.type;
      row.textContent = item.text;
      timeline.append(row);
    }
    if (data.entries?.length) empty.textContent = '';
  } else if (data.type === 'result') {
    status.textContent = data.status === 'completed' ? 'Completed' : data.status;
    run.disabled = false;
    cancel.disabled = true;
    timeline.replaceChildren();
    for (const item of data.timeline || []) {
      const row = document.createElement('li');
      row.className = item.type;
      row.textContent = item.text;
      timeline.append(row);
    }
    empty.textContent = data.timeline?.length ? '' : 'No activity was recorded.';
  } else if (data.type === 'error') {
    status.textContent = 'Error';
    run.disabled = false;
    cancel.disabled = true;
    empty.textContent = data.text;
  }
});
