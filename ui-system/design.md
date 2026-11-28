# 湖畔档案（Lakeside Archive）

> 正式设计系统（V2 定稿）。三版候选中的选定版本，后续实验 1、2、3 共用本规范与 `system.css`。

## 1. 定位

把参数面板当成一页技术档案：页眉、编号、索引词条、页边注、账本。适合需要“可读、可引用、可写进报告”的场景，也适合实验 1、2 的推导过程展示——参数与结论并排，像实验记录而不是控制台。

关键词：档案、纸白底、衬线标题、旧金、页边注、目录、下划线。

### 1.1 界面用语

界面中文以“看一眼就知道在调什么”为准，不逐字直译英文控件名。当前实现使用：

| 界面用语 | 含义 | 早期代称 |
| --- | --- | --- |
| 参数面板 | 右侧四组参数（光照 / 材质 / 特效 / 相机） | 仪表架、读数控制台 |
| 状态栏 | 底部五格读数 | 账本 |
| 提示 | 底部操作反馈 | 回声 |
| 渲染视图 | P 键切换的调试输出 | 通道 |
| 最终画面 / 阴影视图 / 环境反射 / 雾效 / 法线 / 透明度 | 六个渲染视图 | 成片 / 阴影 / 反射 / 雾化 / 法线 / 透明 |
| 光源类型 / 光源距离 / 方位角 / 仰角 | 光照参数 | 类型 / 距离 / 方位 |
| 环境光 / 漫反射 / 高光强度 / 高光锐度 | Blinn-Phong 材质参数 | 环境 / 漫射 / 高光 / 锐度 |
| 反射强度 / 不透明度 / 凹凸强度 / 雾浓度 | 特效滑杆 | 反射 / 透明 / 凹凸 / 雾浓度 |
| PCF 柔化 / 环境反射 / 凹凸贴图 / 雾效 / 透明混合 | 特效开关 | PCF / 反射 / 凹凸 / 雾 / 半透明 |
| 环境光遮蔽 / 地平线辉光 | 折叠参数 | 遮蔽 / 地平光 |
| 背景来源 | 背景用模板的天空盒贴图（静止）还是程序化地形（水与云流动） | 场景质量 / 画质 |

## 2. 反面清单

- 卡片网格、圆角容器、胶囊标签、彩色徽章。
- 纯黑或深灰底、反色面板、“工业控制台”式暗色主题。
- 渐变、毛玻璃、发光、投影、噪点。
- emoji、通用图标库、装饰性插画。
- 裸滑杆、裸下拉框、无单位的读数。
- 全篇无衬线 13px；标题必须有衬线层级。
- 把“档案感”做成仿古纸张纹理或做旧滤镜。

## 3. Token

### 3.1 颜色

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ui-bg` | `#f1eee6` | 页面底色（纸） |
| `--ui-bar` | `#f7f5ee` | 顶栏、状态账本 |
| `--ui-surface` | `#faf8f2` | 仪表架、浮层 |
| `--ui-surface-2` | `#eeeae0` | 悬停底 |
| `--ui-surface-3` | `#e3ded1` | 二级浮层 |
| `--ui-ink` | `#23211b` | 正文与标题（墨） |
| `--ui-muted` | `#615b4e` | 次级文字 |
| `--ui-faint` | `#726b5c` | 注释、编号 |
| `--ui-line` | `rgba(35,33,27,.16)` | 发丝线、页边竖线 |
| `--ui-line-strong` | `rgba(35,33,27,.34)` | 展开分隔、浮层边框 |
| `--ui-accent` | `#80610f` | 旧金：选中、游标、焦点 |
| `--ui-cool` | `#4d6a5c` | 灰绿：状态标签、刻度端点 |

底色一律是纸白，不出现纯黑或深灰底；深色只留给文字与 1px 线。对比度：正文 13.9:1、次级 5.8:1、编号 4.6:1、旧金 5.0:1、灰绿 5.1:1（均按 `--ui-bg` 计）。

旧金只做“标注与选中”，不做大面积填充；灰绿只做状态，不做交互焦点。浅色下旧金压深到 `#80610f`，否则 12px 及以下的小字在纸底上会掉到 4.4:1。

### 3.2 字体

| 角色 | 字体 | 字号 | 用法 |
| --- | --- | --- | --- |
| 档案标题 | Spectral 400 | 12px | 抽屉标题、浮层标题、账本标签 |
| 字段标签 | IBM Plex Sans 500 | 10px | 字段标签（带下划线） |
| 读数 | Iosevka 400 | 11px | 数值、单位、键位 |
| 正文 | IBM Plex Sans 400 | 12–13px | 命令索引、说明 |
| 中文大标题 | Noto Serif SC 400 | 20px 以上 | 首页 h1、目录条目标题、图版大标题 |
| 中文短标题 | LXGW WenKai 500 | 11–14px | 品牌名、架头、抽屉标题、浮层标题 |
| 中文正文 | LXGW WenKai 400 | 随角色 | 提示、注释、长说明 |
| 中文标签 | LXGW WenKai 500 | 9–11px | 顶栏元信息、字段标签、账本标签、边轨、画面标注 |

全部字体本地打包，不使用 `system-ui`、`PingFang SC`、`Segoe UI`、`Inter`、`Roboto` 等系统或通用默认栈。IBM Plex Mono 与 Noto Sans SC（思源黑体）已从字体链与文件中移除，不再作为回退使用。

### 3.3 字体选择与打包

选择理由：

- **Spectral**：编辑型衬线，衬线短而结实，适合“档案/印刷品”气质；比 Playfair、Georgia 更少模板感。
- **IBM Plex Sans**：为界面设计的工程感无衬线，字形略窄、开口清晰，和仪表读数相处得好；避免 Inter/Roboto 的通用 AI 观感。
- **Iosevka**：窄体、技术感强的开源等宽字体，数字与单位符号密集，10–11px 读数不占宽度；替换掉 IBM Plex Mono，避免与 Plex Sans 同源造成的“默认搭配”感。
- **Noto Serif SC**：只承担 20px 以上的中文大标题；正文不再使用思源黑体。
- **LXGW WenKai（霞鹜文楷）**：楷体骨架、笔画收放自然，同时承担中文正文与微型标签；正文用 400，标签与短标题用 500。小字号下靠字重与字号区分层级，不再引入黑体回退。

文件与权重：

| 文件 | 字族 | 权重/轴 | 子集 |
| --- | --- | --- | --- |
| `fonts/spectral-400.woff2` | Spectral | 400 | 拉丁、标点、符号 |
| `fonts/spectral-600.woff2` | Spectral | 600 | 拉丁、标点、符号 |
| `fonts/plex-sans-var.woff2` | IBM Plex Sans | wght 100–700，wdth 75–100 | 拉丁、希腊、标点、符号 |
| `fonts/iosevka-400.woff2` | Iosevka | 400 | 拉丁、标点、符号 |
| `fonts/iosevka-500.woff2` | Iosevka | 500 | 拉丁、标点、符号 |
| `fonts/noto-serif-sc-var.woff2` | Noto Serif SC | wght 200–900 | 项目用字子集 |
| `fonts/lxgw-wenkai-regular.woff2` | LXGW WenKai | 400 | 项目用字子集 |
| `fonts/lxgw-wenkai-medium.woff2` | LXGW WenKai | 500 | 项目用字子集 |

约束：

- 字体全部本地打包，SIL OFL 1.1；`@font-face` 引入，无 CDN、无运行时下载。
- `font-display: swap`；`font-synthesis: none`，禁止浏览器伪造粗体/斜体。
- 中文子集只包含当前界面用字＋常见图形学术语；新增中文文案时需同时重新生成三套中文子集（Noto Serif SC、WenKai 400/500），步骤见 `fonts/README.md`。
- 读数统一 `font-variant-numeric: tabular-nums`，保证数字纵向对齐。
- `--ui-font-label` 只用于短中文标签；正文、说明、命令索引长文案仍走 `--ui-font-body`。
- 中文正文与标签同属 WenKai，层级只靠 400/500 与字号区分，不引入黑体回退。
- 10–14px 的中文标签与短标题固定 500 字重：楷体细笔画在小字号下会发虚，不靠放大字号补偿。
- 数值、单位、坐标、键位保持 `--ui-font-mono`；不把读数排成楷体，否则小数点和百分号会失去纵向对齐。

### 3.4 间距

- 抽屉头 40px，展开后正文左侧缩进 17px，并有一条 1px 页边竖线。
- 组间距 20px，行间距 8px；字段最小高度 32px。
- 顶栏 44px、账本 34px、仪表架 316px 为固定尺寸；收起后分别让位给画布与 24px 边轨。

## 4. 排版

### 4.1 字段行

```text
标签 62px | 控件 1fr | 读数 48px
```

- 标签带下划线（`text-underline-offset: 3px`），像索引词条。
- 读数右对齐、等宽；超过 6 个字符时改为上下排。
- 展开的抽屉正文整体右移，形成“页边注”区域；页边竖线只画一条，不嵌套。

### 4.2 抽屉

```text
34px 编号 | 1fr 衬线标题 | auto 读数
```

- 收起：一条发丝线，无底色。
- 展开：标题下方出现一条强分隔线，编号变旧金；不使用左侧色条。
- 抽屉内不再套第二层边框。

## 5. 组件解剖

### 5.1 刻度滑杆 `gauge`

- 高 26px；轨道与填充都在 `top:12px`。
- 滑块是 1×9px 竖线（弱化），上方叠加 5×5px 旋转 45° 的旧金菱形。
- 刻度 11 根；每 5 根改用灰绿。
- 交互：拖动、方向键、`PageUp/PageDown`、`Home/End`、双击复位。

### 5.2 档位 `bank`

- 连体单元格保留 1px 外框与竖分隔。
- 选中只用旧金文字 + 1px 下划线，不加底色。
- 键位提示保持等宽小字。

### 5.3 文字键 `key`

- 去掉完整边框，只留下划线；左侧 4×4px 菱形 LED。
- 关闭：LED 灰；开启：LED 旧金、文字墨色、下划线旧金。
- 悬停只加强下划线，不改变底色。

### 5.4 状态账本

- 标签用衬线 10px、字距 .12em；读数保持等宽 10px。
- 五等分，格间一条发丝线；不画图标。

### 5.5 命令索引与键位账本

- 标题衬线、字距 .1em；分组名灰绿。
- 行高 36px，像目录条目；选中行左侧 2px 旧金条由 `base.css` 提供。
- 键位账本仍是两列表；分组之间用留白，不用分隔卡片。

## 6. 状态

| 状态 | 表现 |
| --- | --- |
| idle | 下划线标签 + 灰绿编号 |
| hover | 下划线提到 `line-strong`；文字不变 |
| focus-visible | 1px 旧金外环 |
| active | 旧金文字 / 菱形 LED / 下划线，三者同步 |
| disabled | 透明度 .38 |
| echo | 行底色 `surface-2` + 左侧 2px 旧金条，600ms |

布局三态固定为展开 / 面板收起 / 沉浸；切换只改根节点属性，不销毁 DOM，画布与控件焦点不丢失。

## 7. 可访问性

- 衬线标题不参与控件交互，避免小字号衬线在按钮上难以辨认。
- 所有下划线标签的对比度不低于 4.5:1（`#615b4e` on `#faf8f2`）。
- 滑杆、档位、开关沿用统一 ARIA 约定。
- 菱形 LED 只是辅助，状态同时由文字「开 / 关」表达。

## 8. 扩展规则

- 新字段沿用 62/1fr/48 三列；超过 6 个字符自动上下排。
- 新分组沿用 34px 编号栏 + 衬线标题；不新增图标。
- 需要“注释”时用 `ui-note`，不使用气泡或悬浮说明卡。
- 需要“引用”时用左侧页边竖线 + 缩进，不新增边框颜色。
- 换主题只改 `@layer tokens`；衬线字体可在 `--ui-font-display` 一处替换。

## 9. 复用到实验 1、2

- 实验 1：抽屉改为 `01 GEOMETRY / 02 TRANSFORM / 03 PROJECTION / 04 CAMERA`，字段标签仍带下划线，适合展示矩阵参数。
- 实验 2：把报告中的“模型变换 → 视图变换 → 投影”做成三个抽屉，读数区显示矩阵元素，命令索引放“复位视图/切换投影”。
- 需要打印或截图进报告时，衬线标题与页边注比无衬线后台更接近论文排版。

## 10. 验收清单

- [ ] 衬线只出现在标题与账本标签，控件文字仍为无衬线/等宽。
- [ ] 展开抽屉只有一条页边竖线，无嵌套边框。
- [ ] 字段三列对齐，读数右对齐等宽。
- [ ] 旧金只用于选中/游标/焦点；灰绿只用于状态。
- [ ] 页面、面板、画布底都是纸白（`#f1eee6` 系），不出现纯黑或深灰底；画布里若放的是暗调场景插图，压在图上的图注另用纸白。
- [ ] 没有卡片、胶囊、渐变、投影、毛玻璃、emoji。
- [ ] 样式表与页面中不存在 `system-ui`、`PingFang SC`、`Segoe UI`、`Inter`、`Roboto` 等系统默认栈。
- [ ] Spectral、IBM Plex Sans、Iosevka、Noto Serif SC、LXGW WenKai 均从 `fonts/` 本地加载成功，无 CDN 请求；字体目录中不存在 Plex Mono 与 Noto Sans SC。
- [ ] 读数使用 `tabular-nums`，数字纵向对齐；`font-synthesis: none` 生效。
- [ ] 顶栏为 3px 双线，抽屉展开分隔线为单线，两者不混用。
- [ ] 三态收起、`Ctrl+K`、`?`、`P`、`F`、`Space` 均正常。
- [ ] 1280px 与 900px 下无重叠、无横向滚动。

## 11. 交互规范

### 11.1 五条原则

1. **100ms 内回应**：点击、按键、拖动必须立刻产生可见变化；命令索引不做入场动画，按下 `Ctrl+K` 就出现。
2. **键鼠同权**：每个功能都有键盘路径，键盘不是鼠标的补充；滑杆、档位、开关、浮层都能只用键盘完成。
3. **意图优先**：悬停展开延迟 120ms，移开延迟 180ms；指针一旦按下就固定面板，不允许操作中途消失。
4. **动效只解释状态**：只做颜色、边框、位置、展开高度；不做缩放、弹跳、视差、自动轮播、装饰性入场。
5. **状态不只靠颜色**：焦点有 1px 外环，开关有「开 / 关」文本，档位有下划线，禁用有透明度；色觉差异下仍可判断。

### 11.2 动效 token

| Token | 值 | 用途 |
| --- | --- | --- |
| `--ui-dur-1` | 90ms | 按下、LED、滑块加宽 |
| `--ui-dur-2` | 140ms | 悬停颜色、档位指示条滑动 |
| `--ui-dur-3` | 200ms | 抽屉展开、布局栏收起 |
| `--ui-dur-4` | 320ms | 页面级转场预留；沉浸模式因轨道数变化不做过渡 |
| `--ui-ease-out` | `cubic-bezier(.22,.61,.36,1)` | 进入、位移 |
| `--ui-ease-in-out` | `cubic-bezier(.4,0,.2,1)` | 可逆的布局变化 |
| `--ui-delay-hover` | 120ms | 边轨悬停意图 |
| `--ui-delay-close` | 180ms | 边轨移开收回 |
| `--ui-echo-ms` | 1400ms | 底部按键回声 |
| `--ui-highlight-ms` | 600ms | 面板行回声 |

规则：

- 任何过渡不得超过 320ms；超过就删除或改成瞬时。
- 禁止弹簧、回弹、缩放、旋转、视差、自动播放。
- 首屏不播放入场动画；页面加载即最终状态。
- 命令索引、键位账本出现时间为 0ms；搜索要像本地程序一样即时。
- 只过渡 `color`、`background-color`、`border-color`、`transform`、`opacity`、`grid-template-rows`、`grid-template-columns`；不过渡 `filter`、`box-shadow`、`height`。
- `prefers-reduced-motion: reduce` 下所有过渡降到 0.01ms，滚动行为改为 `auto`。

### 11.3 组件交互

| 组件 | 指针 | 键盘 | 反馈 | 禁止 |
| --- | --- | --- | --- | --- |
| 抽屉 | 点击标题切换 | `Tab` 到达，`Space/Enter` 切换 | 200ms `0fr → 1fr` 展开；标题背景 140ms | 悬停自动展开、手风琴式联动 |
| 边轨 | 悬停 120ms 浮出；移开 180ms 收回；按下即固定 | `Tab` + `Enter` 打开对应抽屉 | 编号变旧金；固定后边轨消失 | 拖拽、长按、悬停即跳转 |
| 刻度滑杆 | 轨道任意位置按下并拖动；双击复位 | `←/→`、`↑/↓` 单步；`PageUp/PageDown` 十倍；`Home/End` 到端点 | 读数实时更新；拖动时填充变实、滑块加宽 | 悬浮说明卡、拖动时弹窗 |
| 档位 | 点击单元格 | `←/→` 循环；`Home/End` 到两端 | 指示条 140ms 滑动；文字变旧金 | 填充色块、胶囊、缩放 |
| 机械开关 | 点击 | `Space/Enter` | LED 点亮、「开 / 关」文本切换、按下位移 1px | iOS 开关、发光 |
| 命令索引 | 点击行执行；点击遮罩关闭 | `Ctrl+K` 或 `/` 打开；输入过滤；`↑↓` 选择；`Enter` 执行；`Esc` 关闭 | 即时出现；选中行 2px 左条 | 入场动画、卡片式结果、鼠标悬停才显示快捷键 |
| 键位账本 | 点击行执行 | `?` 打开；`Tab` 循环；`Esc` 关闭 | 分组表；行悬停底色 | 平铺全部按键、无分组长列表 |
| 按键回声 | 无 | 任意命令触发 | 1400ms 底部单条提示；账本同步写入结果 | 多条堆叠、Toast 队列、声音 |
| 布局收起 | 顶栏把手、面板 `R`、账本把手、沉浸 `F` | `F` 切换沉浸；`Esc` 退出 | 200ms 网格过渡；沉浸瞬时切换 | 销毁 DOM、丢失焦点 |
| 浮层 | 点击遮罩关闭 | `Esc` 关闭最上层 | 实底面板 + 1px 边框 | 毛玻璃、投影、模糊背景 |

补充：

- 抽屉收起后内容为 `visibility: hidden`，不进入 Tab 顺序；展开时恢复。
- 边轨 `peek` 只存在于指针悬停期间；按下任意位置立即 `setArea('rack', true)`，防止调参时面板消失。
- 命令索引与键位账本使用焦点陷阱：`Tab` 在浮层内循环，`Shift+Tab` 反向循环。
- 滑杆使用 `setPointerCapture`；拖动时 `touch-action: none`，不会带动页面滚动。
- 禁用控件使用 `aria-disabled="true"`：透明度 .38，`pointer-events: none`，不进入键盘焦点。

### 11.4 键盘

常驻单键预算 **≤ 12**，当前分配：

| 键 | 命令 |
| --- | --- |
| `C` / `V` | 点光源 / 平行光 |
| `A` / `D` | 光源左转 / 右转 |
| `M` / `N` | 视场角增大 / 减小 |
| `P` | 渲染通道循环 |
| `F` | 沉浸模式 |
| `Space` | 重置场景 |
| `/` | 命令索引 |
| `?` | 键位账本 |
| `Ctrl+K` | 命令索引（组合键，不占单键预算） |

规则：

- 新功能默认 `keys: []`，只进命令索引；使用频率足够高才晋升为单键。
- 注册时检测重复键与浏览器保留键（`Ctrl+W`、`Ctrl+T`、`F5` 等），冲突直接抛错，不静默覆盖。
- 输入框、文本域、下拉框、`contenteditable` 内不拦截单键；只允许 `Esc` 与 `Ctrl+K`。
- 按钮、滑杆、链接上的 `Space/Enter` 交给原生控件，不触发全局命令。
- `Esc` 优先级：先关闭浮层，再退出沉浸模式，最后不做任何事。
- 焦点环统一 1px 实线 + 2px 偏移；禁止 `outline: none` 后不给替代。
- Tab 顺序跟随 DOM：顶栏 → 画布把手 → 仪表架 → 边轨 → 状态账本。

### 11.5 指针

- 可点击区域不小于 24×24px；滑杆高度 24px，轨道两侧都可命中。
- 悬停只改变颜色或边框；不使用 `scale()`、位移或阴影。
- 边轨悬停有 120ms 意图延迟；移开后 180ms 再收回，避免斜穿时闪烁。
- 滑杆拖动时指针捕获，移出画布仍继续响应；释放后立即结束。
- 光标：按钮 `pointer`，滑杆 `ew-resize`，拖动中 `grabbing`；不使用自定义光标。
- 不使用右键菜单、长按手势、双击（滑杆复位除外）。
- 任何只在悬停时出现的信息都视为缺陷；必须常驻或可通过键盘打开。

### 11.6 反馈

- 每个命令执行后，底部回声显示 1400ms，只保留一条，不堆叠。
- 回声同时写入状态账本；格式为“对象 + 结果”，例如 `LIGHT DIST 6.0 m`。
- 对应面板行高亮 600ms；高亮用底色 + 左侧 2px 旧金条，不用闪烁。
- 禁止声音、震动、彩带、全屏闪烁。
- 错误就地显示为一行文字，说明“发生了什么 + 下一步”；开发期命令冲突直接抛异常到控制台。

### 11.7 布局与状态恢复

- 顶栏、仪表架、状态账本三个区域独立收起，互不影响。
- 沉浸模式记录进入前的三栏状态；`F` 或 `Esc` 退出后原样恢复。
- 收起/展开只改根节点 `data-*` 属性，不销毁 DOM，不重置 WebGL 或控件焦点。
- 开合状态与当前打开的抽屉按页面路径写入 `localStorage`；`peek` 是临时状态，不持久化。
- 布局变化通过 `UI.on('layout', fn)` 通知页面；WebGL 页面据此重算画布尺寸与投影 aspect。
- 窄屏（≤ 920px）仪表架移到画布下方，边轨改为横向；不隐藏任何功能。

### 11.8 性能

- 只动合成友好的属性；档位指示条只改 `left/width`，抽屉只改 `grid-template-rows`。
- 档位指示条由 `ResizeObserver` 监听宽度变化，在 `requestAnimationFrame` 内只测量一次；字体加载完成后补测一次，不再用 `window.resize` 轮询。
- 浮层关闭后使用 `hidden` 停止绘制与命中测试。
- 命令索引搜索结果一次渲染，不做逐项动画。
- 目标 60fps；任何一次布局变化不得超过一帧的脚本预算。

### 11.9 交互验收

- [ ] 所有按钮、滑杆、档位、开关都能只用键盘完成。
- [ ] 焦点环在任何背景下都可见；不存在 `outline: none` 无替代。
- [ ] 抽屉展开/收起为 200ms，档位指示条为 140ms，按下反馈为 90ms。
- [ ] 命令索引即时出现，`Ctrl+K`、`/`、`?`、`Esc`、`F`、`Space` 均可用。
- [ ] 边轨悬停 120ms 展开，移开 180ms 收起，按下后固定。
- [ ] 滑杆拖动不会选中文字或滚动页面；双击复位有效。
- [ ] 回声只保留一条，1400ms 后消失；状态账本同步更新。
- [ ] 沉浸模式退出后恢复进入前的三栏状态。
- [ ] 开启“减少动态效果”后，所有过渡近似瞬时，功能不受影响。
- [ ] 抽屉没有用 JS 测量高度；档位没有用 `window.resize` 轮询。
- [ ] 关键动效在 Performance 面板中无超过 50ms 的长任务，无连续布局抖动。
- [ ] 禁用缓存 + Fast 3G 下 8 个 woff2 全部 200；字体替换后顶栏、仪表架、账本无布局位移。
- [ ] 字体就绪后档位指示条只补测一次；二次加载命中缓存，无新增字体请求。

### 11.10 动态效果实现

时长只回答“多久”，这一节回答“用什么机制”。选型顺序固定：

1. **CSS 状态过渡**：状态能用 `data-*` 表达、只改颜色/边框/轨道高度的，优先 CSS。
2. **Web Animations API**：反馈需要可取消、可反转、可读取播放状态时用 WAAPI。
3. **FLIP**：布局位置或尺寸发生变化、CSS 无法直接补间时，用 FLIP 把布局变化转成 `transform`。
4. **rAF 直写**：滑杆、轨道等连续指针输入直接写值，不排队、不加缓动。
5. **禁用**：`setInterval` 驱动动画；在 `pointermove` / `scroll` 中先读布局再写样式；用 `height: auto` 做过渡。

| 效果 | 机制 | 关键实现 | 不采用 |
| --- | --- | --- | --- |
| 抽屉展开 | CSS Grid 轨道 | `grid-template-rows: 0fr → 1fr`，内层 `min-height:0; overflow:hidden` | JS 量高度、`height:auto` |
| 三栏收起 | CSS Grid 轨道 | 根节点 `data-topbar/rack/ledge`，只改 `grid-template-*` | FLIP、绝对定位重排 |
| 档位指示条 | CSS `left/width` + 测量 | `ResizeObserver` + `requestAnimationFrame`，字体加载后补测 | `window.resize` 轮询 |
| 边轨 peek | data 属性 + 定时器 | 120ms 进入、180ms 收回、`pointerdown` 固定 | JS 逐帧动画 |
| 刻度滑杆 | Pointer Events | `setPointerCapture`，直接写 store，不排队 | 缓动、补间、滚动监听 |
| 按键回声 | CSS 过渡 + 单定时器 | 只保留一条，新命令覆盖旧定时器 | Toast 队列、堆叠 |
| 行高亮 | data 属性 + 定时器 | `data-echo="true"` 600ms 后复位 | 闪烁、循环动画 |
| 命令索引 | 瞬时显隐 | `hidden` 切换，0ms 出现，焦点陷阱 | 入场、缩放、淡入 |
| 焦点环 | CSS `:focus-visible` | 1px 外环 + 2px 偏移 | JS 描边 |
| 沉浸模式 | 属性切换 | 根节点 `data-focus`，保留进入前三栏状态 | 轨道过渡、FLIP |
| 未来列表重排 | FLIP + WAAPI | 只动 `transform/opacity`，文字密集块改用 Grid 轨道 | 直接改 `top/left/width` |

#### 11.10.1 抽屉：CSS Grid 轨道

```css
.ui-drawer__body {
  display: grid;
  grid-template-rows: 0fr;
  visibility: hidden;
  transition:
    grid-template-rows var(--ui-dur-3) var(--ui-ease-out),
    padding var(--ui-dur-3) var(--ui-ease-out),
    visibility 0s linear var(--ui-dur-3);
}

.ui-drawer__body-inner {
  min-height: 0;
  overflow: hidden;
}

.ui-drawer[data-open="true"] .ui-drawer__body {
  grid-template-rows: 1fr;
  visibility: visible;
  transition-delay: 0s;
}
```

要点：浏览器自己解析内层内容的固有高度，不需要 JS 测量；内层必须 `overflow:hidden`，否则收起时内容仍会溢出；`visibility` 延迟到收起结束，收起期间内容不进入 Tab 顺序。

#### 11.10.2 指示条：ResizeObserver + rAF

```js
const frames = new WeakMap();
const observer = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entry.target.classList.contains('ui-bank')) schedule(entry.target);
  }
});

function schedule(bank) {
  if (frames.has(bank)) return;
  const frame = requestAnimationFrame(() => {
    frames.delete(bank);
    const active = bank.querySelector('button[data-active="true"]');
    if (!active) return;
    bank.style.setProperty('--ui-bank-x', active.offsetLeft + 'px');
    bank.style.setProperty('--ui-bank-w', active.offsetWidth + 'px');
  });
  frames.set(bank, frame);
}
```

要点：每帧只读一次 `offsetLeft/offsetWidth`，读和写在同一帧完成；`ResizeObserver` 同时覆盖窗口缩放、面板宽度变化与字体加载；字体加载完成后再补测一次。

#### 11.10.3 可取消反馈：WAAPI

```js
const animation = UI.motion.animate(node, [
  { opacity: 0, transform: 'translate(-50%, 4px)' },
  { opacity: 1, transform: 'translate(-50%, 0)' }
], { duration: 140, fill: 'both' });

// 新反馈到来时取消旧动画，避免叠影
animation?.cancel();
```

`UI.motion.animate` 在 `prefers-reduced-motion: reduce` 下把时长设为 0；WAAPI 只用于会互相打断的反馈，不用于布局。需要保留结束状态时用 `fill: 'both'`，不要用 CSS `!important` 覆盖。

#### 11.10.4 布局重排：FLIP

```js
UI.motion.flip(card, () => {
  list.insertBefore(card, target);
}, { duration: 200 });
```

FLIP 的顺序是 First（记录首帧）→ Last（执行变更）→ Invert（用 `transform` 反向补偿）→ Play（播放到零位移）。只对容器或图片使用；文字密集的块会因 `scale` 变形，改用 11.10.1 的 Grid 轨道过渡。

#### 11.10.5 意图延迟：命名定时器

```js
let openTimer = 0;
let closeTimer = 0;

rail.addEventListener('pointerenter', () => {
  clearTimeout(closeTimer);
  openTimer = setTimeout(() => {
    document.documentElement.dataset.rack = 'peek';
  }, 120);
});

rail.addEventListener('pointerleave', () => {
  clearTimeout(openTimer);
  closeTimer = setTimeout(() => {
    if (document.documentElement.dataset.rack === 'peek') {
      document.documentElement.dataset.rack = 'closed';
    }
  }, 180);
});

rack.addEventListener('pointerdown', () => setArea('rack', true));
```

每个延迟都必须有名字、有清理路径；指针按下立即固定，避免调参时面板消失；组件销毁时清空两个定时器。

#### 11.10.6 时长只写一次

```css
:root {
  --ui-delay-hover: 120ms;
  --ui-delay-close: 180ms;
  --ui-echo-ms: 1400ms;
  --ui-highlight-ms: 600ms;
}
```

`system.js` 通过 `getComputedStyle(document.documentElement).getPropertyValue(...)` 读取这四个 token；CSS 与 JS 不各写一套数字。新增时长先加 token，再改文档，最后才写实现。

#### 11.10.7 性能与验证

- WAAPI / FLIP 只动 `transform` 与 `opacity`；Grid 轨道、`left/width` 只用于尺寸固定的局部元素。
- 所有布局读取集中在 `requestAnimationFrame` 中；禁止在同一个事件回调里“读—写—读—写”。
- `will-change` 只在动画期间加，结束移除；禁止给整页或整个仪表架加。
- 字体加载完成后补测一次指示条位置，避免字体替换造成的 1px 偏移。
- DevTools Performance 检查：无超过 50ms 的长任务；布局与绘制不连续抖动；目标 60fps。
- 验证矩阵：鼠标点击、键盘操作、快速连按、拖动滑杆、窗口缩放、字体慢加载、开启减少动态效果。

#### 11.10.8 字体加载后的性能验证

字体是本地 woff2 子集，仍要验证“加载、替换、测量”三个阶段，不能只看页面能否打开。按以下顺序执行，结果记入报告的性能小节，并保留 Network 与 Performance 截图。

**准备**

1. DevTools → Network：勾选 `Disable cache`，限速 `Fast 3G`，保留日志；打开 `实验/3/设计线稿.html`。该页面同时使用五个字族、加载 8 个 woff2；`preview.html` 只请求实际用到的 5 个，不能用来断言 8 个文件。
2. Network 过滤 `Font`：字体目录共 8 个 woff2（Spectral 400/600、Plex Sans、Iosevka 400/500、Noto Serif SC、WenKai 400/500），设计线稿页 8 个全部请求；全部 `200`、来自本地、无 CDN，总量 1,079,620 B（约 1.03 MiB）；出现 404 或重复请求直接判失败。`@font-face` 只在字面被使用时下载；若首屏未用到某个字重，先执行第 9 步的 `document.fonts.load` 列表，再断言请求数。
3. 在 Console 检查字体状态与覆盖：

```js
document.fonts.status;   // "loaded"
document.fonts.size;     // 8
document.fonts.check('12px "Spectral"', 'PHONG');
document.fonts.check('12px "Iosevka"', '6.0 m');
document.fonts.check('12px "Noto Serif SC"', '湖畔档案');
document.fonts.check('12px "LXGW WenKai"', '控制');
```

期望全部为 `true`；中文用 WenKai / Noto Serif 检查，英文用 Spectral / Iosevka 检查，不要拿不含中文字形的字体检查中文。若某项为 `false`，先 `await document.fonts.load(...)` 再检查；未被使用的 FontFace 不会自动下载。

**加载与替换**

4. 观察首屏文字：`font-display: swap` 下应先显示回退字体，再替换为本地字体；不允许整块文字长时间不可见（FOIT）。
5. 在 Console 读取每个字体资源的开始/结束时间与传输大小，并记录字体就绪时刻：

```js
performance.getEntriesByType('resource')
  .filter((e) => /\.woff2($|\?)/.test(e.name))
  .map((e) => ({
    file: e.name.split('/').pop(),
    start: Math.round(e.startTime),
    end: Math.round(e.responseEnd),
    transfer: e.transferSize
  }));

document.fonts.ready.then(() => {
  console.log('fonts ready at', Math.round(performance.now()), 'ms');
});
```

6. Performance 面板从刷新开始录制，到 `document.fonts.ready` 后再录 2 秒；检查 `Experience` 轨道的 Layout Shift 标记与 `Main` 轨道的长任务。字体解析/替换不应产生超过 50ms 的长任务。

**布局稳定性**

7. Rendering → 勾选 `Layout Shift Regions`，刷新页面，重点观察顶栏、仪表架字段标签、读数、状态账本、命令索引标题；字体替换后不得出现换行、截断、按钮宽度跳变。
8. 需要定位位移来源时，临时在 Console 执行（不要写入代码）：

```js
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      console.log(entry.value, entry.sources?.map((s) => s.node));
    }
  }
}).observe({ type: 'layout-shift', buffered: true });
```

目标：整页 CLS < 0.1；顶栏、仪表架、状态账本三个关键区域为 0。若发生位移，优先给标签/读数预留宽度（`min-width`、`tabular-nums`、固定三列），不要用隐藏文字或延后渲染掩盖。

**测量与交互**

9. 打开 `preview.html`，在 Console 主动加载全部字面，再检查档位指示条：

```js
await Promise.all([
  document.fonts.load('400 12px "Spectral"', 'PHONG'),
  document.fonts.load('600 12px "Spectral"', 'PHONG'),
  document.fonts.load('400 12px "IBM Plex Sans"', 'CONTROL'),
  document.fonts.load('400 12px "Iosevka"', '6.0 m'),
  document.fonts.load('500 12px "Iosevka"', '6.0 m'),
  document.fonts.load('400 12px "LXGW WenKai"', '控制'),
  document.fonts.load('400 12px "Noto Serif SC"', '湖畔档案')
]);
await document.fonts.ready;
await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const bank = document.querySelector('.ui-bank');
getComputedStyle(bank).getPropertyValue('--ui-bank-w');
```

应只补测一次，`--ui-bank-w` 与当前选中按钮宽度一致；Performance 面板中字体加载后只出现一次样式/布局计算，不应有持续的 rAF 循环。

10. 字体加载完成后录制 5 秒交互：展开/收起抽屉、按 `P`、拖动滑杆、开关 `Ctrl+K`。检查无超过 50ms 的长任务、无布局抖动，动效时长仍为 200 / 140 / 90ms。
11. 开启缓存再刷新设计线稿页：字体应命中缓存，`performance.getEntriesByType('resource')` 中字体资源的 `transferSize` 为 0 或来自 cache；回到 `preview.html` 反复开合抽屉，不得新增字体请求。

**失败与回退**

12. Network → 右键某个 woff2 → `Block request URL`，刷新页面；文字应回退到同字族栈并保持可读，布局不得塌陷；验证后恢复请求。
13. 恢复网络与缓存，重新跑一遍第 2–10 步，确认阻断测试没有留下缓存或状态污染。

**验收指标**

| 指标 | 目标 | 工具 |
| --- | --- | --- |
| 字体请求 | 8/8 `200`，本地，1,079,620 B（约 1.03 MiB），无重复 | Network |
| 字体状态 | `loaded`，8 个 FontFace，五项 `check` 为 `true` | Console |
| 首屏文字 | swap 后可见，无长时间 FOIT | 目视 + Performance |
| 布局位移 | CLS < 0.1；顶栏/仪表架/账本为 0 | Performance / Layout Shift Regions |
| 长任务 | 字体替换期间无 >50ms | Performance |
| 指示条 | 字体就绪后只补测一次，宽度对齐 | Console + Performance |
| 二次加载 | 字体命中缓存，无新增请求 | Network |
| 字体阻断 | 回退可读，布局不塌陷 | Network Request Blocking |

**实测记录（2026-11-21）**

环境：Chromium 159 headless（Playwright + CDP），视口 1440×1600，Fast 3G（562.5ms / 1.6Mbps / 750kbps），`Disable cache`。

| 项目 | 实测 |
| --- | --- |
| 字体请求 | 8/8 `200`，全部 `http://localhost:8123/ui-system/fonts/`；encoded 1,079,620 B（1.03 MiB）；冷启动无重复请求；运行时页按需请求 5 个（671,496 B） |
| 字体状态 | `loaded`；`size` 8；8 个 FontFace 均 `loaded`；8 条 `@font-face` 均为 `font-display: swap`；五项 `check` 为 `true` |
| 首屏替换 | FCP 2052ms 时 `document.fonts.status` 仍为 `loading`；字体 1939–7725ms 陆续到位；截图确认先显示回退字体，无 FOIT |
| CLS | 0.00018（0.000177 + 0.00000008 + 0.0000014）；顶栏、仪表架、状态账本、画布容器矩形与基线一致 |
| 长任务 | 字体窗口内 0；设计线稿自身解析与首次布局各有一次 108ms / 88ms，均发生在任意字体字节到达前；`preview.html` 整页 0 |
| 指示条 | 字体 `loadingdone` 后第 1 帧补测一次（两个 bank 各写 x/w 一次）；强制加载其余字面后不再补测；`--ui-bank-w` 137px / 46px 与选中按钮宽度一致 |
| 5 秒交互 | 抽屉 0.2s `grid-template-rows`、指示条 0.14s `left/width`、抽屉头 0.14s；token 90 / 140 / 200ms；0 长任务、CLS 0 |
| 二次加载 | 8 个字体 `transferSize` 全为 0（`encodedBodySize` 保留），9 次 `requestServedFromCache`；`preview.html` 反复开合抽屉与 `Ctrl+K` 新增字体请求 0 |
| 字体阻断 | 阻断 `noto-serif-sc-var.woff2`：该 FontFace `status = error`，其余 7 个 `loaded`；关键容器与画布矩形不变，`scrollWidth = clientWidth = 1600`，回退可读 |

唯一未归零项：顶栏提示行在 swap 时有一次水平重排（得分 0.000177），来自回退字体与本地字体的度量差异；容器尺寸未变，整页 CLS 仍低于阈值一个数量级。若后续要求严格为 0，用 `size-adjust` / `ascent-override` 对齐回退度量，不要延后渲染或隐藏文字。

参考：

- Animation Patterns：`https://animationpatterns.art/animations/grid-row-accordion-expand/`（CC BY 4.0，仅借 0fr/1fr 模式）
- Paul Lewis《FLIP Your Animations》：`https://aerotwist.com/blog/flip-your-animations/`
- CSS-Tricks《Animating Layouts with the FLIP Technique》：`https://css-tricks.com/animating-layouts-with-the-flip-technique/`
- MDN《Using the Web Animations API》：`https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API`
- MDN《ResizeObserver》：`https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`
- web.dev《prefers-reduced-motion》：`https://web.dev/prefers-reduced-motion/`
- Motion（MIT，WAAPI 封装参考）：`https://github.com/motiondivision/motion`
- Anime.js（MIT，时间轴与交错参考）：`https://github.com/juliangarnier/anime`
- B 站《FLIP 动画》：`https://www.bilibili.com/video/BV1MqbBzCEEA/`
- YouTube《FLIP Animations》播放列表：`https://m.youtube.com/playlist?list=PLWyLhWujYzKcyqtnw67zYcyzlSZpwEffU`

以上项目只借机制与 API 用法，不引入运行时依赖；实际代码为原生实现，授权记录见 `CREDITS.md`。

## 12. 去 AI 味规范

这一节是硬规则，不是风格建议。任何一条不满足，就重做，不用“看起来还行”作为理由。

### 12.1 视觉禁令

| 禁止 | 替代 |
| --- | --- |
| 2×2 / 3×2 等分卡片阵列 | 三列字段网格、编号分区、账本行 |
| 圆角卡片承载整块内容 | 1px 发丝线 + 留白 + 缩进 |
| 胶囊标签、彩色底徽章、推荐角标 | 微型大写文字 + 下划线 + LED 点 |
| 渐变按钮、紫蓝渐变、发光边框 | 纯色 + 单一强调色 |
| 毛玻璃、背景模糊、半透明面板 | 实底面板 + 1px 边框 |
| 投影分层（外阴影） | 发丝线、留白、层级缩进 |
| 通用图标库、emoji | 文字缩写、几何线稿、刻度 |
| 裸滑杆、裸下拉框 | 刻度 + 读数 + 单位 + 范围 |
| 居中大标题 + 副标题的落地页结构 | 左对齐图纸标题 + 图号 + 修订栏 |
| 装饰性入场、悬停缩放、自动轮播 | 只保留解释状态的过渡 |
| 悬浮说明卡盖在场景上 | 引线 + 圆点 + 编号标注 |

允许的例外：

- 页眉使用 3px 双线；其余分隔一律 1px。
- 选中/回声允许 `inset` 1–2px 色条；禁止外阴影。
- 圆角只允许 2px，用于按键与浮层；其余直角。
- 状态点可以是 5px 方形套准标记，不用圆形 LED 也行。

### 12.2 字体

- 只使用 `--ui-font-display`、`--ui-font-body`、`--ui-font-mono`、`--ui-font-label` 四个 token。
- 页面与组件不得出现 `system-ui`、`PingFang SC`、`Segoe UI`、`Inter`、`Roboto` 等系统或通用默认栈。
- 字体必须本地打包，SIL OFL 1.1；禁止 CDN、禁止运行时下载。
- 同屏至少三种字号角色：图纸标题、微型大写标签、等宽读数；禁止全篇 13px。
- 标题字距 `.14em–.24em`；标签 `.12em–.16em`；读数 `0–.02em`。
- 读数使用 `tabular-nums`；`body` 设置 `font-synthesis: none`，不允许伪粗体。
- 中文只用三套子集：LXGW WenKai 400 排中文正文与长说明，LXGW WenKai 500 排短标题、短标签与元信息，Noto Serif SC 只排 20px 以上大标题；新增文案必须重新生成三套子集。
- 不把 WenKai 500 再用到正文段落上，也不引入黑体做正文或标签回退；角色切换必须成体系，不能逐处混搭。

### 12.3 色彩

- 一屏只允许一个强调色；旧金用于选中、游标、焦点。
- 底色只用纸白（`--ui-bg` `#f1eee6`），不出现纯黑、深灰或反色底；深色只用于文字与 1px 线。
- 冷色（灰绿/海图青）只用于结构性状态：编号、标签、刻度端点；不用于可点击焦点。
- 禁止紫色、蓝紫渐变、霓虹色、彩色阴影。
- 状态不能只靠颜色：必须同时有文字、形状、下划线或位置变化。
- 正文对比度不低于 4.5:1；小号标签不低于 4.5:1。

### 12.4 版式与图纸感

- 字段行固定三列：标签 / 控件 / 读数；长标签上下排。
- 组间距 20px，行间距 8px；组间距必须大于行间距。
- 每组只画一条发丝线，禁止嵌套边框。
- 同一抽屉内所有标签共用一条左边缘；控件起点一致；读数右对齐。
- 允许非对称：左侧编号栏、右侧读数、底部账本；禁止全部居中。
- 画面标注必须用引线 + 圆点 + 编号；禁止把说明文字做成悬浮卡片。
- 设计交付物按工程图纸排版：图号、修订、比例、日期、色板、裁切标记。
- 顶栏 3px 双线只出现一次；抽屉展开线为单线；两者不混用。

### 12.5 文案

- 标签一律微型大写或短中文，不加句号；说明文字才用完整句子。
- 每个控件必须带单位、范围或读数；不允许“强度”这种无单位裸词。
- 禁止“智能”“一键”“极致”“丝滑”“焕新”“✨”等营销词。
- 禁止感叹号、表情符号、装饰性分隔符堆叠。
- 中英混排时英文用等宽或大写标签，中文用正文；不把英文全大写塞进中文句子。
- 错误文案写“原因 + 下一步”，不写“出错了”。
- 命令名用动词或对象：`光源距离 +0.5`、`切换渲染通道`，不用“设置”。

### 12.6 组件形态

- 滑杆：细轨道 + 竖线/菱形/十字游标 + 刻度 + 读数窗；不是原生 `input[type=range]`。
- 档位：连体单元格 + 滑动指示条；不是胶囊按钮组。
- 开关：方形按键 + LED + 「开 / 关」；不是 iOS 开关。
- 抽屉：编号 + 标题 + 读数 + 发丝线；展开只留一条页边竖线。
- 账本：五等分、标签 + 等宽读数；不是卡片。
- 浮层：实底 + 1px 边框 + 搜索框 + 行式结果；不是圆角弹窗。
- 边轨：24px 竖向编号条；不是悬浮按钮堆。

### 12.7 动效

- 动效只允许出现在：按下、悬停、选中、展开/收起、布局变化、回声出现/消失。
- 禁止：入场动画、逐项延迟、视差、缩放、弹跳、旋转、自动滚动、闪烁。
- 命令索引与键位账本 0ms 出现；搜索延迟会直接毁掉“本地工具”的感觉。
- 任何过渡 > 320ms 视为装饰，删除。
- 减少动态效果时全部瞬时，功能不变。

### 12.8 自动检查

提交前在项目根目录执行：

```powershell
# 系统字体与通用默认栈
Select-String -Path ui-system\*.css,ui-system\candidates\*\*.css `
  -Pattern "system-ui|PingFang|Segoe UI|Inter|Roboto|SF Pro|JetBrains|Consolas"

# 渐变、毛玻璃、外阴影、胶囊圆角
Select-String -Path ui-system\*.css,ui-system\candidates\*\*.css `
  -Pattern "linear-gradient|radial-gradient|backdrop-filter|border-radius:\s*999|box-shadow:\s*0"

# 超长过渡
Select-String -Path ui-system\*.css,ui-system\candidates\*\*.css `
  -Pattern "transition:[^;]*([4-9][0-9]{2}|[1-9][0-9]{3})ms"
```

- `box-shadow: inset` 允许，作为 1–2px 色条；`box-shadow: 0 ...` 一律视为外阴影。
- 命中任何一条都要人工确认；不能因为“只有一处”就放过。

### 12.9 人工审查

1. 在 1280px 与 900px 两个宽度打开页面。
2. 逐条对照 12.1 的禁令表，任何一条命中即重做。
3. 检查三种字号角色是否同时存在，读数是否等宽对齐。
4. 检查组间距是否明显大于行间距，标签左边缘是否统一。
5. 只用键盘走一遍：Tab、方向键、`Ctrl+K`、`?`、`Esc`、`F`。
6. 开启“减少动态效果”，确认没有功能依赖动画。
7. 截图后遮住颜色，只看线框；如果仍像通用后台卡片，就重做版式。

## 13. 参考与借鉴

### 13.1 视频

- 设置页排版（标签/控件对齐、去外框、分组层次、抽屉指示条、悬停意图）：
  `https://v.douyin.com/4HIxn1Hw89w/`
  完整页：`https://www.douyin.com/video/7702873595030113576`
- WebGL 海景（菲涅耳、地平线同色雾、构建阶段切换、曝光 + ACES）：
  `https://v.douyin.com/JnCsJJJcGmw/`
  完整页：`https://www.douyin.com/video/7696700243950619554`
- 同系列可顺带看：
  第 3 集界面细节 `https://www.douyin.com/video/7699104647889423667`
  第 4 集侧边栏 `https://www.douyin.com/video/7700517123486944548`
  第 6 集去 AI 味 `https://www.douyin.com/video/7703624707744091446`

### 13.2 开源项目

- `https://github.com/hundredrabbits/Orca`：网格化、等宽字、无卡片的 livecoding 界面；借“网格 + 键盘优先”。
- `https://github.com/monome/norns`：硬件仪表面板、参数行、状态读数；借“仪表行 + 极简层级”。
- `https://github.com/aristocratos/btop`：高密度仪表、键位提示、资源读数；借“账本式状态栏”。
- `https://github.com/holooooo/mechanics-breakdown`：交互式机制拆解、构建阶段切换；借“PASS 档位”的演示方式。
- `https://github.com/mrdoob/three.js`：阴影贴图可视化、PCSS、海洋示例；借渲染调试档位的组织，不引入 three.js。
- `https://github.com/JoeyDeVries/LearnOpenGL`：阴影、法线、立方体贴图、帧缓冲；借公式与章节结构。
- `https://github.com/greggman/webgl-fundamentals`：WebGL2 / GLSL ES 3.00 基础。

### 13.3 借用与边界

借用：

- 标签与控件严格对齐、长标签上下排、组间距大于行间距、左边缘统一。
- 抽屉指示条组内滑动、跨组切换用颜色而不是位移动画。
- 边轨悬停 120ms 意图延迟；按下即固定。
- 命令索引、键位账本、按键回声三件套，控制学习成本。
- `PASS` 档位把五个特效拆开演示；曝光 + ACES 放在最终合成。

不借用：

- 用阴影代替边框；本系统只有发丝线与 `inset` 色条。
- 装饰性入场、渐变、彩色徽章、悬浮说明卡。
- Bloom、暗角；超出 HW3 光栅化管线范围。
- 直接复制他人代码；只借结构与交互方式，着色器与命令实现自己写。

补充：程序化地形与体积云是在需求方明确要求后自行实现的全屏射线步进背景（`shaders/terrain.frag`），不属于从视频借用的内容；它们只作为场景背景，不改变 HW3 的阴影、反射、凹凸、雾效与 PCF 主流程。

链接统一维护在本节；计划书与 README 只引用本节，不再散落。动效实现的具体来源与授权见 11.10 与 `CREDITS.md`，本节只保留设计与交互参考。

## 14. 代码规范

### 14.1 总则

本规范与第 4.1 节版式硬规则、第 11 节交互规范同级。任何一条不满足，不进入提交。

1. **可修改性优先于“写得短”**：禁止一行塞入多个副作用、禁止靠隐式类型转换取巧。
2. **配置与实现分离**：颜色、字号、间距、时长、键位、文案全部来自 token 或 schema；实现里不出现第二套数字。
3. **出现第二次就评估，第三次必须抽象**：重复的 DOM 结构、事件绑定、测量逻辑，要么进工厂，要么进工具函数。
4. **单一事实来源**：状态只存 store；命令只登记一次；时长只写 token；DOM 只作为输出。
5. **不引入运行时依赖**：能用原生 API 写清楚的不引库；确需引库时本地打包、固定版本、记录许可证，禁止 CDN。
6. **借用优先**：先找成熟实现，再写自己的；抄结构要标注，抄代码要授权，禁止“凭印象重写”。
7. **禁止全局泄漏**：只允许 `window.UI` 一个入口；模块内部变量不得挂到 `window`。
8. **禁止危险写法**：`eval`、`new Function`、内联事件属性、把用户输入拼进 `innerHTML`。
9. **禁止装饰性代码**：未使用的导出、注释掉的旧实现、`console.log`、`debugger`、`setInterval` 动画。
10. **注释解释“为什么”**：不解释“这行在赋值”；借用代码必须写来源、许可证与改动点。

### 14.2 分层与边界

| 层 | 文件 | 职责 | 允许依赖 |
| --- | --- | --- | --- |
| 结构层 | `base.css` | 布局网格、组件骨架、`@font-face`、基础 token | 无 |
| 主题层 | `system.css` | V2 token、组件形态覆盖 | `base.css` |
| 行为层 | `system.js` | store、事件、命令、组件注册、动效、浮层 | 无框架 |
| 页面层 | `preview.js`、`commands.js`、`ui.js` | 命令与 schema、WebGL 桥接 | `UI.*` 公共 API |
| 渲染层 | `实验/3/3/` | WebGL2、着色器、场景 | 页面层传入的 store |

规则：

- 页面只调用 `UI.*`，不读取 `system.js` 内部变量，不复制其私有函数。
- 新面板行类型必须走 `UI.register(type, factory)`；禁止改 `buildRow` 的 `if/else`。
- 新命令必须走 `UI.registerCommand`；重复键与浏览器保留键在注册时抛错，不静默覆盖。
- 新时长必须先加 CSS token，再由 `UI.motion` 读取；禁止在 JS 里写 `1400`、`600`、`120`。
- 新颜色、字号、间距只加 token；页面 CSS 不写裸色值。
- 设计线稿是静态交付物，允许直接写 markup；运行页面不允许复制整套面板结构。

### 14.3 命名与类型

- 文件：`kebab-case`；CSS：`ui-block__element`、状态用 `data-*`；JS：`camelCase`；常量：`UPPER_SNAKE`。
- 布尔值用 `is/has/can/should` 开头；事件处理用 `onX`；工厂用 `createX`；测量用 `measureX`。
- 禁止无意义缩写，除 `ui`、`id`、`dom`、`ctx`、`el`。
- 公共 API、非显然函数、借用代码必须写 JSDoc；命令与行 schema 用 `@typedef` 描述字段。
- 新文件使用 `const/let`；`system.js` 的存量 `var` 不局部替换，避免同一函数出现两种声明风格，整体迁移时一次处理。
- CSS 自定义属性统一 `--ui-*`；JS 只读写 token 与测量变量，不写任意字符串键。

### 14.4 状态与事件

- 所有可调参数进 store；DOM 的 `data-*` 只是渲染结果，不作为第二状态源。
- 所有事件监听必须有所有者：全局监听用 `AbortController`，组件监听随组件销毁。
- 所有定时器必须有名字、有清理路径；禁止匿名嵌套 `setTimeout` 层层叠加。
- 所有跨模块通信走 `UI.on('layout' | 'command', fn)`，返回取消函数；不直接调用对方的内部函数。
- 错误只在外边界处理：`localStorage`、`setPointerCapture`、`fetch`、WebGL 编译；内部函数不做无意义 try/catch。
- 异步流程必须有失效保护：页面销毁后，字体加载、动画回调、定时器不得继续写 DOM。

### 14.5 组件契约

- `UI.register(type, factory)` 的工厂返回一个 DOM 节点；第二个参数是 `{ store, buildRow, h, $, $$, motion }`，不要自己抓 `document`。
- 节点必须带 `data-bind`、`data-ui`、`data-command` 中适用的契约。
- 组件必须同时支持指针与键盘；滑杆、档位、开关、浮层的 ARIA 角色固定，不按页面改写。
- 组件必须尊重 `prefers-reduced-motion`；不能出现“只有动画结束才可用”的逻辑。
- 组件内部查询使用 `$` / `$$` 并限定在组件根节点；禁止 `document.querySelector` 到处抓。
- 内联样式只允许写测量型 CSS 变量（`--ui-gauge-pos`、`--ui-bank-x/--ui-bank-w`）；其余样式回到样式表。
- 不在渲染循环里读取布局；测量集中在 `requestAnimationFrame`，一帧只读一次。

### 14.6 借鉴与授权

借用流程：

1. 先搜原生 API、MDN、web.dev、GitHub 上的成熟实现；记录候选链接。
2. 确认许可证；没有许可证的代码视为不可用。
3. 只取最小机制，不整库复制；优先重写为项目自己的 token 与工厂结构。
4. 在代码头部写来源、许可证、改动点；在 `CREDITS.md` 登记。
5. 用浏览器与 `check.ps1` 验证；不通过不合并。
6. 如果借用的实现需要额外依赖，先证明原生实现不可行，再本地打包。

许可证边界：

| 许可证 | 是否可用 | 处理 |
| --- | --- | --- |
| MIT / ISC / BSD-2 / BSD-3 | 可用 | 保留版权声明，写入 `CREDITS.md` |
| Apache-2.0 | 可用 | 保留 NOTICE，标注修改文件 |
| CC BY 4.0（文章/模式） | 可用 | 标注作者、链接、改动 |
| GPL / AGPL | 不可用 | 不复制进本仓库 |
| 无许可证 / 来源不明 | 不可用 | 重新实现或放弃 |
| Stack Overflow 代码 | 谨慎 | CC BY-SA 4.0，避免直接复制，按思路重写 |

约束：

- 禁止把“看过”写成“自己写的”；结构借用也要标注。
- 禁止只改变量名就当作原创；必须适配本项目 token、事件与生命周期。
- 禁止引入 CDN 字体、CDN 脚本、在线图标库。
- 禁止为了“以后可能用到”提前引入库；扩展点用注册表与 token，不用依赖。

### 14.7 自动检查

提交前执行：

```powershell
node --check ui-system\system.js
powershell -ExecutionPolicy Bypass -File ui-system\scripts\check.ps1
git diff --check
```

`check.ps1` 至少检查：

- 系统字体栈：`system-ui`、`PingFang`、`Segoe UI`、`Inter`、`Roboto`。
- 渐变、毛玻璃、外阴影、`border-radius: 999`。
- `!important`（`prefers-reduced-motion` 块除外，需人工确认）。
- `innerHTML`、`eval`、`new Function`、内联 `onclick=`。
- `setInterval`、`console.log`、`debugger`。
- JS 中硬编码的 3–4 位毫秒数（应改为 token）。

检查脚本只做第一道过滤；命中项必须人工确认，不能因为“只有一处”放过。

### 14.8 人工审查

1. 新功能是否通过注册表、token、工具函数实现，而不是改 `buildRow` 或复制结构？
2. 是否出现第二套颜色、字号、间距、时长？
3. 是否所有监听器、定时器、观察者都有清理路径？
4. 是否只用键盘就能完成同样操作？焦点环是否可见？
5. 开启“减少动态效果”后，功能是否仍然完整？
6. 1280px 与 900px 下是否重叠、溢出、横向滚动？
7. 控制台是否无错误、无警告、无 `console.log`？
8. 借用代码是否写明来源、许可证、改动点，并登记到 `CREDITS.md`？

### 14.9 代码验收

- [ ] 没有修改 `buildRow` 的 `if/else` 来加新组件。
- [ ] 没有硬编码时长、色值、字号、间距。
- [ ] 没有重复的面板 markup 或重复的事件绑定。
- [ ] 新组件已注册、已写 JSDoc、已覆盖键盘与 reduced-motion。
- [ ] 借用代码有来源注释与 `CREDITS.md` 记录。
- [ ] `node --check` 与 `check.ps1` 通过。
- [ ] 浏览器控制台无错误，交互复验通过。

### 14.10 图纸层

设计线稿不是第二个设计系统，而是同一套规范下的工程图纸。

- `ui-system/sheet.css` 只定义图框、裁切标记、图签、分栏、规范表与状态线框；业务控件形态仍由 `system.css` 提供，线稿里出现的输入、档位、开关必须是实机同款。
- 每张线稿一个 `设计线稿.html`：主界面放在仓库根目录，实验放在 `实验/<n>/设计线稿.html`。页面内只用 `@layer sheet` 与 `@layer plate`，不新增色值、字号、时长。
- 图纸按 1:1 出图，图内 UI 文字不小于 9px（与实机 9–11px 对得上）；只有绘图标注（尺寸、编号、视口尺寸）允许 8px。
- 一张线稿至少四件：屏幕定稿（1:1）、版式网格、控件/状态解剖、与实机的取舍对照。
- `check.ps1` 覆盖 `ui-system/` 全部文件、`实验/3` 的页面与脚本，以及深度 ≤3 的 HTML（三张线稿）；脚本只管禁词与禁用写法，版面质量仍需人眼过一遍。
