/* Pure text and response handling; shared by Zotero and node:test. */
(function (root) {
  "use strict";
  const RULES = [
    ["语音识别", /\b(?:speech recognition|automatic speech recognition|ASR|speech-to-text)\b/gi],
    ["语音合成", /\b(?:text.to.speech|speech synthesis|TTS|voice cloning)\b/gi],
    ["语音翻译", /\b(?:speech translation|speech.to.speech translation)\b/gi],
    ["说话人与声纹", /\b(?:speaker (?:verification|identification|diarization|recognition)|voiceprint)\b/gi],
    ["语音增强与分离", /\b(?:speech enhancement|speech separation|source separation|denoising|dereverberation)\b/gi],
    ["音频伪造检测", /\b(?:deepfake|anti.spoofing|spoofing detection|synthetic speech detection)\b/gi],
    ["音频与语言模型", /\b(?:audio.language model|speech.language model|speech.llm|audio.llm|spoken dialogue|speech foundation model)\b/gi],
    ["音乐与生成音频", /\b(?:music|text.to.audio|audio generation|sound generation)\b/gi],
    ["声音事件与异常检测", /\b(?:sound event|acoustic event|anomalous sound|audio anomaly|sound detection)\b/gi],
    ["视听多模态", /\b(?:audio.visual|audiovisual|lip.reading|visual speech)\b/gi],
    ["空间音频与声学", /\b(?:spatial audio|beamforming|room (?:acoustics|impulse response)|sound localization|acoustic scene|binaural)\b/gi],
    ["主动降噪", /\b(?:active noise (?:control|cancellation)|ANC)\b/g],
    ["音频编解码", /\b(?:audio codec|speech codec|audio coding|speech coding|neural codec)\b/gi]
  ];
  function cleanText(value) {
    return String(value || "").replace(/\r\n?/g, "\n").replace(/[\t \u00a0]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  }
  function cleanAbstract(value) {
    let text = cleanText(value);
    const marker = text.match(/(?:^|\n|\s)Abstract\s*:\s*/i);
    // Only remove an arXiv announcement prefix, never an arbitrary sentence.
    if (marker && /arxiv|announce type/i.test(text.slice(0, marker.index))) {
      text = text.slice(marker.index + marker[0].length);
    }
    return text.replace(/^Abstract\s*:\s*/i, "").trim();
  }
  function splitText(text, limit = 1600) {
    const points = Array.from(text);
    const chunks = [];
    while (points.length) {
      let end = Math.min(limit, points.length);
      if (end < points.length) {
        const candidate = points.slice(0, end).join("");
        const boundaries = [...candidate.matchAll(/[.!?]\s+|\n+/g)];
        const last = boundaries.pop();
        if (last && last.index > limit / 2) end = Array.from(candidate.slice(0, last.index + last[0].length)).length;
        else {
          const space = points.slice(0, end).lastIndexOf(" ");
          if (space > limit / 2) end = space + 1;
        }
      }
      chunks.push(points.splice(0, end).join(""));
    }
    return chunks;
  }
  function directions(title, abstract) {
    const text = `${title}\n${abstract}`;
    return RULES.map(([label, regex]) => {
      regex.lastIndex = 0;
      const matches = [...text.matchAll(regex)].map(match => match[0]);
      return { label, evidence: [...new Set(matches)], score: matches.length };
    }).filter(x => x.score).sort((a, b) => b.score - a.score).slice(0, 4);
  }
  function parseGoogle(data) {
    if (!Array.isArray(data?.[0])) throw new Error("翻译服务返回了无法识别的数据");
    const text = data[0].map(part => typeof part?.[0] === "string" ? part[0] : "").join("").trim();
    if (!text) throw new Error("翻译结果为空，请稍后重试");
    return text;
  }
  function cacheKey(provider, title, abstract) { return JSON.stringify([1, provider, title, abstract]); }
  function errorMessage(error) {
    if (error?.status === 429) return "请求过于频繁，服务已限流。请稍后重试。";
    if (error?.status === 403) return "翻译服务拒绝访问。请切换服务或稍后重试。";
    if (error?.name === "Cancelled") return "已取消";
    if (error?.status || /timeout|network|offline|NS_ERROR|fetch/i.test(error?.message || "")) {
      return "无法连接 Google 翻译或请求超时。请检查当前网络能否访问 translate.googleapis.com，再点击重试。";
    }
    return error?.message || "翻译失败，请重试。";
  }
  const api = { cleanText, cleanAbstract, splitText, directions, parseGoogle, cacheKey, errorMessage };
  root.FeedZhCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(this);
