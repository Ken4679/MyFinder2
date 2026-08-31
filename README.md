# MyFinder (Windows 11 Fluent 极速文件搜索 & 软件安全管家)

> **轻量 · 极速 · 纯本地 · 检索核心只读 · 证据级安全审计 · 集中式便携存储**

MyFinder 是一款专为 Windows 11 / 10 打造的现代化本地文件秒搜与软件管理工具。基于 **Windows 11 Fluent Design 2.0** 风格定制，轻量快速，旨在帮助用户在仅记住文件名碎片（如一个中文词或英文词）时瞬间定位文件，并提供保守受控的应用管理体验。

---

## 📖 核心功能指南

### 1. 极速本地文件检索 (Search Core)
- **碎片记忆秒搜**：支持中文单字/词组（如“预算”、“合同”）、英文、混合语言、扩展名与路径模糊匹配。
- **动态相关度排序**：
  1. 完全匹配文件名
  2. 文件名前缀匹配
  3. 文件名中文字词/子串匹配
  4. 扩展名匹配
  5. 路径匹配
  6. 最近修改时间顺序
- **高性能底层引擎**：基于 SQLite 与 FTS5 全文检索引擎，支持分页流式加载与百万级文件平滑检索。
- **安全原生操作**：
  - **直接打开**：通过 Windows 默认程序安全协议打开文件。
  - **资源管理器定位**：在 Windows 资源管理器中高亮选中文件 (`explorer.exe /select,path`)。
  - **复制路径**：一键复制完整绝对路径。

### 2. 软件管家与安全卸载 (Software & Cleanup)
- **已安装软件发现**：自动读取 Windows 注册表 `Uninstall` 项，提供真实安装信息与发布者元数据。
- **官方卸载优先**：优先调起软件自带的官方卸载程序 (`QuietUninstallString` / `UninstallString`)。
- **后端授权残留清理**：
  - 采用严格的 Candidate ID 令牌授权机制，前端无法传入任意路径实施破坏。
  - 判定等级明确区分：高置信度 (High)、中置信度 (Medium)、低置信度 (Low) 与未知 (Unknown)。
  - 执行前多重强校验（多盘符 Windows 根目录/System32/Program Files/用户目录保护、符号链接/Reparse Point 检查、注册表备份）。

### 3. 本地数字签名与信任审计 (Security Analyzer)
- **真实 Authenticode 验证**：通过本地系统核验 PE 文件的数字签名与证书主题，绝不伪造或根据名字假定可信。
- **客观状态分类**：明确返回 `Valid Signature`、`Unsigned`、`Invalid Signature` 或 `Unknown`。

---

## 🔒 核心安全与隐私原则

1. **检索核心严格只读**：文件扫描与搜索索引模块不具备修改、重命名或写入用户数据的权限。
2. **纯本地离线运行 (100% Offline)**：不包含任何外部网络上传、云端遥测或用户数据收集。
3. **集中式便携存储 (`[EXE]\data\`)**：数据库 (`myfinder.db`)、WebView2 运行时缓存与审计日志均统一存放在执行程序同级 `data/` 目录下，便于管理与随身携带。

---

## ⚡ 技术架构

- **后端**：Rust (Tauri 2.0) + SQLite 3 (WAL 模式 + FTS5 全文索引)
- **前端**：React 18 + TypeScript + Tailwind CSS + Lucide Icons
- **持久化目录**：`[EXE DIRECTORY]\data\`
