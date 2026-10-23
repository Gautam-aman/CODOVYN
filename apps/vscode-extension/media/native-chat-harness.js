/* Loaded only by the isolated standalone desktop Chat test host. */
(() => {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = data => window.dispatchEvent(new MessageEvent('message', { data }));
  const text = selector => document.querySelector(selector)?.textContent || '';
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

  async function run(token) {
    const prompt = 'Render this literally: <img src=x onerror=alert(1)>';
    const report = {};
    const stage = name => vscode.postMessage({ type: 'codovyn-native-chat-test-progress', token, stage: name });
    const request = document.querySelector('#request');
    const chat = document.querySelector('#chat-transcript');
    const tabs = view => document.querySelector(`[data-workspace-view="${view}"]`);
    requireValue(request && chat && tabs('chat') && tabs('activity'), 'The actual CODOVYN Chat workspace did not initialize.');
    stage('webview-dom-ready');

    const legacyMode = document.querySelector('#agent');
    const provider = document.querySelector('#task-provider');
    const model = document.querySelector('#task-model');
    const permission = document.querySelector('#task-permission');
    const routing = document.querySelector('#task-routing');
    const reasoning = document.querySelector('#task-reasoning');
    requireValue(provider && model && permission && routing && reasoning && getComputedStyle(legacyMode).display === 'none',
      'The combined legacy selector must be replaced by separate provider, model, permission and routing controls.');
    const catalogueModel = { id: 'native-fixture-codex', provider: 'codex', model: 'Configured CODOVYN fixture model',
      capabilities: ['streaming'], reasoning: ['low'], quality: 50, reliability: 0.5, availability: 'unknown', price: null };
    send({ type: 'routing-policy', policy: { mode: 'auto', models: [catalogueModel], requiredCapabilities: [], tokens: { input: 0, output: 0 } } });
    provider.value = 'codex'; provider.dispatchEvent(new Event('change'));
    model.value = catalogueModel.id; model.dispatchEvent(new Event('change'));
    requireValue([...model.options].some(option => option.value === catalogueModel.id) && reasoning.disabled === false &&
      [...reasoning.options].some(option => option.value === 'low') && permission.querySelector('option[value="write"]')?.disabled === true,
      'The native picker must show only configured models and reasoning while keeping unsupported write-only permission disabled.');
    report.composerControls = true;
    stage('separate-composer-controls-verified');

    request.value = prompt;
    pendingChatRequest = prompt;
    taskSubmissionId = 'native-chat-request-001';
    send({ type: 'accepted', requestId: taskSubmissionId, taskId: 'native-chat-task' });
    requireValue(request.value === '' && acceptedChatRequest === prompt,
      'The composer must clear only after host acknowledgement and retain the accepted prompt for the transcript.');
    report.submissionAcknowledgement = true;
    send({ type: 'running', taskId: 'native-chat-task' });
    requireValue(chat.textContent.includes(prompt), 'Authorized task prompt was not rendered in Chat.');
    report.submittedPrompt = true;
    stage('prompt-rendered');

    send({ type: 'progress', entries: [
      { type: 'tool', text: 'Reading the disposable project' },
      { type: 'message', text: 'First streamed chunk. ' },
    ] });
    await pause(20);
    send({ type: 'progress', entries: [
      { type: 'message', text: 'Second streamed chunk with literal <script>alert(2)</script>.' },
      { type: 'checkpoint', text: 'Saved a task checkpoint' },
    ] });
    const rendered = chat.textContent;
    requireValue(rendered.includes('First streamed chunk. Second streamed chunk'), 'Stream chunks lost ordering or were not appended to the same response.');
    requireValue(!rendered.includes('Reading the disposable project') && chat.querySelectorAll('img, script, svg').length === 0,
      'Tool events or HTML-like provider text escaped the safe Chat rendering path.');
    requireValue(tabs('activity').getAttribute('aria-label') === 'Activity, 2 new updates', 'Activity unread count did not exclude streamed message chunks.');
    report.streamingOrderAndTextSafety = true;
    stage('streaming-and-text-safety-verified');

    tabs('activity').click();
    requireValue(tabs('activity').getAttribute('aria-label') === 'Activity', 'Opening Activity did not clear its unread indicator.');
    requireValue(document.querySelector('#timeline').textContent.includes('Reading the disposable project'), 'Tool activity was not kept in Activity.');
    send({ type: 'progress', entries: [
      { type: 'tool', text: 'Checking a second project file' },
      { type: 'message', text: ' Hidden-view continuation.' },
    ] });
    tabs('chat').click();
    requireValue(chat.textContent.includes('Hidden-view continuation.') && chat.textContent.includes('First streamed chunk.'),
      'Switching destinations lost streamed Chat state.');
    requireValue(!chat.textContent.includes('Checking a second project file'), 'Tool activity leaked into the Chat transcript.');
    report.navigationAndActivitySeparation = true;
    stage('navigation-and-activity-verified');

    send({ type: 'result', status: 'completed', taskId: 'native-fixture-task', timeline: [] });
    requireValue(text('#status') === 'Completed' && document.querySelector('#cancel').disabled, 'Task completion state or cancellation control is inaccurate.');
    report.completionState = true;
    stage('completion-state-verified');

    chat.style.height = '140px';
    chat.style.maxHeight = '140px';
    send({ type: 'progress', entries: [{ type: 'message', text: 'Long response '.repeat(120) }] });
    void chat.getBoundingClientRect();
    stage('long-transcript-added');
    requireValue(chat.scrollHeight > chat.clientHeight, 'The transcript fixture did not create a scrollable native Chat region.');
    stage('scroll-geometry-verified');
    chat.scrollTop = 0;
    chat.dispatchEvent(new Event('scroll'));
    const jump = document.querySelector('.jump-to-latest-chat');
    requireValue(!jump.hidden, 'Jump-to-latest did not appear after reading older Chat content.');
    const scrollBefore = chat.scrollTop;
    send({ type: 'progress', entries: [{ type: 'message', text: ' Appended while reading above.' }] });
    void chat.getBoundingClientRect();
    requireValue(chat.scrollTop === scrollBefore, 'Streaming forcibly scrolled a reader away from older content.');
    stage('scroll-follow-paused-for-reader');
    jump.click();
    const jumpDeadline = Date.now() + 1500;
    while (chat.scrollHeight - chat.scrollTop - chat.clientHeight > 4 && Date.now() < jumpDeadline) await pause(20);
    requireValue(chat.scrollHeight - chat.scrollTop - chat.clientHeight <= 4, 'Jump-to-latest did not return to the end of the transcript.');
    report.scrollFollowAndJump = true;
    stage('scroll-behavior-verified');
    chat.style.height = '';
    chat.style.maxHeight = '';

    const historyLabel = 'Persisted native journal request';
    stage('waiting-for-journal-task-card');
    tabs('history').click();
    const historyButton = await (async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const item = [...document.querySelectorAll('#tasks button.task')].find(button => button.textContent.includes(historyLabel));
        if (item) return item;
        await pause(50);
      }
      throw new Error('The seeded SQLite task was not loaded into native task history.');
    })();
    const historyMessage = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error('Native task history did not restore its journal events.')); }, 15000);
      const listener = event => {
        if (event.data?.type !== 'history' || event.data.taskId !== 'native-chat-journal') return;
        clearTimeout(timer);
        window.removeEventListener('message', listener);
        resolve();
      };
      window.addEventListener('message', listener);
    });
    historyButton.click();
    stage('journal-history-requested');
    await historyMessage;
    await pause(0);
    requireValue(chat.textContent.includes(historyLabel) && chat.textContent.includes('Persisted agent response from SQLite.'),
      'The actual SQLite task journal did not reconstruct the right Chat transcript.');
    requireValue(!chat.textContent.includes('Using agent tool: read_file') && document.querySelector('#timeline').textContent.includes('Using agent tool: read_file'),
      'Restored tool events were not separated from the journal conversation.');
    requireValue(document.querySelectorAll('#chat-transcript .chat-message').length === 2,
      'Restored journal text created duplicate transcript messages.');
    report.sqliteJournalRestoration = true;
    stage('sqlite-journal-transcript-verified');

    send({ type: 'running' });
    requireValue(text('#status') === 'Running' && !document.querySelector('#cancel').disabled, 'Running task controls were not enabled.');
    send({ type: 'error', text: 'Fixture cancellation: provider stopped safely.' });
    requireValue(text('#status') === 'Error' && document.querySelector('#cancel').disabled, 'Interrupted task state was not shown accurately.');
    requireValue(chat.textContent.includes(historyLabel), 'Error handling discarded the previous journal transcript.');
    report.interruptionState = true;
    stage('interruption-state-verified');
    report.transcriptMessages = [...chat.querySelectorAll('.chat-message')].map(item => item.textContent);
    report.activityRows = [...document.querySelectorAll('#timeline > li')].map(item => item.textContent);
    return report;
  }

  window.addEventListener('message', async ({ data }) => {
    if (data?.type !== 'codovyn-native-chat-test' || typeof data.token !== 'string' || !/^[a-f0-9]{32}$/.test(data.token)) return;
    let report;
    try { report = { passed: true, checks: await run(data.token) }; }
    catch (error) { report = { passed: false, error: String(error?.message || error) }; }
    vscode.postMessage({ type: 'codovyn-native-chat-test-result', token: data.token, report });
  });
  vscode.postMessage({ type: 'codovyn-native-chat-test-ready' });
})();
