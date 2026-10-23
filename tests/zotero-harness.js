// Appended ONLY to a test copy of bootstrap.js. Never shipped in the XPI.
var originalFeedZhStartup = startup;
startup = async function (data, reason) {
  await originalFeedZhStartup.call(this, data, reason);
  setTimeout(() => runFeedZhIntegration().catch(async error => {
    await IOUtils.writeJSON(PathUtils.join(Services.dirsvc.get('ProfD', Ci.nsIFile).path, 'integration-result.json'), {
      ok: false, error: String(error), stack: error.stack
    });
  }), 3000);
};
async function runFeedZhIntegration() {
  await Zotero.uiReadyPromise;
  const check = (value, message) => { if (!value) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async (fn, message, timeout = 60000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (fn()) return; await wait(200); }
    throw new Error(message);
  };
  const win = Zotero.getMainWindow();
  check(win, 'Main window unavailable');
  const runID = String(Date.now());
  const feed = new Zotero.Feed({ name: '插件测试订阅', url: 'https://example.invalid/feed-zh-test-' + runID, refreshInterval: 999999 });
  await feed.saveTx();
  const item = new Zotero.FeedItem('journalArticle', { guid: 'urn:feed-zh:test:' + runID + ':1' });
  item.libraryID = feed.libraryID;
  item.setField('title', 'Speech recognition with neural networks');
  item.setField('abstractNote', 'arXiv:2610.00000v1 Announce Type: new\nAbstract: This paper studies speech recognition and audio signal processing. We evaluate a neural network for automatic speech recognition.');
  await item.saveTx();
  Zotero.Prefs.set(FEED_ZH_PREF + 'auto', true, true);
  Zotero.Prefs.set(FEED_ZH_PREF + 'provider', 'google', true);
  await win.ZoteroPane.selectItem(item.id);
  let state;
  await until(() => {
    state = [...feedZhApp.ui.states.values()].find(s => s.props?.item?.id === item.id);
    return state?.result;
  }, 'Feed selection did not produce a translation');
  check(/[\u4e00-\u9fff]/.test(state.abstract.textContent), 'Missing Chinese abstract');
  check(/[\u4e00-\u9fff]/.test(state.title.textContent), 'Missing Chinese title');
  check(state.tags.textContent.includes('语音识别'), 'Missing topic hint');
  check(state.body.closest('item-pane-custom-section').hidden === false, 'Section unexpectedly hidden for feed');
  check(item.getField('abstractNote').includes('This paper'), 'Original abstract was modified');
  const details = state.body.closest('item-details');
  check(details.getPanes()[0].dataset.pane === feedZhApp.paneID, 'Overview is not the first section');
  const cachedResult = state.result;
  feedZhApp.ui.update(state.props, { force: true });
  check(state.status.textContent.includes('本机缓存'), 'Cached revisit failed');
  check(state.result === cachedResult, 'Cache result mismatch');
  // Switch to a second feed item without an abstract; old Chinese must disappear.
  const empty = new Zotero.FeedItem('journalArticle', { guid: 'urn:feed-zh:test:' + runID + ':2' });
  empty.libraryID = feed.libraryID; empty.setField('title', 'No abstract test'); await empty.saveTx();
  await win.ZoteroPane.selectItem(empty.id);
  await until(() => [...feedZhApp.ui.states.values()].some(s => s.props?.item?.id === empty.id && s.status.textContent.includes('没有提供摘要')), 'Empty abstract state failed', 10000);
  const emptyState = [...feedZhApp.ui.states.values()].find(s => s.props?.item?.id === empty.id);
  check(emptyState.abstract.textContent === '', 'Stale Chinese shown for a different paper');
  await win.ZoteroPane.selectItem(item.id);
  await until(() => [...feedZhApp.ui.states.values()].some(s => s.props?.item?.id === item.id && s.result), 'Reselect cached feed failed', 10000);
  const info = { ok: true, version: Zotero.version, title: cachedResult.title, abstract: cachedResult.abstract,
    paneID: feedZhApp.paneID, checks: ['feed-selection', 'live-google', 'chinese-title', 'chinese-abstract', 'topic-evidence', 'original-unchanged', 'top-pane', 'cached-revisit', 'empty-abstract', 'no-stale-content'] };
  await IOUtils.writeJSON(PathUtils.join(Services.dirsvc.get('ProfD', Ci.nsIFile).path, 'integration-result.json'), info);
}
