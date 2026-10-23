/* Zotero 10 bootstrapped plugin. No item/database mutations. */
var FeedZhCore, FeedZhService, FeedZhUI;
var feedZhApp;
var FEED_ZH_PREF = "extensions.feed-zh.";

async function startup({ id, rootURI }) {
  await Zotero.initializationPromise;
  for (const file of ["core.js", "service.js", "ui.js"]) Services.scriptloader.loadSubScript(rootURI + file, this);
  const cachePath = PathUtils.join(Services.dirsvc.get("ProfD", Ci.nsIFile).path, "feed-zh-cache.json");
  const requests = new Set();
  const service = new FeedZhService({
    request: async (method, url, body, json) => {
      let xhr;
      try {
        const response = await Zotero.HTTP.request(method, url, {
          ...(body ? { body, headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } } : {}),
          responseType: json ? "json" : "text", timeout: 18000,
          requestObserver: request => { xhr = request; requests.add(request); }
        });
        return json ? response.response : response.responseText;
      } finally { if (xhr) requests.delete(xhr); }
    },
    readCache: () => IOUtils.readJSON(cachePath),
    writeCache: data => IOUtils.writeJSON(cachePath, data, { tmpPath: cachePath + ".tmp" }),
    delay: ms => new Promise(resolve => setTimeout(resolve, ms))
  });
  await service.init();
  const ui = new FeedZhUI({
    service,
    getPref: (name, fallback) => Zotero.Prefs.get(FEED_ZH_PREF + name, true) ?? fallback,
    setPref: (name, value) => Zotero.Prefs.set(FEED_ZH_PREF + name, value, true)
  });
  feedZhApp = { service, ui, requests, paneID: null };
  for (const win of Zotero.getMainWindows()) onMainWindowLoad({ window: win });
  feedZhApp.paneID = Zotero.ItemPaneManager.registerSection({
    paneID: "feed-zh-overview", pluginID: id,
    header: { l10nID: "feed-zh-section", icon: rootURI + "icon.svg" },
    sidenav: { l10nID: "feed-zh-section", icon: rootURI + "icon.svg" },
    onInit: props => ui.mount(props),
    onItemChange: props => ui.update(props),
    onRender: props => ui.update(props),
    onDestroy: ({ body }) => ui.destroy(body)
  });
  if (!feedZhApp.paneID) throw new Error("中文速览面板注册失败");
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded("feed-zh.ftl");
}

function onMainWindowUnload({ window }) {
  if (!feedZhApp) return;
  for (const [body, state] of feedZhApp.ui.states) {
    if (state.doc.defaultView === window) feedZhApp.ui.destroy(body);
  }
}

async function shutdown() {
  if (!feedZhApp) return;
  feedZhApp.ui.stop(); feedZhApp.service.stop();
  for (const xhr of feedZhApp.requests) { try { xhr.abort(); } catch (_) {} }
  if (feedZhApp.paneID) Zotero.ItemPaneManager.unregisterSection(feedZhApp.paneID);
  for (const win of Zotero.getMainWindows()) win.document.querySelector('link[href="feed-zh.ftl"]')?.remove();
  await feedZhApp.service.writes.catch(() => {});
  feedZhApp = null;
}

function install() {}
function uninstall() {}
