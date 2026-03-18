# Privacy / 隐私声明

- `storage` is used solely to remember your NotebookLM group layout, folder membership, and whether a source is enabled so the panel retains your configuration. (`storage` 仅保存你的 NotebookLM 分组布局、文件夹归属和来源的启用状态。)
- `tabs` is used only to find, focus, or open the NotebookLM tab that already contains the source manager; no content from the page is read, stored outside the browser, or shared with external services. (`tabs` 只是为查找、聚焦或打开 NotebookLM 标签页，未读取页面内容，也不向外部发送数据。)
- The extension never sends NotebookLM content or derived metadata to external servers. All state syncing happens inside the browser and uses Chrome's local storage APIs. (扩展从不向外部服务器发送 NotebookLM 内容或推导出的元数据。所有状态同步均在浏览器内完成，使用 Chrome 的本地 storage API。)
- No analytics, crash reporting, or telemetry is embedded by this release. The packaged code ships inside the extension zip; the only remote resource currently referenced by the UI is the Google-hosted symbol font used for the injected panel controls. (此版本没有嵌入分析、崩溃上报或遥测。扩展代码全部随 ZIP 打包分发；当前 UI 唯一会访问的远程资源，是注入面板控件所使用的 Google 托管图标字体。)
