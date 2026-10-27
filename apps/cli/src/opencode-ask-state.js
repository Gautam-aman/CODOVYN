/** Cancel only a never-admitted preparation. This does not certify process
 * cleanup; the caller must separately establish metadata/process termination. */
export function cancelUnsubmittedAsk(store,id){
 const task=store.get(id);if(!task||task.status!=='pending')return false;
 if(store.executionLease(id)||store.events(id).some(e=>e.kind!=='task-configuration'))return false;
 store.update(id,{status:'cancelled',activeAgent:task.activeAgent,step:task.step});
 store.append(id,'task-cancelled',{reason:'Owner Ask review closed before submission'});return true;
}
