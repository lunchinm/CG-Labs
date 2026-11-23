# 来源与授权 / Credits

本文件记录 `ui-system` 与 `实验/3` 中借用的模式、代码与参考链接。原则：只借机制，不整库复制；代码必须可追溯，许可证必须兼容。

## 运行时代码

当前没有引入任何第三方运行时依赖。以下项目只作为 API 与实现参考，实际代码为原生重写：

| 项目 | 许可证 | 用途 | 改动 |
| --- | --- | --- | --- |
| [Motion](https://github.com/motiondivision/motion) | MIT | WAAPI 封装、动效 API 设计参考 | 未复制代码；`UI.motion.animate` 为原生 WAAPI 薄封装 |
| [Anime.js](https://github.com/juliangarnier/anime) | MIT | 时间轴、交错与缓动命名参考 | 未复制代码；本项目禁止交错入场与弹性动画 |
| [GoogleChromeLabs/ui-element-samples](https://github.com/GoogleChromeLabs/ui-element-samples) | Apache-2.0 | FLIP 与 UI 元素示例参考 | 未复制代码；FLIP 按文章思路重写 |

## 交互模式

| 来源 | 许可证 | 借用的内容 | 改动 |
| --- | --- | --- | --- |
| [Animation Patterns: Grid Row Accordion](https://animationpatterns.art/animations/grid-row-accordion-expand/) | CC BY 4.0 | `grid-template-rows: 0fr → 1fr` 的展开模式 | 改为本项目 token、`visibility` 延迟与焦点管理 |
| [Paul Lewis: FLIP Your Animations](https://aerotwist.com/blog/flip-your-animations/) | 文章参考 | First / Last / Invert / Play 顺序 | 改写为 `UI.motion.flip`，只用于容器与图片 |
| [CSS-Tricks: Animating Layouts with the FLIP Technique](https://css-tricks.com/animating-layouts-with-the-flip-technique/) | 文章参考 | FLIP 的 `getBoundingClientRect` + `transform` 做法 | 加入 reduced-motion 与空尺寸保护 |
| [MDN: Using the Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API) | 文档参考 | `element.animate()`、`cancel()`、`reverse()` | 只取 API 用法，未复制示例代码 |
| [MDN: ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) | 文档参考 | 监听档位宽度变化 | 与 `requestAnimationFrame` 合并，一帧只测量一次 |
| [web.dev: prefers-reduced-motion](https://web.dev/prefers-reduced-motion/) | CC BY 4.0 | 减少动态效果的 CSS 与 `matchMedia` 策略 | CSS 全局降级 + `UI.motion` 时长归零 |

## 界面结构参考

以下项目只用于交互结构与排版语言参考，未复制代码：

| 项目 | 许可证 | 参考点 |
| --- | --- | --- |
| [hundredrabbits/Orca](https://github.com/hundredrabbits/Orca) | MIT | 键盘优先、单键预算、网格化操作 |
| [monome/norns](https://github.com/monome/norns) | GPL-3.0 | 参数行、页边注、硬件式读数；仅参考，不复制 |
| [aristocratos/btop](https://github.com/aristocratos/btop) | Apache-2.0 | 仪表架分组、状态账本、密度控制 |
| [mechanics-breakdown](https://github.com/holooooo/mechanics-breakdown) | MIT | 场景机制拆解、分阶段演示与 PASS 档位 |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT | WebGL 场景组织与渲染循环 |
| [JoeyDeVries/LearnOpenGL](https://learnopengl.com/) | CC BY-NC-SA 4.0 / 代码参考 | Phong、阴影、反射、透明排序的推导；不直接复制代码 |

## 视频与文章

- [抖音：交互界面拆解 1](https://v.douyin.com/4HIxn1Hw89w/)
- [抖音：交互界面拆解 2](https://v.douyin.com/JnCsJJJcGmw/)
- [B 站：FLIP 动画](https://www.bilibili.com/video/BV1MqbBzCEEA/)
- [YouTube：FLIP Animations 播放列表](https://m.youtube.com/playlist?list=PLWyLhWujYzKcyqtnw67zYcyzlSZpwEffU)

视频只借讲解思路，不复制画面、字幕或代码；具体实现仍以本文档第 11、14 节为准。

## 字体

Spectral、IBM Plex Sans、Noto Serif SC 来自 Google Fonts 仓库，SIL Open Font License 1.1；Iosevka 来自 `https://github.com/be5invis/Iosevka`，LXGW WenKai（霞鹜文楷）来自 `https://github.com/lxgw/LxgwWenKai`，同为 SIL Open Font License 1.1。IBM Plex Mono 与 Noto Sans SC 已移除，不再出现在字体链中。授权原文见 `fonts/OFL.txt`，子集生成方式见 `fonts/README.md`。

## 记录格式

新增借用时，在本文件追加一行，并在代码头部写：

```text
/* Adapted from: <URL> (<license>) — <what changed> */
```

没有来源、没有许可证、无法确认兼容性的代码，不进入本仓库。
