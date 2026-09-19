# 计算机图形学实验作业

四川大学 计算机图形学课程实验作业集合。

## 在线体验

已通过 GitHub Pages 部署，可直接在浏览器中访问：

**https://lunchinm.github.io/CG-Labs/**

## 项目结构

```
计算机图形学/
├── index.html              # 网站导航基页（GitHub Pages 入口）
├── README.md               # 本文件
├── 实验/
│   └── 1/                  # 实验一
│       ├── 1/              # 实验一 完成代码
│       │   ├── hw1.html    # 主页面
│       │   ├── hw1.js      # 主程序（WebGL 逻辑）
│       │   ├── README.md   # 实验一说明
│       │   ├── shaders/    # GLSL 着色器
│       │   │   ├── hw1.vert
│       │   │   └── hw1.frag
│       │   └── Common/     # WebGL 支持库
│       │       ├── webgl-utils.js
│       │       ├── initShaders2.js
│       │       └── MVnew.js
│       └── HW1_todo/       # 作业要求与模板
└── 课件/                    # 课程课件
```

## 本地运行

由于 WebGL 着色器通过 AJAX 加载，需通过 HTTP 服务器访问（不能直接双击打开 HTML 文件）：

```bash
# 在项目根目录下启动 Python 内置服务器
python -m http.server 8000
```

然后浏览器访问 `http://localhost:8000/` 即可。
