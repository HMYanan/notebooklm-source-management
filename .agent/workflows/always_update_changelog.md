---
description: 每次修改代码（修复 Bug 或添加新功能）后更新 CHANGELOG.md 
---
# 更新日志规范 (Changelog Update Rule)

**CRITICAL RULE**: Whenever you fix a bug, optimize code, or add a new feature, you MUST synchronously update the `CHANGELOG.md` file in the root directory.

**执行步骤**:
1. 读取项目根目录下的 `CHANGELOG.md` 文件。
2. 将你的更改添加到 `## [Unreleased] (未发布)` 部分。
3. 根据你所做的修改，将其分类到适当的子标题下（如果不存在则创建）：
   - `### Added (新增)`: 新添加的功能。
   - `### Fixed (修复)`: 修复的 bug。
   - `### Changed (优化)`: 对现有代码或功能的优化与重构。
   - `### Removed (移除)`: 删除的功能。
4. 描述请尽量保持简明扼要（使用中文记录，方便 User 直接查阅和发布）。
