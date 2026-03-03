# Git 版本管理大师核心指令指南 (Git Master Command Reference)

Git 不仅仅是一个备份工具，它是一个**分布式版本控制系统**。理解 Git 的核心逻辑（工作区、暂存区、本地仓库、远程仓库）是高效协作与安全开发的基石。

本指南将 Git 指令按开发生命周期的逻辑进行了深度梳理，旨在帮助你构建清晰的“提交链”思维。

---

## 一、 诞生与锚定（初始化与状态感知）

### 1. `git init`
- **用途**：在当前文件夹初始化一个新的 Git 仓库。
- **逻辑**：生成一个隐藏的 `.git` 文件夹，正式开启版本跟踪。

### 2. `git status`
- **用途**：(高频第一名) 查看当前仓库的状态。
- **逻辑**：它会告诉你哪些文件被修改了但没保存，哪些文件是新创建但没被跟踪的。**动工前、提交前必敲。**

### 3. `git log`
- **用途**：查看提交历史记录。
- **用法**：
  ```bash
  git log               # 显示详细历史
  git log --oneline     # (推荐) 每个记录只占一行，简洁明了
  git log -n 5          # 只看最近 5 条
  ```

---

## 二、 存档与封存（暂存区与提交）

### 1. `git add`
- **用途**：将修改后的文件放入“暂存区 (Staging Area)”。
- **用法**：
  ```bash
  git add index.js      # 添加特定文件
  git add .             # (高频) 添加当前目录下所有变动
  ```

### 2. `git commit`
- **用途**：将暂存区的内容正式封存为一版“快照 (Snapshot)”。
- **用法**：
  ```bash
  git commit -m "feat: 增加文件夹拖拽功能"  # 必须写清楚本次改了什么
  ```
- **核心守则**：**原子化提交**。一次提交只做一件事（比如只修一个 Bug，或只加一个功能），不要把一整天的工作混在一个 commit 里。

---

## 三、 时空分支（Branching & Merging）

### 1. `git branch`
- **用途**：分支管理。
- **用法**：
  ```bash
  git branch            # 查看本地所有分支
  git branch feature-x  # 创建名为 feature-x 的新分支
  git branch -d x       # 删除名为 x 的分支
  ```

### 2. `git checkout` / `git switch`
- **用途**：在不同分支间穿越。
- **用法**：
  ```bash
  git checkout main     # 切换到主分支
  git checkout -b dev   # 创建并立即切换到 dev 分支（极常用）
  ```

### 3. `git merge`
- **用途**：合并代码。
- **用法**：
  ```bash
  # 先切换到 main，然后把 dev 的代码拉过来合并
  git checkout main
  git merge dev
  ```

---

## 四、 云端同步（Remote Operations）

### 1. `git remote`
- **用途**：管理远程仓库连接。
- **用法**：
  ```bash
  git remote -v         # 查看当前关联的远程地址
  git remote add origin https://... # 关联新的远程仓库
  ```

### 2. `git push`
- **用途**：将本地的代码快照推送到云端（GitHub/GitLab）。
- **用法**：
  ```bash
  git push origin main  # 将本地 main 分支推送到 origin 远程
  ```

### 3. `git pull`
- **用途**：从云端拉取最新代码并自动合并到本地。
- **逻辑**：它是 `git fetch` (拉取) + `git merge` (合并) 的组合。

---

## 五、 救命稻草（撤销与回滚）

### 1. `git diff`
- **用途**：对比文件的差异。在 `git add` 之前看看自己到底改了哪几行代码。

### 2. `git reset` (⚠️ 谨慎使用)
- **用途**：回退到历史的某个节点。
- **用法**：
  ```bash
  git reset --hard HEAD^   # 狠心撤销最后一次提交，代码彻底回到上一版状态
  ```

### 3. `git stash`
- **用途**：**“临时存包处”**。你正在写代码，突然有个紧急 Bug 要去别的分支修，但手头代码还没写完不想 commit。
- **用法**：
  ```bash
  git stash             # 把手头改动临时藏起来，工作区变干净
  git stash pop         # 修完 Bug 回来，把刚才藏的代码“弹”出来继续写
  ```

---

💡 **架构师寄语**：Git 的艺术在于分支管理。**永远不在主分支 (`main/master`) 直接写代码**。先开 `feature/xxx` 分支，完成后再通过 `merge` 或 `PR (Pull Request)` 回到主干，这是专业开源项目的必经之路。
