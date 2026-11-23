# 字体

全部字体本地打包，SIL OFL 1.1，无 CDN。页面只通过 `base.css` 的 `@font-face` 引用本目录。

IBM Plex Mono 与 Noto Sans SC（思源黑体）已移除：前者换成更窄、更技术化的 Iosevka，后者不再提供黑体回退，中文正文与标签统一由霞鹜文楷承担。

## 文件

| 文件 | 字族 | 权重 / 轴 | 大小 | 用途 |
| --- | --- | --- | --- | --- |
| `spectral-400.woff2` | Spectral | 400 | 15 KB | 档案标题、账本标签 |
| `spectral-600.woff2` | Spectral | 600 | 16 KB | 需要强调的标题 |
| `plex-sans-var.woff2` | IBM Plex Sans | wght 100–700, wdth 75–100 | 101 KB | 拉丁正文、字段标签 |
| `iosevka-400.woff2` | Iosevka | 400 | 37 KB | 读数、键位 |
| `iosevka-500.woff2` | Iosevka | 500 | 37 KB | 强调读数 |
| `noto-serif-sc-var.woff2` | Noto Serif SC | wght 200–900 | 368 KB | 20px 以上中文大标题 |
| `lxgw-wenkai-regular.woff2` | LXGW WenKai | 400 | 240 KB | 中文正文、长说明 |
| `lxgw-wenkai-medium.woff2` | LXGW WenKai | 500 | 241 KB | 中文短标题、微型标签 |

合计约 1.03 MB。`OFL.txt` 为五个字族的授权原文。

## 来源

- Spectral：`https://github.com/google/fonts/tree/main/ofl/spectral`
- IBM Plex Sans：`https://github.com/google/fonts/tree/main/ofl/ibmplexsans`
- Iosevka：`https://github.com/be5invis/Iosevka`（由 `@fontsource/iosevka@5.3.0` 的 latin-400/500 woff2 子集化）
- Noto Serif SC：`https://github.com/google/fonts/tree/main/ofl/notoserifsc`
- LXGW WenKai：`https://github.com/lxgw/LxgwWenKai/releases/tag/v1.520`（Regular / Medium TTF）

授权：SIL Open Font License 1.1。保留 `OFL.txt` 即可随项目分发。

## 子集与再生成

拉丁字体保留 ASCII、Latin-1、希腊字母、常用标点与数学/箭头符号：

```text
U+0020-007E,U+00A0-00FF,U+0370-03FF,U+2000-206F,
U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF
```

中文字体按实际渲染页面用字子集化，当前 945 个用字（覆盖界面文案、候选预览、设计线稿与根目录导航）；`design.md`、`README.md` 等文档不计入子集。新增中文文案后：

1. 从实际渲染文件提取用字（不包含 `design.md`、`README.md` 等文档）：

```powershell
$files = Get-ChildItem -Path "." -Recurse -Include *.html,*.js,*.css |
  Where-Object { $_.FullName -notmatch '\\fonts\\' -and $_.FullName -notmatch '\\HW3_todo\\' }
$text = ($files | ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName }) -join "`n"
$chars = [regex]::Matches($text, '[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]') |
  ForEach-Object { $_.Value } | Sort-Object -Unique
($chars -join '') | Set-Content -Path cjk.txt -Encoding utf8
```

2. 用同一份 `cjk.txt` 生成三套中文字体：

```powershell
python -m pip install fonttools brotli

python -m fontTools.subset NotoSerifSC-VF.ttf `
  --text-file=cjk.txt `
  --unicodes="U+0020-007E,U+00A0-00FF,U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF" `
  --flavor=woff2 --output-file=noto-serif-sc-var.woff2 --no-hinting

python -m fontTools.subset LXGWWenKai-Regular.ttf `
  --text-file=cjk.txt `
  --unicodes="U+0020-007E,U+00A0-00FF,U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF" `
  --flavor=woff2 --output-file=lxgw-wenkai-regular.woff2 --no-hinting

python -m fontTools.subset LXGWWenKai-Medium.ttf `
  --text-file=cjk.txt `
  --unicodes="U+0020-007E,U+00A0-00FF,U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF" `
  --flavor=woff2 --output-file=lxgw-wenkai-medium.woff2 --no-hinting
```

3. 拉丁等宽字体从 Iosevka 发布包取 TTF，或从 `@fontsource/iosevka` 的 `latin-400/500-normal.woff2` 再子集化：

```powershell
python -m fontTools.subset iosevka-latin-400-normal.woff2 `
  --unicodes="U+0020-007E,U+00A0-00FF,U+0370-03FF,U+2000-206F,U+20A0-20BF,U+2100-214F,U+2190-21FF,U+2200-22FF" `
  --flavor=woff2 --output-file=iosevka-400.woff2 --no-hinting
```

4. 刷新页面，确认新文案没有落到通用 `serif` / `sans-serif` 回退；字体加载后的 Network、CLS、长任务与指示条补测步骤见 `design.md` 11.10.8。

## 使用规则

- 不在页面里写 `system-ui`、`PingFang SC`、`Segoe UI`、`Inter`、`Roboto` 等系统或通用默认栈。
- 不再使用 IBM Plex Mono 与 Noto Sans SC；`--ui-font-body` 与 `--ui-font-mono` 的中文回退都指向 LXGW WenKai，禁止再添加黑体回退。
- 字族只通过 `--ui-font-display`、`--ui-font-body`、`--ui-font-mono`、`--ui-font-label` 四个 token 使用。
- `--ui-font-label`（霞鹜文楷 500）只排短中文标签与短标题；正文、说明与命令索引用 `--ui-font-body` 中的 WenKai 400，读数与键位继续用 `--ui-font-mono`（Iosevka）。
- 读数统一 `font-variant-numeric: tabular-nums`；`body` 已设 `font-synthesis: none`，不允许伪粗体。
- 新增字重时，优先使用可变字体现有轴，不额外增加静态文件。
