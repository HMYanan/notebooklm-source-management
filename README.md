# NotebookLM Source Management

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.6.3-green.svg)

A Chrome extension for managing sources inside Google NotebookLM.

给 Google NotebookLM 的来源面板补一套更顺手的管理能力。NotebookLM 自带的来源列表在文件一多时会有点难整理，这个扩展做的事情很直接: 分组、拖拽、批量操作，以及一个中英双语界面。

它不是一个独立的小窗应用，功能直接挂在 NotebookLM 页面里的 source panel 上。浏览器工具栏图标更像一个入口，用来把你带回页面内的来源管理器。

## What It Does

- Group sources into custom folders.
- Reorder sources or whole groups with drag and drop.
- Delete multiple sources at once.
- Switch between English and Simplified Chinese.

如果你经常往一个 notebook 里塞很多 PDF、网页和文档，这些功能会比 NotebookLM 原生面板省事不少。

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on `Developer mode`.
4. Click `Load unpacked` and choose the repository root.
5. If you want quicker access, pin the extension to the toolbar.

安装完成后有两种常见情况:

- 如果你已经打开某个 NotebookLM notebook，点击工具栏图标会尽量直接定位到页面里的来源管理器。
- 如果你还没进入具体 notebook，它会先打开 NotebookLM，让你自己选一个。

NotebookLM 是单页应用，切换 notebook 时不会总是完整刷新页面。这个扩展会优先在当前页面内做拆卸和重建，只有在多次重试后还挂不上来源面板时，才会退回到刷新页面这条兜底路径。

## Permissions

- `storage`: 保存每个 notebook 的分组顺序、文件夹归属、来源启用状态和自定义面板高度。
- `tabs`: 让工具栏入口可以找到、聚焦或新建 NotebookLM 标签页，而不是盲猜你要操作哪一个。

## Privacy

这个扩展不会把 NotebookLM 内容发到外部服务器。状态保存都在浏览器本地完成，当前版本也没有埋分析、遥测或崩溃上报。

更完整的隐私说明见 [PRIVACY.md](PRIVACY.md)。

## Troubleshooting

**切换 notebook 后管理器不见了**

先等一下，让页面内重建流程跑完。如果还是没回来，手动刷新一次页面通常就够了。

**批量操作点不动**

先确认来源列表已经真正加载完成。NotebookLM 还在渲染占位内容时，相关控件会保持禁用。

**弹窗还在提示需要刷新，或者找不到 source panel**

通常是页面状态还没重新同步好。手动刷新后，再点一次工具栏入口。

**某个来源的启用状态丢了**

扩展会优先用稳定的 DOM 标识去匹配来源；如果 NotebookLM 没给稳定标识，就会回退到 `title + aria-label + icon` 这种规范化指纹。遇到重名、无名或者结构变化很大的来源项时，重建匹配仍然可能不够精确。

## Packaging

如果你要自己打包发布:

1. 先运行 `npm run verify`，确认 Jest 测试还是通过的。
2. 再运行 `npm run package`。
3. 打包结果会输出到 `release/notebooklm-source-management-<version>.zip`。

ZIP 包里只会带运行时需要的文件: `manifest.json`、`src/`、`_locales/` 和 `PRIVACY.md`。

如果只是本地调试，不要选 `release/` 目录，继续用 `Load unpacked` 指向仓库根目录就行。

## License

MIT
