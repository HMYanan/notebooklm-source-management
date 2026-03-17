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
7. When you enter a notebook from NotebookLM's SPA navigation, the page may refresh once so the extension can attach cleanly and keep the source list in sync. (当你通过 NotebookLM 的单页应用导航进入某个笔记本时，页面可能会自动刷新一次，以确保扩展正确挂载并保持来源列表同步。)

---

## 📄 License / 协议声明
This project is licensed under the MIT License.
本项目基于 MIT 协议开源。
