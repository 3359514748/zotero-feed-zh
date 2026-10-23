(function (root) {
  "use strict";
  class TranslationService {
    constructor({ request, readCache, writeCache, delay }) {
      this.request = request;
      this.readCache = readCache;
      this.writeCache = writeCache;
      this.delay = delay;
      this.cache = new Map();
      this.queue = Promise.resolve();
      this.writes = Promise.resolve();
      this.active = true;
      this.generation = 0;
    }
    async init() {
      try {
        const data = await this.readCache();
        if (data?.version === 1 && Array.isArray(data.entries)) {
          for (const [key, value] of data.entries.slice(-300)) {
            if (typeof key === "string" && typeof value?.title === "string" && typeof value?.abstract === "string") this.cache.set(key, value);
          }
        }
      } catch (_) { /* Missing or corrupt cache must not prevent startup. */ }
    }
    get(provider, title, abstract) {
      return this.cache.get(root.FeedZhCore.cacheKey(provider, title, abstract));
    }
    check(isCurrent) {
      if (!this.active || !isCurrent()) {
        const e = new Error("已取消"); e.name = "Cancelled"; throw e;
      }
    }
    translate(provider, title, abstract, isCurrent = () => true) {
      const generation = this.generation;
      const work = async () => {
        this.check(isCurrent);
        const cached = this.get(provider, title, abstract);
        if (cached) return cached;
        if (title.length + abstract.length > 30000) throw new Error("摘要过长（超过 30,000 字符），请分段翻译。");
        const translateField = async text => {
          const out = [];
          for (const chunk of root.FeedZhCore.splitText(text)) {
            this.check(isCurrent);
            await this.delay(650);
            this.check(isCurrent);
            out.push(await this.translateChunk(provider, chunk));
          }
          return out.join("\n");
        };
        const result = { title: await translateField(title), abstract: await translateField(abstract), time: Date.now(), provider };
        this.check(isCurrent);
        if (generation === this.generation) {
          this.cache.set(root.FeedZhCore.cacheKey(provider, title, abstract), result);
          while (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
          await this.persist();
        }
        return result;
      };
      const job = this.queue.then(work);
      this.queue = job.catch(() => {});
      return job;
    }
    async translateChunk(provider, text) {
      if (provider === "google") {
        const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" + encodeURIComponent(text);
        return root.FeedZhCore.parseGoogle(await this.request("GET", url, null, true));
      }
      throw new Error("未知翻译服务，请重新安装当前版本的插件。");
    }
    persist() {
      const data = { version: 1, entries: [...this.cache.entries()] };
      // Serialize atomic writes so a slower older write cannot overwrite newer data.
      this.writes = this.writes.catch(() => {}).then(() => this.writeCache(data));
      // Translation remains usable when the disk is full/read-only.
      return this.writes.catch(() => {});
    }
    async clear() { this.generation++; this.cache.clear(); await this.persist(); }
    stop() { this.active = false; }
  }
  root.FeedZhService = TranslationService;
  if (typeof module !== "undefined") module.exports = TranslationService;
})(this);
