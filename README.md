# NotebookLM Source Management

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-2.6.1-green.svg)

A Chrome extension to enhance source management in Google NotebookLM.  
一款用于增强 Google NotebookLM 来源管理的 Chrome 浏览器扩展。

Works inside NotebookLM's source panel. The toolbar icon is a launcher, not a separate standalone app.  
功能直接运行在 NotebookLM 的来源面板内，工具栏图标只是一个启动器，并不是独立的小窗应用。

## ✨ Features / 核心功能

- 📁 **Folder Grouping (文件夹分类)**: Organize your sources into customized folders for better structure.
- 🖱️ **Drag & Drop (拖拽排序)**: Easily reorder sources and move them between folders with intuitive drag-and-drop.
- 🗑️ **Batch Delete (一键批量删除)**: Select multiple sources and delete them all at once to save time.
- 🌍 **Dual-Language (双语界面)**: Natively supports both English and Simplified Chinese (简体中文).

---

## 🚀 Installation / 安装指南

1. Download or clone this repository. (下载或克隆本源码仓库)
2. Open Chrome and go to `chrome://extensions/`. (在浏览器打开扩展程序页面)
3. Enable **"Developer mode"** in the top right. (开启页面右上角的“开发者模式”)
4. Click **"Load unpacked"** and select the extension folder. (点击“加载已解压的扩展程序”，选择本文件夹)
5. Pin the extension to the toolbar if you want a quick launcher. (如果你希望快速跳转，可以把扩展固定到工具栏)
6. If you are already inside a NotebookLM notebook, the toolbar icon will jump to the in-page source manager. If you are not in a notebook yet, it will open NotebookLM so you can choose one first. (如果你已经进入 NotebookLM 的某个笔记本，点击工具栏图标会跳到页面内的来源管理器；如果你还没进入具体笔记本，它会先打开 NotebookLM 供你选择。)
7. When you enter another notebook through NotebookLM's SPA navigation, the extension now attempts an in-place teardown and rebuild. A full refresh is only used as a last-resort recovery path if NotebookLM's panel cannot be reattached after repeated retries. (当你通过 NotebookLM 的单页应用导航进入其他笔记本时，扩展会优先在页面内完成拆卸与重建；只有在多次重试后仍无法重新挂载来源面板时，才会兜底刷新页面。)

## 🛡 Permissions / 权限说明
- `storage` is used to persist group ordering, enabled state, and the custom panel height per notebook so the UI stays in sync with your organization choices. (`storage` 用于保存每个笔记本的分组顺序、启用状态和自定义面板高度，确保界面与组织策略一致。)
- `tabs` enables the toolbar launcher to highlight, focus, or create NotebookLM tabs without guessing which tab you meant. (`tabs` 让工具栏图标能聚焦、切换或新建 NotebookLM 标签页，避免误操作。)

## 🔒 Privacy / 隐私说明
See [PRIVACY.md](PRIVACY.md) for how we treat user data and why nothing is sent outside the browser. (关于数据如何处理以及为什么不向浏览器之外发送内容，请参考 [PRIVACY.md](PRIVACY.md)。)

## 🛠 Troubleshooting / 故障排查
- **Manager disappears after NotebookLM updates or you switch notebooks.** Wait a moment for the in-place rebuild to finish. If the panel still does not return, refresh the page once so the extension can retry from a clean state. (NotebookLM 更新或切换笔记本后管理器消失时，先等待页面内重建完成；如果仍未恢复，再手动刷新一次，让扩展从干净状态重试。)
- **Batch actions don't click items.** Ensure the source rows are visible and not still loading; loading placeholders disable the controls until the native panel finishes parsing the document. (批量操作无法点击时，请确认来源项已完全加载：加载中会把控制按钮禁用，直到原生面板完成解析。)
- **Popup still shows "refresh needed" or "source panel missing"** even though you are inside a notebook. Open the launcher again after a manual refresh so the extension can rebuild state before reporting ready. (即使在笔记本内弹出窗口仍提示“需要刷新”或“找不到来源面板”，请先手动刷新页面，然后再打开启动器，让扩展重建状态。)
- **A source loses its saved enabled state after NotebookLM changes the DOM.** The extension now prefers stable DOM tokens and falls back to a normalized fingerprint (`title + aria-label + icon`). If NotebookLM exposes no stable identifier for a source, duplicate unnamed entries can still be rematched imperfectly after a major UI change. (如果 NotebookLM 改了 DOM 后某个来源丢失了已保存的启用状态，扩展会优先使用稳定标识，否则回退到 `标题 + aria-label + 图标` 的规范化指纹；若宿主页面完全不给稳定标识，重名或重复来源在大改版后仍可能无法百分之百精确匹配。)

## 📦 Packaging & Release / 打包与发布
1. Run `npm run verify` to execute `npm test -- --runInBand` and confirm the Jest suites stay green. (先运行 `npm run verify` 来执行 `npm test -- --runInBand`，确认测试全部通过。)
2. Run `npm run package` to build `release/notebooklm-source-management-<version>.zip`. It contains only the runtime files (`manifest.json`, `src/`, `_locales/`, and `PRIVACY.md`). (`npm run package` 会打出 `release/notebooklm-source-management-<version>.zip`，只包含运行时需要的文件：`manifest.json`、`src/`、`_locales/` 和 `PRIVACY.md`。)
3. Upload the generated zip to the Chrome Web Store. For manual testing with "Load unpacked", continue pointing Chrome at the repository root, not the `release/` directory. (把生成的 zip 上传到 Chrome 网上应用店；如果要用“加载已解压”做本地测试，仍然应选择仓库根目录，而不是 `release/` 目录。)

---

## 📄 License / 协议声明
This project is licensed under the MIT License.
本项目基于 MIT 协议开源。
