#!/usr/bin/env python3
"""视觉回归矩阵：固定机位与参数的十张截图，用来对比“改前 / 改后”。

用法（在 实验/3/3/tools 目录下，或给绝对路径）：

    python visual-guard.py baseline     # 把当前状态存成基线
    python visual-guard.py check        # 重新出图并与基线对比
    python visual-guard.py check --update   # 对比后把当前状态写回基线

依赖：Playwright（本机 miniconda 已装）+ 本机 HTTP 服务
（工作区根目录 `python -m http.server 8123`）。

为什么要有这个脚本：上一轮反复“修好一个坏另一个”，是因为每次只凭一张图
判断结果。这里把十个固定 case 落盘并逐像素比对，任何一次改动的影响面都能
立刻看出来，而不是靠回忆。
"""

import json
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASELINE = os.path.join(HERE, "baseline")
CURRENT = os.path.join(HERE, "current")

RESET = "UI.store.patch(SCENE_DEFAULTS)"

# 界面状态会写进 localStorage 并在刷新后恢复：布局（顶栏 / 参数面板 / 状态栏的收展）
# 与首次引导的“已读”标记。拍了“面板收起”“引导已关”这类图之后，后面的图会继承那个状态，
# 所以需要干净界面的图先清掉这两项再重载（shots.json 里写 "fresh": true）。
STORAGE_RESET = (
    "window.localStorage.removeItem('ui-system/layout/v1:' + window.location.pathname);"
    "window.localStorage.removeItem('hw3/guide/v1');"
)

# 差异阈值：RMS 低于 0.006 视为“没动过”，变化像素超过 1% 才算“动过”。
RMS_SAME = 0.006
CHANGED_RATIO = 0.01


def load_matrix():
    with open(os.path.join(HERE, "matrix.json"), "r", encoding="utf-8") as handle:
        return json.load(handle)


def capture(target, update):
    matrix = load_matrix()
    os.makedirs(target, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--use-gl=angle",
                "--ignore-gpu-blocklist",
            ],
        )
        width, height = matrix["viewport"]
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(matrix["url"], wait_until="load", timeout=60000)
        page.wait_for_timeout(4000)

        for case in matrix["cases"]:
            page.evaluate(RESET)
            state = case.get("state") or {}
            if state:
                page.evaluate(
                    "(state) => UI.store.patch(state)",
                    state,
                )
            page.wait_for_timeout(1600)
            page.screenshot(path=os.path.join(target, case["id"] + ".png"))

        if errors:
            print("PAGE ERROR:")
            for message in errors:
                print("  " + message)
        browser.close()

    return matrix


def stats(path):
    """返回 (meanLuma, 像素数组)；不引入 numpy，十张图足够快。"""
    from PIL import Image

    with Image.open(path) as image:
        pixels = list(image.convert("RGB").getdata())
    total = 0
    for r, g, b in pixels:
        total += 0.299 * r + 0.587 * g + 0.114 * b
    return total / max(1, len(pixels)), pixels


def compare(matrix):
    rows = []
    for case in matrix["cases"]:
        case_id = case["id"]
        base_path = os.path.join(BASELINE, case_id + ".png")
        current_path = os.path.join(CURRENT, case_id + ".png")
        if not os.path.exists(base_path):
            rows.append((case_id, "无基线", "-", "-"))
            continue

        _, base_pixels = stats(base_path)
        _, cur_pixels = stats(current_path)
        if len(base_pixels) != len(cur_pixels):
            rows.append((case_id, "尺寸不同", "-", "-"))
            continue

        square = 0
        changed = 0
        for (br, bg, bb), (cr, cg, cb) in zip(base_pixels, cur_pixels):
            dr, dg, db = cr - br, cg - bg, cb - bb
            square += dr * dr + dg * dg + db * db
            if max(abs(dr), abs(dg), abs(db)) > 6:
                changed += 1

        count = len(base_pixels) or 1
        rms = (square / (3.0 * count)) ** 0.5 / 255.0
        ratio = changed / count
        verdict = "一致" if (rms < RMS_SAME and ratio < CHANGED_RATIO) else "变化"
        rows.append((case_id, verdict, "%.4f" % rms, "%.2f%%" % (ratio * 100.0)))
    return rows


def probe_means(matrix, target):
    from PIL import Image

    lines = []
    for case in matrix["cases"]:
        probes = case.get("probes")
        if not probes:
            continue
        path = os.path.join(target, case["id"] + ".png")
        if not os.path.exists(path):
            continue
        with Image.open(path) as image:
            rgb = image.convert("RGB")
            parts = []
            for name, box in probes.items():
                region = rgb.crop((box[0], box[1], box[0] + box[2], box[1] + box[3]))
                pixels = list(region.getdata())
                mean = [sum(p[i] for p in pixels) / len(pixels) for i in range(3)]
                luma = 0.299 * mean[0] + 0.587 * mean[1] + 0.114 * mean[2]
                parts.append("%s %.1f" % (name, luma))
            lines.append("  %s: %s" % (case["id"], " · ".join(parts)))
    return lines


def deliver_shots(only=None):
    """重出交付截图：shots.json 描述文件名 → 场景参数，写进 ../screenshots。"""
    with open(os.path.join(HERE, "shots.json"), "r", encoding="utf-8") as handle:
        shots = json.load(handle)
    if only:
        shots = {name: shot for name, shot in shots.items() if name in only}
    matrix = load_matrix()
    target = os.path.join(HERE, "..", "screenshots")
    os.makedirs(target, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--use-gl=angle",
                "--ignore-gpu-blocklist",
            ],
        )
        width, height = matrix["viewport"]
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        page.goto(matrix["url"], wait_until="load", timeout=60000)
        page.wait_for_timeout(4000)

        for name, shot in shots.items():
            # 上一张图可能留下快捷键/命令索引浮层，先关掉再拍。
            page.keyboard.press("Escape")
            page.evaluate(RESET)
            # 需要“干净界面”的图先清掉布局记忆并重载，避免继承上一张图的收展状态。
            if shot.get("fresh"):
                page.evaluate(STORAGE_RESET)
                page.reload(wait_until="load", timeout=60000)
                page.wait_for_timeout(4000)
            # 允许单张图改窗口尺寸（例如窄屏验收），默认回到矩阵统一视口。
            viewport = shot.get("viewport") or [width, height]
            page.set_viewport_size({"width": viewport[0], "height": viewport[1]})
            state = shot.get("state") or {}
            if state:
                page.evaluate("(state) => UI.store.patch(state)", state)
            if shot.get("js"):
                page.evaluate(shot["js"])
            page.wait_for_timeout(1800)
            # SwiftShader 下环境立方体贴图的捕捉帧可能超过 30 s，放宽截图超时。
            page.screenshot(path=os.path.join(target, name + ".png"), timeout=120000)
            print("SHOT %s  %s" % (name, shot.get("note", "")))
        browser.close()


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "check"
    update = "--update" in sys.argv

    if mode == "shots":
        only = None
        if "--only" in sys.argv:
            index = sys.argv.index("--only") + 1
            only = set(sys.argv[index].split(","))
        deliver_shots(only)
        return 0

    if mode == "baseline":
        matrix = capture(BASELINE, True)
        print("基线已写入：%s（%d 张）" % (BASELINE, len(matrix["cases"])))
        for line in probe_means(matrix, BASELINE):
            print(line)
        return 0

    if mode != "check":
        print("用法：python visual-guard.py [baseline|check] [--update]")
        return 2

    if not os.path.isdir(BASELINE):
        print("还没有基线，先跑：python visual-guard.py baseline")
        return 2

    matrix = capture(CURRENT, update)
    print("对比基线：")
    print("  %-16s %-8s %-8s %s" % ("case", "结论", "RMS", "变化像素"))
    for case_id, verdict, rms, ratio in compare(matrix):
        print("  %-16s %-8s %-8s %s" % (case_id, verdict, rms, ratio))

    print("探针亮度：")
    for line in probe_means(matrix, CURRENT):
        print(line)

    if update:
        import shutil

        for case in matrix["cases"]:
            name = case["id"] + ".png"
            shutil.copyfile(os.path.join(CURRENT, name), os.path.join(BASELINE, name))
        print("基线已更新为当前状态。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())