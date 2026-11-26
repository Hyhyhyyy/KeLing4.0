const { test } = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./expeditionHarness.cjs');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('pausing, resuming and completing use measured active time only', () => {
  const { FocusClock } = harness(), clock = new FocusClock();
  clock.start('task-a', 1000);
  clock.pause(62000);
  assert.equal(clock.minutes('task-a', 300000), 1);
  assert.equal(clock.activeTask, null);
  clock.start('task-a', 400000);
  assert.equal(clock.minutes('task-a', 461000), 2);
  clock.remove('task-a');
  assert.equal(clock.minutes('task-a', 999999), undefined);
});

test('switching tasks retains each measured session without counting two clocks', () => {
  const { FocusClock } = harness(), clock = new FocusClock();
  clock.start('a', 0); clock.start('b', 65000);
  assert.equal(clock.minutes('a', 130000), 1);
  assert.equal(clock.minutes('b', 130000), 1);
  clock.start('a', 135000);
  assert.equal(clock.minutes('a', 190000), 2);
  assert.equal(clock.minutes('b', 190000), 1);
  assert.equal(clock.minutes('untimed', 190000), undefined);
  assert.equal(clock.minutes('a', 999999999), 1440);
});

test('failed list refresh keeps last known data and a successful retry clears the error', async () => {
  const h = harness(); h.account();
  h.useAppStore.setState({ tasks: [{ id: 'existing' }] });
  h.transport.defaults.adapter = async () => { throw new Error('offline'); };
  await h.useAppStore.getState().loadTasks();
  assert.equal(h.useAppStore.getState().tasks[0].id, 'existing');
  assert.ok(h.useAppStore.getState().dataErrors.tasks);
  h.transport.defaults.adapter = async config => response(config, { tasks: [{ id: 'refreshed' }] });
  await h.useAppStore.getState().loadTasks();
  assert.equal(h.useAppStore.getState().tasks[0].id, 'refreshed');
  assert.equal(h.useAppStore.getState().dataErrors.tasks, '');
});

test('an older overlapping list request cannot overwrite a newer result', async () => {
  const h = harness(); h.account(); let release;
  let dispatched;
  const ready = new Promise(resolve => { dispatched = resolve; });
  h.transport.defaults.adapter = config => new Promise(resolve => {
    release = () => resolve(response(config, { tasks: [{ id: 'outdated' }] })); dispatched();
  });
  const first = h.useAppStore.getState().loadTasks(); await ready;
  h.transport.defaults.adapter = async config => response(config, { tasks: [{ id: 'latest' }] });
  await h.useAppStore.getState().loadTasks(); release(); await first;
  assert.equal(h.useAppStore.getState().tasks[0].id, 'latest');
});

test('accepted task creation remains visible when subsequent refresh is offline', async () => {
  const h = harness(); h.account();
  h.transport.defaults.adapter = async config => {
    if (config.method === 'post') return response(config, { task: { id: 'created', title: '练习' } });
    throw new Error('refresh offline');
  };
  await h.useAppStore.getState().createTask({ title: '练习' });
  assert.equal(h.useAppStore.getState().tasks[0].id, 'created');
  assert.ok(h.useAppStore.getState().dataErrors.tasks);
});

test('accepted completion is not reported as failed if profile refresh fails', async () => {
  const h = harness(); h.account(); let writes = 0;
  h.useAppStore.setState({ tasks: [{ id: 't', status: 'IN_PROGRESS' }] });
  h.transport.defaults.adapter = async config => {
    if (config.url === '/tasks/t/complete') { writes++; return response(config, { task: { id: 't', status: 'COMPLETED', actualMinutes: 2 } }); }
    throw new Error('refresh offline');
  };
  await h.useAppStore.getState().completeTask('t', 2);
  assert.equal(writes, 1);
  assert.equal(h.useAppStore.getState().tasks[0].status, 'COMPLETED');
  assert.equal(h.useAppStore.getState().tasks[0].actualMinutes, 2);
  assert.ok(h.useAppStore.getState().dataErrors.profile);
});

test('a completed write from another identity cannot populate the current workspace', async () => {
  const h = harness(); h.account('a'); let release, dispatched;
  const ready = new Promise(resolve => { dispatched = resolve; });
  h.transport.defaults.adapter = config => new Promise(resolve => {
    release = () => resolve(response(config, { task: { id: 'private-a' } })); dispatched();
  });
  const pending = h.useAppStore.getState().createTask({ title: 'private-a' }); await ready;
  h.account('b'); h.useAppStore.setState({ tasks: [] }); release(); await pending;
  assert.equal(h.useAppStore.getState().tasks.length, 0);
});
