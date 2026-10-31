const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { IDBFactory } = require('fake-indexeddb');
const output = esbuild.buildSync({ stdin: { contents: `
export * from './src/services/guestExpedition'; export * from './src/services/guestAI';
export * from './src/services/guestSession'; export * from './src/services/guestData';
export * from './src/services/expedition'; export * from './src/services/expeditionStorage';
export * from './src/services/learningMaterials'; export * from './src/services/learningSchedule';
export * from './src/pages/Expedition/treeOperations';
export * from '@keling/shared/expedition';
export { useAppStore } from './src/store/useAppStore'; export {default as transport} from './src/services/api';
`, resolveDir: path.resolve(__dirname, '..') }, bundle: true, platform: 'node', format: 'cjs', write: false, define: require('../../../scripts/lib/vite-test-env.cjs') }).outputFiles[0].text;
module.exports = function harness() {
  const exports = {}, stored = new Map();
  const localStorage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  let fetcher = () => { throw new Error('Unexpected external network request'); };
  const context = { module: {exports}, exports, require, process, crypto: globalThis.crypto, structuredClone, TextEncoder, TextDecoder, Date, URL,
    URLSearchParams, Buffer, AbortController, AbortSignal, setTimeout, clearTimeout, setInterval, clearInterval, console,
    localStorage, indexedDB: new IDBFactory(), fetch: (...args) => fetcher(...args), Response, Request, Headers };
  vm.runInNewContext(output, context);
  const api = context.module.exports;
  return { ...api, context, setFetch: fn => { fetcher = fn; },
    guest() { api.endGuestSession(); const id = api.startGuestSession(); api.useAppStore.setState({ user: api.getGuestWorkspace().user, isGuest: true, isAuthenticated: true }); return {kind:'guest', id}; },
    account(id = 'account-a') { api.endGuestSession(); localStorage.setItem('token', 'verified-' + id); api.useAppStore.setState({ user: {id, level:1,exp:0,crystals:0}, isGuest:false, isAuthenticated:true }); return {kind:'account',id}; },
  };
};
