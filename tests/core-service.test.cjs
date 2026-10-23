const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(overrides = {}) {
  const sandbox = vm.createContext({ console, setTimeout, clearTimeout });
  for (const file of ['core.js', 'service.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../addon', file), 'utf8'), sandbox);
  const calls = [], writes = [];
  const service = new sandbox.FeedZhService({
    request: async (method, url) => { calls.push(url); return [[['中文：' + decodeURIComponent(url.split('&q=')[1])]]]; },
    readCache: async () => null,
    writeCache: async data => { writes.push(data); },
    delay: async () => {}, ...overrides
  });
  return { core: sandbox.FeedZhCore, service, calls, writes };
}
test('Zotero 10 manifest includes a secure update URL and compatible version range', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../addon/manifest.json'), 'utf8'));
  const app = manifest.applications.zotero;
  assert.equal(app.id, 'feed-zh@local.zotero');
  assert.match(app.update_url, /^https:\/\//);
  assert.equal(app.strict_min_version, '10.0');
  assert.equal(app.strict_max_version, '10.0.*');
});
test('arXiv announcement stripped while scientific content is retained', () => {
  const { core } = setup();
  assert.equal(core.cleanAbstract('arXiv:2610.12345v1 Announce Type: new\nAbstract: We study ASR.'), 'We study ASR.');
  assert.equal(core.cleanAbstract('Our abstract: a new method.'), 'Our abstract: a new method.');
});
test('chunking is lossless with long text, whitespace and surrogate pairs', () => {
  const { core } = setup();
  for (const text of ['Hello. A study! '.repeat(600), '😀'.repeat(3601), 'a'.repeat(4200)]) {
    const chunks = core.splitText(text);
    assert.equal(chunks.join(''), text);
    assert.ok(chunks.every(x => Array.from(x).length <= 1600));
  }
});
test('direction labels expose matching evidence, do not infer absent topics', () => {
  const { core } = setup();
  const labels = core.directions('Speech recognition and music', 'ASR systems.');
  assert.equal(labels[0].label, '语音识别');
  assert.ok(labels[0].evidence.includes('ASR'));
  assert.equal(core.directions('An unrelated title', 'No relevant keywords.').length, 0);
});
test('provider parsers reject empty, blocked and malformed responses', () => {
  const { core } = setup();
  assert.equal(core.parseGoogle([[['语音'], ['识别']]]), '语音识别');
  assert.throws(() => core.parseGoogle('<html>captcha</html>'));
  assert.throws(() => core.parseGoogle([[]]));
});
test('translations are cached across sessions and bound to provider/source', async () => {
  const { service, calls, writes } = setup();
  await service.init();
  const first = await service.translate('google', 'Title', 'Speech recognition.');
  assert.ok(first.abstract.startsWith('中文'));
  assert.equal(calls.length, 2);
  await service.translate('google', 'Title', 'Speech recognition.');
  assert.equal(calls.length, 2);
  assert.equal(service.get('bing', 'Title', 'Speech recognition.'), undefined);
  assert.equal(service.get('google', 'Title', 'Changed.'), undefined);
  const second = setup({ readCache: async () => writes.at(-1) });
  await second.service.init();
  await second.service.translate('google', 'Title', 'Speech recognition.');
  assert.equal(second.calls.length, 0);
});
test('rapid selection change cancels queued requests before network transmission', async () => {
  const { service, calls } = setup();
  await assert.rejects(service.translate('google', 'old', 'old', () => false), { name: 'Cancelled' });
  assert.equal(calls.length, 0);
  await service.translate('google', 'new', 'new');
  assert.equal(calls.length, 2);
});
test('selection change during first chunk does not request the rest or cache stale output', async () => {
  let current = true, count = 0;
  const { service } = setup({ request: async () => { count++; current = false; return [[['中文']]]; } });
  await assert.rejects(service.translate('google', 'title', 'abstract', () => current), { name: 'Cancelled' });
  assert.equal(count, 1);
  assert.equal(service.cache.size, 0);
});
test('network failures are not cached and the queue recovers', async () => {
  let fail = true;
  const { service } = setup({ request: async () => { if (fail) throw Object.assign(new Error('network'), { status: 429 }); return [[['中文']]]; } });
  await assert.rejects(service.translate('google', 'title', 'abstract'));
  assert.equal(service.cache.size, 0);
  fail = false;
  assert.equal((await service.translate('google', 'title', 'abstract')).abstract, '中文');
});
test('cache clearing prevents an in-flight request from repopulating persistent cache', async () => {
  let unlock;
  let count = 0;
  const { service, writes } = setup({ request: async () => { if (++count === 1) await new Promise(r => unlock = r); return [[['中文']]]; } });
  const promise = service.translate('google', 'title', 'abstract');
  await new Promise(r => setImmediate(r));
  await service.clear(); unlock(); await promise;
  assert.equal(service.cache.size, 0);
  assert.equal(writes.at(-1).entries.length, 0);
});
test('a full disk does not turn a valid translation into an error', async () => {
  const { service } = setup({ writeCache: async () => { throw new Error('disk full'); } });
  assert.equal((await service.translate('google', 'title', 'abstract')).abstract, '中文：abstract');
});
test('corrupt cache is ignored and cache entries are bounded', async () => {
  const { service } = setup({ readCache: async () => { throw new Error('corrupt JSON'); } });
  await service.init();
  for (let i = 0; i < 301; i++) await service.translate('google', 't' + i, 'a');
  assert.equal(service.cache.size, 300);
  assert.equal(service.get('google', 't0', 'a'), undefined);
});
test('stopping disables further requests', async () => {
  const { service, calls } = setup(); service.stop();
  await assert.rejects(service.translate('google', 'title', 'abstract'), { name: 'Cancelled' });
  assert.equal(calls.length, 0);
});
