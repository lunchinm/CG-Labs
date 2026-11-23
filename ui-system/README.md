# UI System

面向计算机图形学实验 1、2、3 的共用界面系统。设计语言取自测量仪器、技术档案与航海图，不采用通用后台的圆角卡片、胶囊标签、渐变按钮和毛玻璃。

## 当前状态

- **V2 湖畔档案已定稿**：`design.md`、`system.css`、`preview.html` 已提升到本目录。
- 三版共用同一套 DOM 契约与同一个 `system.js`；V1、V3 保留在 `candidates/` 作为历史版本。
- 字体已改为本地打包的 OFL 字体，页面不再依赖 `system-ui`、PingFang、Segoe UI 等系统默认栈。
- `design.md` 已补入交互规范、动态效果实现、去 AI 味规范、参考链接与代码规范（第 11–14 节），交互改动已在浏览器复验。
- `system.js` 已加入组件注册表、`UI.motion`（WAAPI / FLIP / reduced-motion）、ResizeObserver 测量与页面级销毁；时长统一从 CSS token 读取。
- `preview.html` 的内联脚本已拆到 `preview.js`，页面层只保留命令、schema 与读数。
- `实验/3/设计线稿.html` 已完成并验证：Sheet 01 屏幕定稿、Sheet 02 组件解剖、Sheet 03 收起状态与命令。

## 规范结构

| 章节 | 内容 |
| --- | --- |
| 1–10 | 定位、token、字体、排版、组件解剖、状态、可访问性、扩展、复用、验收 |
| 11 | 交互规范：动效 token、组件交互表、键盘预算、指针、反馈、状态恢复、性能、验收；11.10 动态效果实现（CSS Grid / WAAPI / FLIP / ResizeObserver / 意图定时器） |
| 12 | 去 AI 味规范：视觉禁令、字体、色彩、版式、文案、组件形态、动效、自动检查、人工审查 |
| 13 | 参考与借鉴：视频、开源项目、借用边界 |
| 14 | 代码规范：分层边界、命名与 JSDoc、状态与事件、组件契约、借鉴与授权、自动检查、人工审查 |

## 版本

| 版本 | 状态 | 关键词 | 目录 |
| --- | --- | --- | --- |
| V1 暮色测量台 | 候选保留 | 石墨、琥珀、刻度、测绘仪器 | `candidates/v1-dusk-survey/` |
| V2 湖畔档案 | **已定稿** | Spectral 标题、旧金、页边注、档案页 | 根目录 + `candidates/v2-lakeside-archive/` |
| V3 夜航图 | 候选保留 | 深海、海图青、信号橙、等高线 | `candidates/v3-night-chart/` |

正式预览为 `ui-system/preview.html`；V1、V3 仅用于对照。

## 目录

```text
ui-system/
├── design.md                # 定稿设计规范（V2 湖畔档案）
├── system.css               # 定稿设计系统（@import ./base.css + token）
├── preview.html             # 定稿预览（结构）
├── preview.js               # 预览页面层：命令、schema、读数
├── base.css                 # 结构、布局、组件骨架、@font-face、动效 token
├── system.js                # Store、命令/组件注册表、动效、面板构建、绑定、销毁
├── CREDITS.md               # 借用来源、许可证与改动记录
├── scripts/check.ps1        # 字体/渐变/阴影/危险写法/时长硬编码检查
├── fonts/                   # 本地 woff2 子集、OFL 授权、再生成说明
├── candidates/
│   ├── v1-dusk-survey/      # 暮色测量台
│   ├── v2-lakeside-archive/ # 湖畔档案（定稿来源）
│   └── v3-night-chart/      # 夜航图
└── README.md
```

每个候选目录包含：

- `design.md`：设计关键词、token 表、组件解剖、状态、扩展规则。
- `system.css`：`@import "../../base.css"` + token 覆盖 + 少量组件形态覆盖。
- `preview.html`：与实验 3 页面同构的预览，包含展开 / 面板收起 / 沉浸三态、命令索引、键位账本。

## 字体

| 字族 | 角色 | 文件 |
| --- | --- | --- |
| Spectral | 档案大标题（拉丁） | `fonts/spectral-400.woff2`、`fonts/spectral-600.woff2` |
| IBM Plex Sans | 拉丁正文、字段标签 | `fonts/plex-sans-var.woff2`（wght 100–700，wdth 75–100） |
| Iosevka | 读数、键位 | `fonts/iosevka-400.woff2`、`fonts/iosevka-500.woff2` |
| Noto Serif SC | 中文大标题（20px 以上） | `fonts/noto-serif-sc-var.woff2` |
| LXGW WenKai | 中文正文、短标题、字段/账本/边轨标签 | `fonts/lxgw-wenkai-regular.woff2`、`fonts/lxgw-wenkai-medium.woff2` |

合计约 1.03 MB，SIL OFL 1.1，无 CDN。IBM Plex Mono 与 Noto Sans SC 已移除，中文正文与标签统一由霞鹜文楷承担。中文为实际渲染页面用字子集（约 945 字），已覆盖设计线稿与根目录导航；新增文案后的再生成步骤见 `fonts/README.md`。字体加载后的 Network、CLS、长任务、指示条补测与缓存命中验证见 `design.md` 11.10.8。

## 运行

在工作区根目录启动静态服务器：

```powershell
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000/ui-system/preview.html
http://localhost:8000/ui-system/candidates/v1-dusk-survey/preview.html
http://localhost:8000/ui-system/candidates/v3-night-chart/preview.html
```

## 接入实验页面

```html
<link rel="stylesheet" href="../../../ui-system/system.css">
<link rel="stylesheet" href="page.css">
...
<script src="../../../ui-system/system.js"></script>
<script src="commands.js"></script>
<script src="ui.js"></script>
```

页面只负责布局与 WebGL，视觉 token、组件外观、收起逻辑、命令索引由 `ui-system` 提供。

## 约定

- 所有组件用 `data-ui` 标记，状态用 `data-*` 属性，不靠追加 class 切换。
- 页面不写色值，只消费 `--ui-*` 语义 token。
- 页面不直接写 `font-family`，只消费 `--ui-font-display`、`--ui-font-body`、`--ui-font-mono`、`--ui-font-label`。
- 新组件通过 `UI.register(name, factory)` 注册；禁止改 `buildRow` 的 `if/else`。新皮肤通过覆盖 token 或新增 `data-theme` 实现。
- 新动效先判断机制：CSS 状态过渡 → WAAPI → FLIP → rAF 直写；时长只写 CSS token，由 `UI.motion` 读取。
- 命令只登记一次，面板、顶栏提示、命令索引、键位账本共用同一份数据。
- 借用代码必须写来源、许可证与改动点，并登记到 `CREDITS.md`；禁止 CDN 与运行时依赖。

## 扩展点

```js
// 新面板行：只注册，不改 buildRow
UI.register('color', function (row, ctx) {
  var field = ctx.h('div', { class: 'ui-field', 'data-bind': row.id });
  // 用 ctx.h / ctx.$ / ctx.$$ / ctx.motion 组装，返回 field
  return field;
});

// 可取消反馈：reduced-motion 下时长自动归零
var animation = UI.motion.animate(node, [
  { opacity: 0 },
  { opacity: 1 }
], { duration: 140, fill: 'both' });

// 布局重排：First → Last → Invert → Play
UI.motion.flip(card, function () {
  list.insertBefore(card, target);
});
```

## 代码检查

```powershell
node --check ui-system\system.js
powershell -ExecutionPolicy Bypass -File ui-system\scripts\check.ps1
git diff --check
```

`check.ps1` 会检查系统字体栈、渐变、毛玻璃、外阴影、胶囊圆角、`innerHTML`、`eval`、`setInterval`、`console.log`、硬编码动画时长与本地字体缺失；发现即失败，命中项需人工确认。
