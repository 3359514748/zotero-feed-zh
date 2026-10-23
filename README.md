# Zotero 订阅摘要中文助手

为 eess.AS 等英文 RSS 订阅设计：单击订阅中的论文，右侧最上方出现「中文速览」，显示中文标题、中文摘要和方向提示。无需先添加到文库，也无需下载 PDF。

**[下载 XPI 安装包](https://github.com/3359514748/zotero-feed-zh/raw/refs/heads/main/dist/zotero-feed-zh-0.1.0.xpi)** · [提交问题](https://github.com/3359514748/zotero-feed-zh/issues) · [MIT 许可证](LICENSE)

Zotero RSS abstract translator: click an English feed article to read its Chinese title and abstract in the item pane. No library import or PDF download required. Currently targets Zotero 10.0.x; uses an unofficial, keyless Google Translate endpoint. Internet access to Google is required.

## 安装

本版目标版本为 **Zotero 10.0.x**，按本机 10.0.6 的接口编写。尚未支持 Zotero 6/7/8/9。

1. 打开 Zotero → **工具 → 插件**。
2. 点击插件管理页的齿轮 → **从文件安装插件…**。
3. 选择 `dist/zotero-feed-zh-0.1.0.xpi`，确认安装。
4. 回到订阅，单击一篇有英文摘要的论文。
5. 右侧最上方会出现「中文速览」。首次通常需要等待数秒；长摘要分段翻译，需要更长时间。

不要解压 XPI，不要导入到文库，也不要把 XPI 当成论文附件打开。插件没有发布到公共更新服务器，更新时需要手动安装新 XPI。

## 使用

- 默认只在订阅论文显示，并在停留约 0.55 秒后自动翻译。快速按上下键浏览时，会跳过尚未开始的旧任务。
- 中英文分开显示，原始标题和摘要不被覆盖。中文内容支持鼠标选择和「复制中文」。
- 「查看英文原文」可展开对照。
- 「翻译设置」可关闭自动翻译、取消「仅在订阅条目显示」、清空本机缓存。
- 「重新翻译」会重新请求当前论文，不清空其他论文的缓存。
- 无摘要的订阅会明确提示，不会编造或截取全文。
- 若面板位置被其他插件改变，可以使用右侧的翻译图标定位「中文速览」。

## 免费服务与边界

当前使用已通过实测的 Google 免密钥网页翻译接口，无需 API Key，无需付费账户，也不附带收费功能。**这是非正式网页接口，不是具有可用性承诺的 Google Cloud Translation API**：可能因网络、限流或接口变化而失败，也不能保证永久可用。当前网络必须能访问 `translate.googleapis.com`。插件不会修改系统网络或代理配置。

曾测试必应免密钥入口，但未得到可用结果，因此没有把它作为可选功能交付。

「方向提示」只使用本地英文关键词规则（例如 speech recognition、speech enhancement），并可通过悬停查看匹配词。它不是作者提供的正式分类，也不是 AI 阅读全文后的判断；可能漏检或因摘要提及背景工作而误判。中文译文也可能误译术语。筛选后细读时请对照原文。

## 数据与隐私

- 只有当前选中论文的标题、摘要被发往 Google；不发送 PDF、整个文库、笔记或账户凭证。
- 为避免重复请求，最近最多 300 篇译文及其原文标识保存在本机 Zotero 资料夹的 `feed-zh-cache.json`；不写入条目的摘要字段，不随 Zotero 文库同步。
- 自动翻译可以关闭；关闭后仅在点击「翻译摘要」时发起请求。
- 不包含统计、广告、遥测或远程代码。
- Zotero 要求插件提供 HTTPS 更新地址。本地定制版使用保留的不可解析域名 `feed-zh.invalid`，没有公共更新服务；手动检查更新可能报告无法检查，不影响翻译。更新时重新安装 XPI。
- 卸载前如需清理缓存，可先点击插件中的「清空翻译缓存」。卸载插件不会删除文库条目。

## 故障排查

- **没有「中文速览」**：确认安装成功，使用 Zotero 10.0.x，并且当前选中的是订阅中的单篇论文。多选、分类标题、附件等不是摘要翻译对象。
- **显示无法连接或超时**：检查当前网络对 Google 翻译的可达性，再点击「重试翻译」。插件不会绕过网络限制。
- **429/请求过于频繁**：等待一段时间，避免连续快速触发重新翻译。已缓存内容仍可查看。
- **译文不准确**：展开英文原文核对，尤其是模型名、缩写、指标、否定和比较结论。

## 开发与验证

已在独立 Zotero 10.0.6 测试资料夹验证真实订阅选择、在线中文翻译、方向提示、顶部面板、缓存回看、无摘要提示和切换条目不残留旧译文。13 项自动化逻辑测试通过。测试使用自建的测试条目，不改动现有文库。

运行 `node --test tests/core-service.test.cjs` 执行逻辑测试。覆盖缓存、异常处理、快速切换取消、分段完整性等。

运行 `python tests/network-smoke.py` 用测试句子检查免费翻译服务的实时可达性。

运行 `python build.py` 重新生成 XPI。它只打包 `addon/`，不会打包测试资料夹、文库、日志或缓存。

`tests/zotero-harness.js` 为独立测试资料夹提供真实订阅选择验证；仅附加到 `test-addon/`，不进入发行 XPI。

参考接口：[Zotero 插件开发](https://www.zotero.org/support/dev/client_coding/plugin_development)、[Zotero 10 开发变更](https://www.zotero.org/support/dev/zotero_10_for_developers)。

## 许可证

源码按 [MIT](LICENSE) 开源。第三方翻译服务受各自条款和可用性约束，MIT 许可证不授予对第三方服务的使用权或可用性保证。
