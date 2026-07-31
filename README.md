# MyFinder

MyFinder 是一款轻量、安全、纯本地运行的 Windows 11 Fluent Design 文件搜索与已安装软件管理桌面应用。

## 功能特性

- 🔍 **文件快速搜索**：基于 SQLite FTS5 全文搜索
- 📦 **软件管理**：自动扫描并列出系统已安装软件
- ⭐ **收藏夹**：将常用文件或文件夹添加到收藏
- 🕒 **最近文件**：自动记录最近访问/索引的文件
- 🌗 **主题切换**：支持浅色、深色、跟随系统
- 🔒 **纯本地运行**：所有数据保存在本地
- 📂 **多目录实时监控**：自动监测文件变化
- 🎒 **便携模式**：一键切换为绿色版
- ❓ **使用帮助**：内置 FAQ、快速入门和隐私说明
- 🖥️ **系统托盘支持**：最小化到托盘，后台运行

## 技术栈

- **框架**: .NET 8, WinUI 3 (Windows App SDK 1.5)
- **架构**: Clean Architecture, MVVM
- **依赖注入**: Microsoft.Extensions.DependencyInjection
- **持久化**: SQLite (WAL 模式, FTS5)

## 编译与运行

1. 使用 Visual Studio 2022 打开 `MyFinder.sln`
2. 确保已安装 .NET 8 SDK 以及 Windows 应用开发工作负载
3. 切换构建平台为 `x64`
4. 直接编译运行 `MyFinder.UI`

## 开源协议

MIT License
