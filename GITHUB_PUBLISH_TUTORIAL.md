# NotebookLM Source Plus - GitHub 开源发布教程与全量逻辑指南

作为一名前端与浏览器扩展架构提供者，在将我们的插件开源至 GitHub 时，我们需要遵循严格的代码整洁度和开源社区规范。这不仅是上传代码，更是建立一个可靠、可控、规范的开源资产。

本教程涵盖了从**本地构筑防线**（`.gitignore`），到**远端身份校验**（PAT 鉴权），最终实现**代码出海**（Push to GitHub）的全部底层逻辑与标准动作。

---

## 第一阶段：大厦施工前的围栏（本地拦截过滤）

在任何代码进入 Git 进行管理之前，我们必须设置好过滤机制。我们将 `.DS_Store`，IDE 缓存，打包压缩包（`.zip`），还有巨大的设计稿通通拦截在外。**仓库应该只保留能编译出成品的“种子代码”与少量说明图片。**

### 1. 创建并配置 `.gitignore`
在项目根目录下创建一个名为 `.gitignore` 的核心文件，并在其中写入过滤规则：
```gitignore
# 系统级生成文件
.DS_Store
Thumbs.db

# 构建产物与发布版本的压缩包
*.zip
*.crx
/旧版本zip/

# 设计大图（不属于源码的超大二进制资产）
total.png
top.png
chrome插件图标.pxd

# IDE/编辑器目录
.vscode/
.idea/
```
💡 **逻辑解析**：极简原则。让拉取我们源码的其他开发者感受到轻量、飞速。

### 2. 完善开源资产三大件
- **`README.md` (门面)**：你的项目主页。需要包含：展示效果/动图，核心功能特性，安装步骤与双语说明。
- **`LICENSE` (规矩)**：明确其他人能如何使用你的代码（例如 MIT License 或 GPL）。
- **`CHANGELOG.md` (生命线)**：记录每一次从 v1.0 到 v2.0 的迭代轨迹。

---

## 第二阶段：本地版本库的激活（Git 初始化）

现在我们开始将代码真正纳入版本控制。

### 1. 初始化 Git 仓库
在你的项目中（终端定位到该目录下），执行：
```bash
git init
```
💡 **逻辑解析**：此命令会在你的项目中生成一个隐藏的 `.git/` 文件夹，本地的数据库被激活，开始在此处监控代码变动。

### 2. 添加与封存（Atom Commit）
我们将被允许的代码打包放入仓库：
```bash
# 将所有不被忽略的文件送入暂存区
git add .

# 为这批代码打上具有语义的标签
git commit -m "feat: initial commit for NotebookLM Source Plus"
```
💡 **逻辑解析**：遵循原子化提交（Atom Commit）。一次 `commit` 相当于游戏系统的一次完美存档，后续如果出了大 Bug，你可以随时安全回退到这个节点。

### 3. 校准主干分支维度
GitHub 如今默认主分支要求为 `main`：
```bash
git branch -M main
```

---

## 第三阶段：身份核验与跨海大桥的搭建（远程通信与鉴权）

这一步，你需要拥有将本地代码推送到云端的“通行证”。GitHub 在 2021 年废弃了直接用密码推送，强制采用更安全的 **PAT (Personal Access Token)** 机制。

### 1. 铸造 Personal Access Token (鉴权密匙)
1. 登录 GitHub网页端 -> 点击右上角头像 -> **Settings**。
2. 左边栏拉到最底 -> **Developer settings**。
3. 点击 **Personal access tokens** -> **Tokens (classic)**。
4. 点击 **Generate new token (classic)**。
5. **Node/Note**: 填入标识，例如 `Macbook-Pro-Push`。
6. **Expiration**: 建议选 `No expiration` 或按需选择期限。
7. **Scopes (至关重要)**: 务必勾选最重要的 `repo`（获得访问与操作私有和公开仓库的全部权限）。
8. 滑到最后生成 token，**立刻复制这串 `ghp_` 开头的密文中**（因为刷新后它将永久隐藏）。

### 2. 云端仓库建立
在 GitHub 网站点击 `+` -> **New repository**。
- Name: 填入 `notebooklm-source-plus`。
- 不要勾选 “Add a README” 或者 “Add a license”！（因为我们本地已经全部配置好了，如果在远端新建，将会导致推送产生冲突错位）。
- 点击 Create repository。

### 3. 连接与推送 (Deployment)
绑定远端地址：
```bash
# 替换为你的真实 GitHub 用户名和仓库名
git remote add origin https://github.com/你的GitHub用户名/notebooklm-source-plus.git
```

**执行最终推送（带鉴权）**：
```bash
git push -u origin main
```
这个时候终端会要求你：
- **Username**: 输入你的 GitHub 用户名。
- **Password**: 在这里**粘贴你刚才复制的那串 `ghp_...` 的 Token 代码**（注意：在 Mac 终端中粘贴密码时，屏幕上什么都不会显示，这是正常的安全屏障，粘贴后直接回车）。

---

## 第四阶段：后续的常态化维护工作流

一旦项目落成开源，你之后的开发更新工作流变成了极简的“三步曲”：

1. 添加新改动：
   ```bash
   git add .
   ```
2. 语义化提交你的日志（例如修复了 Bug）：
   ```bash
   git commit -m "fix: resolved right-side scrollbar UI glitch"
   ```
3. 直推云端：
   ```bash
   git push
   ```

🎉 **至此，你的插件已优雅、合规地开源到了全世界。**
