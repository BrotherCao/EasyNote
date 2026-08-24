# 📝 EasyNote

一款面向个人自用的轻量级 Markdown 笔记桌面应用（Windows）。核心特性：**悬浮小窗 + 不抢焦点**——让你在阅读 PDF / 网页 / 任意内容时随时随手记笔记，小窗始终置顶，点击屏幕其他区域不会消失。

![EasyNote](https://img.shields.io/badge/Tauri-2.x-orange) ![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00) ![Rust](https://img.shields.io/badge/Rust-1.96-dea584) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ 功能特性

### Markdown 笔记
- 完整 Markdown 语法支持（标题、列表、代码块、表格、引用、链接等）
- 左编辑 / 右预览分屏布局，实时渲染所见即所得
- 笔记以纯 `.md` 文件存储，无数据库、无专有格式，可用任何编辑器打开

### 悬浮小窗（核心卖点）
- 独立的 always-on-top 窗口，无边框、不在任务栏显示
- 点击屏幕其他区域（浏览器、PDF 等）小窗**不消失**、保持置顶
- 全局快捷键 `Ctrl+Shift+N` 随时切换显隐，应用未聚焦也能触发
- 可拖动、可调整大小，窗口位置和尺寸自动记忆
- 悬浮窗显示**当前正在编辑的笔记**——在主窗口选笔记后，悬浮窗自动同步加载

### 文件 / 文件夹管理
- 自定义根目录，所有笔记存储在你选择的文件夹下
- 新建 / 删除文件夹，名称自定义
- 新建 / 删除 / 重命名笔记（双击笔记名重命名）
- 侧栏树形展示，文件夹 + 笔记列表一目了然

### 其他
- 自动保存（防抖 500ms + 失焦保存 + `Ctrl+S` 手动保存）
- 暗色 / 亮色主题切换（跟随系统或手动）
- 窗口位置 / 大小持久化
- 外部链接点击自动用系统浏览器打开
- 纯文本 `.md` 存储，无锁定、无专有格式

---

## 📦 下载与安装

### 方式一：直接下载可执行文件（推荐）

从 [Releases](../../releases) 页面下载 `EasyNote.exe`，双击即可运行，无需安装。

> 前置条件：Windows 10/11（需内置 WebView2 运行时，Win11 已预装）

### 方式二：从源码构建

**环境要求：**
- [Rust](https://rustup.rs/) ≥ 1.75
- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/) ≥ 9
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)（含 MSVC 工具链）
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 已预装）

**构建步骤：**

```bash
git clone git@github.com:BrotherCao/EasyNote.git
cd EasyNote/easy_note_app

# 安装前端依赖
pnpm install

# 开发模式运行（热重载）
pnpm tauri dev

# 构建 release 可执行文件
pnpm tauri build
```

构建产物位于 `easy_note_app/src-tauri/target/release/easy_note_app.exe`。

---

## 🚀 使用指南

### 首次启动
1. 双击 `EasyNote.exe`
2. 选择一个文件夹作为笔记根目录（所有笔记将存储在此目录下）
3. 配置自动持久化，下次启动无需重复选择

### 创建笔记
1. 左侧栏点击 `+` 新建文件夹或笔记
2. 输入名称，回车确认
3. 笔记自动创建并以 `.md` 扩展名存储

### 编辑与预览
- 左侧为编辑器，右侧为实时预览
- 工具栏点击 👁 可切换预览显隐
- `Ctrl+S` 手动保存，或输入后自动保存
- 双击侧栏笔记名可重命名

### 悬浮小窗
- **`Ctrl+Shift+N`**：全局快捷键，随时呼出 / 收起悬浮窗
- 在主窗口选中一个笔记后，悬浮窗会自动加载该笔记内容
- 悬浮窗内可直接编辑，自动保存到同一个 `.md` 文件
- 点击 👁 切换编辑 / 预览模式
- `Esc` 关闭悬浮窗（内容自动保存）
- 拖动顶部标题栏可移动窗口位置

### 主题切换
- 工具栏点击 ☀ / 🌙 切换亮色 / 暗色主题

---

## 🏗️ 技术架构

| 层 | 技术选型 | 版本 |
|---|---|---|
| 应用框架 | [Tauri](https://tauri.app/) | 2.x |
| 后端语言 | Rust | 1.96 |
| 前端框架 | [SvelteKit](https://kit.svelte.dev/) + TypeScript | 5.x / 5.6 |
| 构建工具 | [Vite](https://vitejs.dev/) | 6.x |
| Markdown 渲染 | [markdown-it](https://github.com/markdown-it/markdown-it) | 15.x |
| 全局快捷键 | tauri-plugin-global-shortcut | 2.x |
| 文件对话框 | tauri-plugin-dialog | 2.x |
| 窗口状态 | tauri-plugin-window-state | 2.x |
| 外部链接 | tauri-plugin-opener | 2.x |

### 项目结构

```
EasyNote/
├── EasyNote.exe              # 构建产物（可执行文件）
├── prd.txt                   # 产品需求文档
├── README.md
└── easy_note_app/            # Tauri 项目根目录
    ├── package.json
    ├── svelte.config.js
    ├── vite.config.js
    ├── tsconfig.json
    ├── pnpm-workspace.yaml
    ├── src/                  # 前端源码
    │   ├── app.html
    │   ├── app.css           # 全局样式（亮/暗主题）
    │   ├── routes/
    │   │   ├── +layout.svelte
    │   │   ├── +layout.ts    # SPA 模式（SSR 关闭）
    │   │   └── +page.svelte  # 路由入口，按窗口 label 分发
    │   └── lib/
    │       ├── MainApp.svelte     # 主窗口组件
    │       ├── FloatingNote.svelte # 悬浮窗组件
    │       ├── fs.ts              # 文件系统操作封装
    │       ├── markdown.ts        # Markdown 渲染
    │       └── types.ts           # 类型定义
    └── src-tauri/            # Rust 后端
        ├── Cargo.toml
        ├── tauri.conf.json   # Tauri 配置（双窗口 + 插件）
        ├── build.rs
        ├── capabilities/
        │   └── default.json  # 权限配置
        ├── icons/
        └── src/
            ├── main.rs       # 入口
            └── lib.rs         # 核心逻辑（IPC 命令 + 插件注册）
```

### 核心设计

**双窗口架构**：Tauri 配置了两个 webview 窗口——`main`（主窗口）和 `floating`（悬浮窗），共用同一份前端代码。`+page.svelte` 通过 `getCurrentWebviewWindow().label` 分发到对应组件。

**跨窗口状态共享**：主窗口选中的笔记路径通过 Rust 侧 `State<Mutex<Option<String>>>` 存储，悬浮窗在获焦时通过 `onFocusChanged` 事件读取并加载对应笔记。

**纯文件存储**：所有笔记以 `.md` 文件直接存储在用户选择的根目录下，无数据库依赖，文件可用任何文本编辑器打开。

---

## 📋 功能范围

### ✅ 已实现（v1）
- Markdown 编辑 + 实时分屏预览
- 悬浮小窗（always-on-top + 全局快捷键 + 不抢焦点）
- 文件夹新建 / 删除 / 自定义名称
- 笔记新建 / 删除 / 重命名
- 自动保存（防抖 + 失焦 + 手动）
- 暗色 / 亮色主题
- 窗口位置 / 大小持久化
- 外部链接浏览器打开

### ❌ v1 不做（后续版本考虑）
- 多设备同步 / 云存储
- 端到端加密
- 插件系统
- 双向链接 / 反向链接（Backlinks）
- 全文搜索
- 图片粘贴 / 附件管理
- 移动端 / 网页端

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [Tauri](https://tauri.app/) — 构建轻量、安全的桌面应用框架
- [SvelteKit](https://svelte.dev/) — 极致轻量的前端框架
- [markdown-it](https://github.com/markdown-it/markdown-it) — 可扩展的 Markdown 解析器
