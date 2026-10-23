(function (root) {
  "use strict";
  const NS = "http://www.w3.org/1999/xhtml";
  const CSS = `
    .fzh{font:inherit;color:inherit;line-height:1.7;min-width:0;padding:3px 2px 10px}
    .fzh *{box-sizing:border-box}.fzh p{margin:7px 0}.fzh-title{font-weight:650;font-size:1.06em}
    .fzh-abstract{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;cursor:text;margin-top:10px}
    .fzh-status,.fzh-hint{font-size:.87em;opacity:.73}.fzh-status[role=alert]{color:#b64b36;opacity:1}
    .fzh-tags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}
    .fzh-tag{border:1px solid #669d9666;background:#16796f10;border-radius:5px;padding:1px 6px;font-size:.87em}
    .fzh-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0}
    .fzh button,.fzh select{font:inherit;color:inherit;background:var(--material-button,transparent);border:1px solid #8887;border-radius:5px;padding:3px 8px;cursor:pointer}
    .fzh button:disabled{opacity:.5;cursor:default}.fzh button:focus-visible,.fzh select:focus-visible{outline:2px solid #168b81;outline-offset:2px}
    .fzh .fzh-primary{color:white;background:#16796f;border-color:#16796f}.fzh details{margin-top:9px}
    .fzh summary{cursor:pointer;font-size:.9em}.fzh-settings{padding:7px 0;font-size:.9em}
    .fzh-settings label{display:block;margin:6px 0}.fzh-original{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font-size:.93em}
  `;
  class FeedZhUI {
    constructor({ service, getPref, setPref }) {
      this.service = service; this.getPref = getPref; this.setPref = setPref;
      this.states = new Map(); this.active = true;
    }
    mount({ body, doc, paneID }) {
      if (this.states.has(body)) return this.states.get(body);
      const el = (name, text, className, parent = body) => {
        const node = doc.createElementNS(NS, name);
        if (text) node.textContent = text;
        if (className) node.className = className;
        parent.append(node); return node;
      };
      el("style", CSS);
      const box = el("div", "", "fzh");
      const title = el("div", "", "fzh-title", box);
      const hint = el("div", "方向提示 · 关键词推测（可悬停查看依据）", "fzh-hint", box);
      const tags = el("div", "", "fzh-tags", box);
      const status = el("p", "请选择一篇有摘要的订阅论文。", "fzh-status", box);
      status.setAttribute("aria-live", "polite");
      const abstract = el("div", "", "fzh-abstract", box);
      const toolbar = el("div", "", "fzh-toolbar", box);
      const translate = el("button", "翻译摘要", "fzh-primary", toolbar);
      const copy = el("button", "复制中文", "", toolbar); copy.disabled = true;
      const original = el("details", "", "", box);
      el("summary", "查看英文原文", "", original);
      const originalText = el("div", "", "fzh-original", original);
      const settings = el("details", "", "", box);
      el("summary", "翻译设置", "", settings);
      const settingsBox = el("div", "", "fzh-settings", settings);
      const providerLabel = el("label", "翻译服务：", "", settingsBox);
      const provider = el("select", "", "", providerLabel);
      provider.setAttribute("aria-label", "翻译服务");
      for (const [value, label] of [["google", "Google（免密钥）"]]) {
        const option = el("option", label, "", provider); option.value = value;
      }
      provider.value = this.getPref("provider", "google");
      const checkbox = (label, pref, fallback) => {
        const wrap = el("label", "", "", settingsBox);
        const input = el("input", "", "", wrap); input.type = "checkbox";
        input.checked = this.getPref(pref, fallback);
        wrap.append(doc.createTextNode(" " + label));
        input.addEventListener("change", () => {
          this.setPref(pref, input.checked); this.refreshAll();
        });
        return input;
      };
      const auto = checkbox("点击论文后自动翻译", "auto", true);
      const feedsOnly = checkbox("仅在订阅条目显示", "feedsOnly", true);
      el("p", "仅向所选服务发送当前论文的标题和摘要；译文缓存在本机。免密钥网页接口可能限流或失效。", "fzh-hint", settingsBox);
      const clear = el("button", "清空翻译缓存", "", settingsBox);
      const state = { body, doc, paneID, el, box, title, hint, tags, status, abstract, translate, copy,
        originalText, provider, auto, feedsOnly, timer: null, revision: 0, key: null, result: null, props: null };
      this.states.set(body, state);
      provider.addEventListener("change", () => { this.setPref("provider", provider.value); this.refreshAll(); });
      translate.addEventListener("click", () => this.run(state));
      copy.addEventListener("click", () => {
        if (state.result) {
          const helper = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper);
          helper.copyString(`${state.result.title}\n\n${state.result.abstract}`);
          state.status.textContent = "中文标题和摘要已复制。";
        }
      });
      clear.addEventListener("click", async () => {
        // Invalidate pending jobs as well as the persistent cache.
        for (const s of this.states.values()) { s.revision++; this.cancelTimer(s); }
        await this.service.clear();
        this.refreshAll(false);
        state.status.textContent = "本机翻译缓存已清空。点击“翻译摘要”可重新翻译。";
      });
      // Use Zotero's section-order method. Do not persist or overwrite the user's pane order.
      state.placeTimer = doc.defaultView.setTimeout(() => {
        if (!this.active || !body.isConnected) return;
        const details = body.closest("item-details");
        if (details?.changePaneOrder) details.changePaneOrder(paneID, 0, { render: false });
      }, 0);
      return state;
    }
    text(value, doc) {
      // Parse detached, inert HTML to handle RSS markup/entities without injecting feed HTML into Zotero.
      const parsed = new doc.defaultView.DOMParser().parseFromString(`<body>${value || ""}</body>`, "text/html");
      parsed.querySelectorAll("script,style,iframe,object").forEach(node => node.remove());
      parsed.querySelectorAll("br").forEach(node => node.replaceWith(parsed.createTextNode("\n")));
      parsed.querySelectorAll("p,div").forEach(node => node.append(parsed.createTextNode("\n")));
      return root.FeedZhCore.cleanText(parsed.body.textContent);
    }
    update(props, { force = false, allowAuto = true } = {}) {
      const s = this.mount(props); s.props = props;
      const item = props.item;
      const enabled = !!item?.isRegularItem?.() && (!this.getPref("feedsOnly", true) || !!item.isFeedItem);
      props.setEnabled(enabled);
      if (!enabled) { s.revision++; this.cancelTimer(s); s.key = null; return; }
      const title = this.text(item.getField("title"), props.doc);
      const abstract = root.FeedZhCore.cleanAbstract(this.text(item.getField("abstractNote"), props.doc));
      const provider = this.getPref("provider", "google");
      const key = JSON.stringify([item.libraryID, item.id, root.FeedZhCore.cacheKey(provider, title, abstract)]);
      if (!force && s.key === key) return;
      s.key = key; s.revision++; this.cancelTimer(s);
      Object.assign(s, { sourceTitle: title, sourceAbstract: abstract, sourceProvider: provider, result: null });
      s.provider.value = provider; s.auto.checked = this.getPref("auto", true); s.feedsOnly.checked = this.getPref("feedsOnly", true);
      s.title.textContent = ""; s.abstract.textContent = ""; s.copy.disabled = true;
      s.originalText.textContent = `${title}\n\n${abstract}`;
      s.tags.replaceChildren();
      const directions = root.FeedZhCore.directions(title, abstract);
      s.hint.hidden = !abstract;
      for (const direction of directions) {
        const tag = s.el("span", direction.label, "fzh-tag", s.tags);
        tag.title = "匹配原文：" + direction.evidence.join("、");
      }
      if (!directions.length && abstract) s.el("span", "未匹配明确方向，请结合摘要判断", "fzh-hint", s.tags);
      s.translate.disabled = !abstract; s.translate.textContent = "翻译摘要"; s.status.removeAttribute("role");
      if (!abstract) { s.status.textContent = "这条订阅没有提供摘要，无法直接翻译。可打开论文网页查看。"; return; }
      const cached = this.service.get(provider, title, abstract);
      if (cached) { this.show(s, cached, true); return; }
      s.status.textContent = this.getPref("auto", true) ? "等待翻译…" : "点击“翻译摘要”查看中文。";
      if (allowAuto && this.getPref("auto", true)) {
        s.timer = s.doc.defaultView.setTimeout(() => { s.timer = null; this.run(s); }, 550);
      }
    }
    show(s, result, cached = false) {
      s.result = result; s.title.textContent = result.title; s.abstract.textContent = result.abstract;
      s.copy.disabled = false; s.translate.disabled = false; s.translate.textContent = "重新翻译";
      s.status.removeAttribute("role");
      s.status.textContent = `Google · ${cached ? "本机缓存" : "机器翻译"} · 专业术语请对照原文`;
    }
    async run(s) {
      this.cancelTimer(s);
      if (!this.active || !s.sourceAbstract) return;
      const revision = ++s.revision;
      const isCurrent = () => this.active && s.revision === revision && s.body.isConnected;
      s.translate.disabled = true; s.translate.textContent = "翻译中…";
      s.status.removeAttribute("role"); s.status.textContent = "正在翻译当前论文，请稍候…";
      try {
        // Explicit retranslation removes only this cached result.
        if (s.result) this.service.cache.delete(root.FeedZhCore.cacheKey(s.sourceProvider, s.sourceTitle, s.sourceAbstract));
        const result = await this.service.translate(s.sourceProvider, s.sourceTitle, s.sourceAbstract, isCurrent);
        if (isCurrent()) this.show(s, result);
      } catch (e) {
        if (!isCurrent()) return;
        s.status.setAttribute("role", "alert"); s.status.textContent = root.FeedZhCore.errorMessage(e);
        s.translate.disabled = false; s.translate.textContent = "重试翻译";
      }
    }
    cancelTimer(s) { if (s.timer !== null) s.doc.defaultView.clearTimeout(s.timer); s.timer = null; }
    refreshAll(allowAuto = true) {
      for (const s of this.states.values()) if (s.props) this.update(s.props, { force: true, allowAuto });
    }
    destroy(body) {
      const s = this.states.get(body);
      if (!s) return;
      s.revision++; this.cancelTimer(s); s.doc.defaultView.clearTimeout(s.placeTimer);
      this.states.delete(body);
    }
    stop() { this.active = false; for (const body of [...this.states.keys()]) this.destroy(body); }
  }
  root.FeedZhUI = FeedZhUI;
})(this);
