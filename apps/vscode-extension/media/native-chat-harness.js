/* Loaded only by the isolated standalone desktop Chat test host. */
(() => {
  // This script is packaged only for the explicit isolated native test host.
  // Keep asynchronous real metadata replies out of the OpenCode DOM fixture.
  window.addEventListener('message', event => {
    if(event.data?.provider === 'opencode' && ['provider-models','provider-models-loading'].includes(event.data.type) && event.data?.metadata?.source !== 'native-opencode-fixture') event.stopImmediatePropagation();
  }, true);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const send = data => window.dispatchEvent(new MessageEvent('message', { data }));
  const text = selector => document.querySelector(selector)?.textContent || '';
  const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

  async function run(token, phase) {
    const prompt = 'Render this literally: <img src=x onerror=alert(1)>';
    const report = {};
    const stage = name => vscode.postMessage({ type: 'codovyn-native-chat-test-progress', token, stage: name });
    const request = document.querySelector('#request');
    const chat = document.querySelector('#chat-transcript');
    const tabs = view => document.querySelector(`[data-workspace-view="${view}"]`);
    requireValue(request && chat && tabs('chat') && tabs('activity'), 'The actual CODOVYN Chat workspace did not initialize.');
    stage('webview-dom-ready');
    if (phase === 'relaunch') requireValue(compactComposer.efforts['default:codex'] === 'high', 'Per-model reasoning preference did not survive normal application restart.');
    if (phase === 'relaunch') requireValue(compactComposer.favorites.includes('model:native-fixture-codex'), 'Favorite models did not restore from host storage after restart.');

    if(phase === 'relaunch') {
      const saved = vscode.getState().taskSelections?.[selectedProjectRoot.slice(0,1024)];
      requireValue(saved?.provider === 'opencode' && saved?.modelSource === 'discovered' && compactComposer.efforts['model:discovered-opencode-nativefixture'] === 'deep', 'Discovered OpenCode selection/variant did not restore from host preferences.');
      report.openCodePreferencesRestored = true;
    }
    const legacyMode = document.querySelector('#agent');
    const provider = document.querySelector('#task-provider');
    const model = document.querySelector('#task-model');
    const permission = document.querySelector('#task-permission');
    const routing = document.querySelector('#task-routing');
    const reasoning = document.querySelector('#task-reasoning');
    if(phase==='relaunch') {
      requireValue(reasoning.value==='deep' && reasoning.disabled,'Saved OpenCode variant was lost before refreshed metadata was available.');
      send({type:'provider-models',provider:'opencode',metadata:{source:'native-opencode-fixture',defaultModel:'fixture/native-model',models:[{id:'discovered-opencode-nativefixture',provider:'opencode',model:'fixture/native-model',source:'discovered',reasoning:['deep'],availability:'unknown'}]}});
      requireValue(reasoning.value==='deep'&&!reasoning.disabled,'Refreshed OpenCode capabilities did not restore the saved exact variant.');
      report.openCodeEffectiveVariantRestored=true;
    }
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
    document.querySelector('#model-chip').click();
    const picker = document.querySelector('#model-picker');
    requireValue(picker.matches(':popover-open'), 'Model chip did not open its top-layer popover.');
    const search = picker.querySelector('input'); search.value = 'Configured CODOVYN'; search.dispatchEvent(new Event('input'));
    const choice = picker.querySelector('[data-choice="model:native-fixture-codex"]');
    requireValue(choice && picker.querySelectorAll('[data-choice]').length === 1, 'Model search did not filter the configured catalogue.');
    if (picker.querySelector('.model-favorite').getAttribute('aria-pressed') !== 'true') picker.querySelector('.model-favorite').click();
    requireValue(vscode.getState().modelPicker.favorites.includes('model:native-fixture-codex'), 'Favorite model preference was not saved.');
    picker.querySelector('[data-choice="model:native-fixture-codex"]').click();
    requireValue(model.value === catalogueModel.id && !picker.matches(':popover-open'), 'Model selection did not reach the actual task controls.');
    requireValue(vscode.getState().modelPicker.recent[0] === 'model:native-fixture-codex', 'Recent model selection was not saved.');
    document.querySelector('#effort-chip').click();
    requireValue(!document.querySelector('#effort-picker [data-choice=high]'), 'Configured model exposes an undeclared effort.');
    document.querySelector('#effort-picker [data-choice=low]').click();
    requireValue(currentTaskConfiguration().modelId === catalogueModel.id && currentTaskConfiguration().reasoning === 'low', 'Manual model effort was not included in its task snapshot.');
    document.querySelector('#model-chip').click();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    requireValue(document.activeElement.matches('button[data-choice]'), 'Arrow navigation did not move focus into the model list.');
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    requireValue(!picker.matches(':popover-open') && document.activeElement.id === 'model-chip', 'Escape did not close the model menu and restore focus.');
    document.querySelector('#mode-chip').click(); document.querySelector('#mode-agent').click();
    requireValue(permission.value === 'read-write', 'Agent mode did not request an isolated edit draft.');
    document.querySelector('#mode-chip').click(); document.querySelector('#mode-plan').click();
    requireValue(permission.value === 'read' && currentTaskConfiguration().intent === 'plan', 'Plan mode was not limited to read-only execution.');
    document.querySelector('#mode-chip').click(); document.querySelector('#mode-ask').click();
    requireValue(permission.value === 'read', 'Ask mode did not restore read-only permission.');
    requireValue(!document.querySelector('.composer .task-controls') && document.querySelector('#codovyn-panel-settings .task-controls'), 'Advanced controls still clutter the primary composer.');
    const compact = document.querySelector('.composer');
    compact.style.width = '260px';
    requireValue(compact.scrollWidth <= 262, 'Compact composer overflows a narrow panel.'); compact.style.width = '';
    requireValue(!document.querySelector('.composer #permission-help'), 'Advanced permission help still clutters the compact composer.');
    const previousTheme = document.body.dataset.codovynTheme;
    document.body.dataset.codovynTheme = 'light';
    requireValue(getComputedStyle(document.querySelector('.workspace-context')).backgroundColor === getComputedStyle(request).getPropertyValue('--vscode-input-background').trim().replace(/^#([a-f0-9]{6})$/i, (_, hex) => `rgb(${parseInt(hex.slice(0,2),16)}, ${parseInt(hex.slice(2,4),16)}, ${parseInt(hex.slice(4,6),16)})`), 'Light panel surfaces inherited a dark workbench color.');
    requireValue(getComputedStyle(document.querySelector('.workspace-tab[aria-selected="true"]')).color === getComputedStyle(document.body).color, 'Light panel navigation foreground does not follow the selected palette.');
    document.body.dataset.codovynTheme = previousTheme;
    report.compactComposer = true;
    report.composerControls = true;
    stage('separate-composer-controls-verified');

    const hostMessage = (type, predicate = () => true) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(new Error(`No native host response: ${type}`)); }, 10000);
      const listener = event => { if (event.data?.type !== type || !predicate(event.data)) return; clearTimeout(timer); window.removeEventListener('message', listener); resolve(event.data); };
      window.addEventListener('message', listener);
    });
    document.querySelector('#model-chip').click();
    document.querySelector('#model-picker [data-choice="default:codex"]').click();
    requireValue(provider.value === 'codex' && model.value === '', 'Provider Default did not select the actual CLI default.');
    if (codexReasoningMetadata?.defaultModel !== 'native-default') {
      const capabilities = hostMessage('reasoning-capabilities');
      vscode.postMessage({ type: 'reasoning-capabilities' });
      await capabilities;
    }
    requireValue(codexReasoningMetadata?.defaultModel === 'native-default', 'Native metadata did not come from the isolated CLI fixture: ' + codexReasoningMetadata?.defaultModel);
    const effortChip = document.querySelector('#effort-chip'); effortChip.click();
    const effortPicker = document.querySelector('#effort-picker');
    requireValue(effortPicker.matches(':popover-open'), 'Inline Effort menu did not open.');
    requireValue(!effortPicker.querySelector('[data-choice="minimal"]'), 'Unsupported effort was invented for the default model.');
    effortPicker.querySelector('[data-choice="high"]').click();
    requireValue(reasoning.value === 'high' && currentTaskConfiguration().reasoning === 'high' && model.value === '', 'Provider Default + High did not reach the actual task configuration.');
    requireValue(!effortPicker.matches(':popover-open') && document.activeElement === effortChip, 'Effort selection did not restore focus.');
    effortChip.click();
    effortPicker.querySelector('button').dispatchEvent(new KeyboardEvent('keydown', {key:'End',bubbles:true}));
    requireValue(document.activeElement.dataset.choice === 'xhigh', 'Effort End navigation failed: ' + document.activeElement?.dataset.choice);
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
    requireValue(!effortPicker.matches(':popover-open') && document.activeElement === effortChip, 'Effort Escape/focus behavior failed.');
    compactComposer.rememberEffort(); provider.value = 'gemini'; provider.dispatchEvent(new Event('change'));
    requireValue(reasoning.value === '' && reasoning.disabled, 'Unsupported provider retained a Codex effort.');
    compactComposer.select(compactComposer.entries().find(entry => entry.key === 'default:codex'));
    requireValue(reasoning.value === 'high', 'Returning to a model did not restore its effort preference.');
    report.inlineEffort = true;
    let nextState = hostMessage('queue-state'); vscode.postMessage({ type: 'queue-list' });
    let queueState = await nextState;
    if (phase === 'relaunch') {
      const retained = queueState.tasks.find(task => task.request === 'Persistent native queue request' && task.status === 'queued');
      requireValue(retained, 'Queued request did not survive an actual native restart.');
      requireValue(retained.configuration.reasoning === 'high', 'Accepted queue reasoning snapshot did not persist.');
      nextState = hostMessage('queue-state', state => state.tasks.some(task => task.id === retained.id && task.status === 'cancelled')); vscode.postMessage({ type: 'queue-cancel', id: retained.id }); await nextState;
      report.queueRestoredAfterRestart = true;
    }
    const addQueued = async value => {
      request.value = value;
      const accepted = hostMessage('queue-accepted'); const state = hostMessage('queue-state', data => data.tasks.some(task => task.request === value && task.status === 'queued'));
      taskQueue.enqueue(); const ack = await accepted; await state;
      requireValue(taskQueue.tasks.find(task => task.id === ack.taskId)?.configuration.reasoning === 'high', 'Queued configuration dropped the selected reasoning effort.');
      requireValue(request.value === '', 'Durable queue acknowledgement did not clear the submitted composer draft.'); return ack.taskId;
    };
    const firstQueued = await addQueued('First native queued request');
    const secondQueued = await addQueued('Second native queued request');
    nextState = hostMessage('queue-state', state => state.tasks.filter(task => task.status === 'queued')[0]?.id === secondQueued); vscode.postMessage({ type: 'queue-reorder', id: secondQueued, position: 0 }); queueState = await nextState;
    requireValue(queueState.tasks.filter(task => task.status === 'queued')[0].id === secondQueued, 'Native queue reorder was not persisted.');
    nextState = hostMessage('queue-state', state => state.paused === true); vscode.postMessage({ type: 'queue-pause' }); requireValue((await nextState).paused === true, 'Native queue did not pause.');
    nextState = hostMessage('queue-state', state => state.paused === false); vscode.postMessage({ type: 'queue-resume' }); requireValue((await nextState).paused === false, 'Native queue did not resume.');
    for (const id of [firstQueued, secondQueued]) { nextState = hostMessage('queue-state', state => state.tasks.some(task => task.id === id && task.status === 'cancelled')); vscode.postMessage({ type: 'queue-cancel', id }); await nextState; }
    if (phase === 'first-launch') await addQueued('Persistent native queue request');
    report.queueManagement = true;
    stage('durable-native-queue-verified');

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

    request.value = 'Queue another request while running';
    const ime = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }); request.dispatchEvent(ime);
    requireValue(!ime.defaultPrevented && !taskQueue.pending, 'IME composition submitted a task.');
    const newline = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }); request.dispatchEvent(newline);
    requireValue(!newline.defaultPrevented && !taskQueue.pending, 'Shift+Enter did not preserve newline input.');
    const activeQueued = hostMessage('queue-accepted');
    request.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const activeAck = await activeQueued;
    requireValue(request.value === '' && chat.textContent.includes(prompt), 'Queueing the next instruction disrupted the active conversation.');
    nextState = hostMessage('queue-state', state => state.tasks.some(task => task.id === activeAck.taskId && task.status === 'cancelled')); vscode.postMessage({ type: 'queue-cancel', id: activeAck.taskId }); await nextState;
    compactComposer.close(taskQueue.menu);
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
    // DOM metadata fixture only: real provider transport and OS policy have separate tests.
    const fixtureId = 'discovered-opencode-nativefixture';
    send({type:'provider-models',provider:'opencode',metadata:{source:'native-opencode-fixture',defaultModel:'fixture/native-model',models:[{id:fixtureId,provider:'opencode',model:'fixture/native-model',source:'discovered',reasoning:['deep'],availability:'unknown'}]}});
    document.querySelector('#model-chip').click();
    search.value='fixture/native';search.dispatchEvent(new Event('input'));
    const openCodeChoice=picker.querySelector(`[data-choice="model:${fixtureId}"]`);
    requireValue(openCodeChoice && picker.querySelectorAll('[data-choice]').length===1,'OpenCode discovered model was not searchable.');
    const favorite=picker.querySelector('.model-favorite');if(favorite.getAttribute('aria-pressed')!=='true')favorite.click();
    picker.querySelector(`[data-choice="model:${fixtureId}"]`).click();
    requireValue(provider.value==='opencode' && model.value===fixtureId,'OpenCode model selection did not update actual task controls.');
    effortChip.click();
    requireValue(!effortPicker.querySelector('[data-choice="high"]') && effortPicker.querySelector('[data-choice="deep"]'),'OpenCode variants were replaced with unsupported generic reasoning.');
    effortPicker.querySelector('[data-choice="deep"]').click();
    const snapshot=currentTaskConfiguration();
    requireValue(snapshot.modelSource==='discovered' && snapshot.reasoning==='deep' && snapshot.provider==='opencode','OpenCode exact model/variant snapshot was lost.');
    for(const mode of ['agent','plan','ask']) {document.querySelector('#mode-chip').click();document.querySelector(`#mode-${mode}`).click();requireValue(permission.value===(mode==='agent'?'read-write':'read'),'OpenCode mode granted incorrect permissions.');}
    requireValue(currentTaskConfiguration().reasoning==='deep','Variant lost while changing modes: '+JSON.stringify(currentTaskConfiguration()));
    nextState=hostMessage('queue-state');vscode.postMessage({type:'queue-list'});queueState=await nextState;
    requireValue(currentTaskConfiguration().reasoning==='deep','Variant lost while loading queue: '+JSON.stringify(currentTaskConfiguration()));
    if(phase==='relaunch') {
      const retained=queueState.tasks.find(task=>task.request==='Persistent native OpenCode fixture'&&task.status==='queued');
      requireValue(retained?.configuration.modelId===fixtureId && retained.configuration.reasoning==='deep' && retained.configuration.modelSource==='discovered','OpenCode queue snapshot did not survive native restart.');
      nextState=hostMessage('queue-state',state=>state.tasks.some(task=>task.id===retained.id&&task.status==='cancelled'));vscode.postMessage({type:'queue-cancel',id:retained.id});await nextState;
      report.openCodeQueueRestored=true;
    } else {
      request.value='Persistent native OpenCode fixture';const acknowledged=hostMessage('queue-accepted');nextState=hostMessage('queue-state',state=>state.tasks.some(task=>task.request==='Persistent native OpenCode fixture'));taskQueue.enqueue();await acknowledged;await nextState;
    }
    compactComposer.close(taskQueue.menu);storeTaskSelection();
    report.openCodeModelAndVariant=true;stage('opencode-model-queue-verified');

    // Real host + SQLite review: never authorizes a live provider.
    const restoredTaskId='native-chat-journal';
    tabs('history').click();
    const flowCard=[...document.querySelectorAll('#tasks button.task')].find(button=>button.textContent.includes('Explain the native fixture project'));
    requireValue(flowCard,'Persisted ContextFlow task was missing from history.');
    let flowReply=hostMessage('history',data=>data.taskId==='native-contextflow-task');flowCard.click();await flowReply;
    flowReply=hostMessage('contextflow-state');document.querySelector('#switch-agent').click();const flowState=await flowReply;
    requireValue(flowState.transfer?.status==='prepared'&&text('#contextflow-summary').includes('fixture/native-model'),'Persisted ContextFlow review did not restore its exact recipient.');
    requireValue(document.querySelector('#contextflow-packet').textContent.includes('host-read')&&document.querySelector('#contextflow-status').getAttribute('aria-live')==='polite','Context preview or accessible announcement missing.');
    requireValue(!document.querySelector('#contextflow-continue').disabled,'Prepared ContextFlow cannot reach native approval.');
    requireValue(document.activeElement===document.querySelector('#contextflow-review h2'),'Switch Agent did not focus the review heading.');
    if(phase==='relaunch'){flowReply=hostMessage('contextflow-state',data=>data.transfer?.status==='rejected');document.querySelector('#contextflow-reject').click();await flowReply;requireValue(document.querySelector('#contextflow-continue').disabled,'Rejected transfer retained execution control.');report.contextFlowRejection=true;}
    report.contextFlowReview=true;stage('contextflow-persisted-review-verified');
    send({type:'history',taskId:'native-segment-fixture',status:'interrupted',request:'Native provider segment fixture',timeline:[{type:'message',text:'Codex earlier response'},{type:'segment',provider:'OpenCode',text:'New approved segment'},{type:'message',text:'OpenCode continuation response'}]});
    requireValue(chat.querySelectorAll('.chat-message-assistant').length===2&&chat.lastElementChild.querySelector('.chat-speaker').textContent==='OpenCode','Provider segments merged into an unlabeled response.');report.providerSegmentPresentation=true;
    // Restore the pre-existing conversation assertions; keep the review visible for screenshots.
    if(restoredTaskId){flowReply=hostMessage('history',data=>data.taskId===restoredTaskId);vscode.postMessage({type:'history',id:restoredTaskId});await flowReply;}
    report.transcriptMessages = [...chat.querySelectorAll('.chat-message')].map(item => item.textContent);
    report.activityRows = [...document.querySelectorAll('#timeline > li')].map(item => item.textContent);
    activateWorkspaceView('changes');
    return report;
  }

  window.addEventListener('message', async ({ data }) => {
    if (data?.type !== 'codovyn-native-chat-test' || typeof data.token !== 'string' || !/^[a-f0-9]{32}$/.test(data.token)) return;
    let report;
    try { report = { passed: true, checks: await run(data.token, data.phase) }; }
    catch (error) { report = { passed: false, error: String(error?.message || error) }; }
    vscode.postMessage({ type: 'codovyn-native-chat-test-result', token: data.token, report });
  });
  window.addEventListener('DOMContentLoaded',()=>vscode.postMessage({ type: 'codovyn-native-chat-test-ready' }),{once:true});
})();
