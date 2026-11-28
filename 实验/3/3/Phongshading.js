/*
 * Phongshading.js
 * 渲染主流程：WebGL2 初始化、资源与 VAO、光空间矩阵、阴影 Pass、主 Pass、交互。
 * 与模板相比的主要修改：
 *   1. 每个 program 使用独立 VAO，深度 Pass 不再依赖默认顶点属性状态；
 *   2. 尺寸与投影 aspect 取自 drawingBuffer，不再使用方形 letterbox；
 *   3. 背景改为全屏 raymarch 地形（fBm 高度场 + 水面 + 大气），不再加载六张天空盒；
 *   4. 光空间相机按 lightPosition.w 切换透视 / 正交；
 *   5. 深度贴图 2048，固定纹理单元 1；所有渲染请求用 rAF 合并；
 *   6. 背景先画到半分辨率 FBO，再放大合成，控制 raymarch 的像素成本。
 */

var canvas = null;
var gl = null;
var SHADER_VERSION = '?v=20261128h';

var programs = {};
var uniforms = {};
var buffers = {};
var vaos = {};
var textures = {};

var framebuffer = null;
var depthTexture = null;
var depthSize = MATERIAL_TUNING.depthTextureSize;

var sceneReady = false;
var renderQueued = false;
var dragMode = 0;
var lastPointerX = 0;
var lastPointerY = 0;

var SCENE = {
  // 中央展品：单一实体镜面方块，花卉纹理只作为镜面底色。
  // 比台座顶面高 1 cm：方块底边不与石面共面，避免底部的亮缝。
  cubeY: 0.35,
  // 两级石台座：上座顶面 -0.66，正好托住壳体底面。
  plinthTopHalf: 1.75,
  plinthTopY: -0.77,
  plinthTopHalfHeight: 0.11,
  plinthBaseHalf: 2.05,
  plinthBaseY: -0.94,
  plinthBaseHalfHeight: 0.06,
  floorHalf: 8.6,
  floorY: -1.0,
  stoneHalf: 9.3,
  stoneTop: -1.008,
  stoneBottom: -1.41,
  near: 0.1,
  far: 100.0,
  lampScale: 0.05,
  backgroundScale: 0.75
};

// ---------------------------------------------------------------- 初始化

function showFailure(message) {
  var fallback = document.getElementById('scene-fallback');
  if (!fallback) return;
  fallback.hidden = false;
  var detail = fallback.querySelector('[data-ui="fallback-message"]');
  if (detail) detail.textContent = message;
}

function initScene() {
  canvas = document.getElementById('canvas');
  if (!canvas) return;

  gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    showFailure('当前浏览器没有可用的 WebGL2 上下文，请更换浏览器或开启硬件加速。');
    return;
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearDepth(1.0);
  gl.clearColor(material.fogColor[0], material.fogColor[1], material.fogColor[2], 1.0);

  // 软件渲染（SwiftShader / Basic Render Driver / llvmpipe）下 1024 的
  // 六面捕捉本身就够慢，先把立方体贴图和环境贴图降一档再谈帧率。
  softwareRendering = detectSoftwareRendering();
  if (softwareRendering) {
    renderScale = RENDER_SCALE_MIN;
    environment.size = 512;
  }

  programs.main = createProgram('shaders/box.vert', 'shaders/box.frag');
  programs.depth = createProgram('shaders/depth.vert', 'shaders/depth.frag');
  programs.terrain = createProgram('shaders/terrain.vert', 'shaders/terrain.frag');
  programs.composite = createProgram('shaders/terrain.vert', 'shaders/composite.frag');
  programs.lamp = createProgram('shaders/lamp.vert', 'shaders/lamp.frag');
  programs.skybox = createProgram('shaders/skybox.vert', 'shaders/skybox.frag');

  if (!programs.main || !programs.depth || !programs.terrain || !programs.composite || !programs.lamp || !programs.skybox) {
    showFailure('着色器加载或链接失败，请查看控制台中的编译日志。');
    return;
  }

  cacheUniforms();
  buildGeometry();
  buildDepthTarget();
  buildBackgroundTarget();
  buildEnvironmentTarget();
  loadTextures();
  loadSkybox();

  resizeCanvas();
  bindInput();

  if (typeof window.ResizeObserver === 'function') {
    var observer = new window.ResizeObserver(function () {
      resizeCanvas();
      requestRender();
    });
    observer.observe(canvas.parentElement || canvas);
  }

  window.addEventListener('resize', function () {
    resizeCanvas();
    requestRender();
  });

  syncMaterialFromState(UI.store.get());
  UI.store.subscribe(function (state) {
    syncMaterialFromState(state);
    requestRender();
  });

  sceneReady = true;
  requestRender();
}

function createProgram(vertexPath, fragmentPath) {
  var program = initShaders(gl, vertexPath + SHADER_VERSION, fragmentPath + SHADER_VERSION);
  if (!program) return null;
  return program;
}

function cacheUniforms() {
  uniforms.main = cacheProgramUniforms(programs.main, [
    'u_ModelMatrix', 'u_ViewMatrix', 'u_ProjectionMatrix', 'u_LightSpaceMatrix',
    'viewPos', 'u_lightPosition',
    'ambientStrength', 'diffuseStrength', 'specularStrength', 'shininess', 'lightColor',
    'u_ambientColor', 'u_fogColor', 'u_baseTint',
    'u_envMix', 'u_opacity', 'u_bumpStrength', 'u_fogDensity', 'u_uvScale',
    'u_usePCF', 'u_enableShadow', 'u_enableBump', 'u_enableFog',
    'u_enableReflect', 'u_enableTransparent', 'u_materialType',
    'u_texelSize', 'u_exposure', 'u_pass', 'u_envCapture',
    'u_attenA', 'u_attenB', 'u_attenC',
    'u_plinth0Min', 'u_plinth0Max', 'u_plinth1Min', 'u_plinth1Max',
    'u_floorY', 'u_floorHalf', 'u_floorUvScale', 'u_stoneY', 'u_stoneHalf', 'u_waterY', 'u_cubeCenterY',
    'u_reflectFogScale', 'u_glassLayer',
    'u_waterReflect', 'u_enableWaterReflect',
    'diffuseTexture', 'depthTexture', 'normalTexture', 'envSampler',
    'u_woodTexture', 'u_stoneTexture'
  ]);

  uniforms.depth = cacheProgramUniforms(programs.depth, [
    'u_LightSpaceMatrix', 'u_ModelMatrix'
  ]);

  uniforms.terrain = cacheProgramUniforms(programs.terrain, [
    'u_eye', 'u_forward', 'u_right', 'u_up', 'u_tanHalfFov', 'u_aspect',
    'u_sunDir', 'u_lightColor', 'u_ambientColor', 'u_fogColor',
    'u_horizonColor', 'u_skyGlow', 'u_fogDensity', 'u_exposure',
    'envSampler', 'u_useEnv', 'u_envMode', 'u_time',
    'u_pass', 'u_enableShadow', 'u_enableFog',
    'u_waterReflect', 'u_enableWaterReflect'
  ]);

  uniforms.skybox = cacheProgramUniforms(programs.skybox, [
    'u_ModelMatrix', 'u_ViewMatrix', 'u_ProjectionMatrix',
    'u_exposure', 'u_envMode', 'u_skybox'
  ]);

  uniforms.composite = cacheProgramUniforms(programs.composite, [
    'u_background'
  ]);

  uniforms.lamp = cacheProgramUniforms(programs.lamp, [
    'u_ModelMatrix', 'u_ViewMatrix', 'u_ProjectionMatrix', 'lightColor'
  ]);
}

function cacheProgramUniforms(program, names) {
  var map = {};
  names.forEach(function (name) {
    map[name] = gl.getUniformLocation(program, name);
  });
  return map;
}

// ---------------------------------------------------------------- 几何与缓冲

var sceneObjects = [];

function buildGeometry() {
  // 方块用锐边立方体。圆角立方体在轮廓上留下一条 1 px 的斜法线带，反射到
  // 远处木地板就是一条暖色亮边，看上去像玻璃壳的边框；镜面不要那条边。
  var unit = Models.cube(1.0);
  var floor = Models.plane(SCENE.floorHalf, SCENE.floorY);
  var stone = Models.plane(SCENE.stoneHalf, SCENE.stoneTop);
  var screen = {
    positions: [
      -1.0, -1.0, 0.0, 1.0,
       1.0, -1.0, 0.0, 1.0,
       1.0,  1.0, 0.0, 1.0,
      -1.0, -1.0, 0.0, 1.0,
       1.0,  1.0, 0.0, 1.0,
      -1.0,  1.0, 0.0, 1.0
    ],
    count: 6
  };

  buffers.unit = uploadGeometry(unit);
  buffers.floor = uploadGeometry(floor);
  buffers.stone = uploadGeometry(stone);
  buffers.screen = { position: uploadBuffer(screen.positions), count: screen.count };

  vaos.main = {
    unit: createVAO(programs.main, buffers.unit, ['vPosition', 'vNormal', 'vTexCoord']),
    floor: createVAO(programs.main, buffers.floor, ['vPosition', 'vNormal', 'vTexCoord']),
    stone: createVAO(programs.main, buffers.stone, ['vPosition', 'vNormal', 'vTexCoord'])
  };
  vaos.depth = {
    unit: createVAO(programs.depth, buffers.unit, ['vPosition'])
  };
  vaos.terrain = createVAO(programs.terrain, buffers.screen, ['vPosition']);
  vaos.composite = createVAO(programs.composite, buffers.screen, ['vPosition']);
  vaos.lamp = createVAO(programs.lamp, buffers.unit, ['vPosition']);
  // 天空盒复用单位立方体的顶点：方向取物体空间坐标，缩放由模型矩阵给。
  vaos.skybox = createVAO(programs.skybox, buffers.unit, ['vPosition']);

  var skirtTop = SCENE.stoneTop - 0.012;
  var skirtHalf = (skirtTop - SCENE.stoneBottom) * 0.5;
  var skirtCenter = (skirtTop + SCENE.stoneBottom) * 0.5;

  // 物体表：主 Pass 与阴影 Pass 都从这里取几何、矩阵与作用范围。
  // materialType 0 实体镜面方块 / 1 木台 / 2 石材；cubeShadow 只是阴影替身。
  sceneObjects = [
    {
      name: 'woodFloor', vao: 'floor', count: buffers.floor.count, model: mat4(),
      materialType: 1, texture: 'floor', normal: 'normal',
      uv: MATERIAL_TUNING.uvScaleFloor, castsShadow: false
    },
    {
      name: 'stoneRim', vao: 'stone', count: buffers.stone.count, model: mat4(),
      materialType: 2, texture: 'stone', normal: 'stoneNormal',
      uv: MATERIAL_TUNING.uvScaleStone, castsShadow: false
    },
    {
      name: 'skirt', vao: 'unit', count: buffers.unit.count,
      model: mult(
        translate(0.0, skirtCenter, 0.0),
        scale(SCENE.stoneHalf, skirtHalf, SCENE.stoneHalf)
      ),
      materialType: 2, texture: 'stone', normal: 'stoneNormal',
      uv: 6.0, castsShadow: false
    },
    {
      name: 'plinthTop', vao: 'unit', count: buffers.unit.count,
      model: mult(
        translate(0.0, SCENE.plinthTopY, 0.0),
        scale(SCENE.plinthTopHalf, SCENE.plinthTopHalfHeight, SCENE.plinthTopHalf)
      ),
      materialType: 2, texture: 'stone', normal: 'stoneNormal',
      uv: 2.5, castsShadow: true, envCapture: false
    },
    {
      name: 'plinthBase', vao: 'unit', count: buffers.unit.count,
      model: mult(
        translate(0.0, SCENE.plinthBaseY, 0.0),
        scale(SCENE.plinthBaseHalf, SCENE.plinthBaseHalfHeight, SCENE.plinthBaseHalf)
      ),
      materialType: 2, texture: 'stone', normal: 'stoneNormal',
      uv: 3.0, castsShadow: true, envCapture: false
    },
    {
      name: 'cubeShadow', vao: 'unit', count: buffers.unit.count,
      model: translate(0.0, SCENE.cubeY, 0.0),
      materialType: 0, texture: 'cube', normal: null,
      uv: 1.0, castsShadow: true, layer: 'shadow'
    },
    {
      name: 'solidCube', vao: 'unit', count: buffers.unit.count,
      model: translate(0.0, SCENE.cubeY, 0.0),
      materialType: 0, texture: 'cube', normal: null,
      uv: MATERIAL_TUNING.uvScaleCube, castsShadow: false, layer: 'cube', envCapture: false
    }
  ];
}

function uploadGeometry(data) {
  return {
    position: uploadBuffer(data.positions),
    normal: uploadBuffer(data.normals),
    texCoord: uploadBuffer(data.texCoords),
    count: data.count
  };
}

function uploadBuffer(values) {
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buffer;
}

function createVAO(program, set, attributes) {
  var sizes = { vPosition: 4, vNormal: 4, vTexCoord: 2 };
  var vao = gl.createVertexArray();

  gl.bindVertexArray(vao);
  attributes.forEach(function (name) {
    var location = gl.getAttribLocation(program, name);
    if (location < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, set[name === 'vPosition' ? 'position' : (name === 'vNormal' ? 'normal' : 'texCoord')]);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, sizes[name], gl.FLOAT, false, 0, 0);
  });
  gl.bindVertexArray(null);

  return vao;
}

// ---------------------------------------------------------------- 渲染目标与纹理

function buildDepthTarget() {
  depthTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F,
    depthSize, depthSize, 0,
    gl.DEPTH_COMPONENT, gl.FLOAT, null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);

  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    showFailure('深度帧缓冲创建失败，阴影功能不可用。');
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

var background = {
  texture: null,
  framebuffer: null,
  width: 0,
  height: 0
};

function buildBackgroundTarget() {
  background.texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, background.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  background.framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, background.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, background.texture, 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function resizeBackgroundTarget() {
  var width = Math.max(2, Math.round(canvas.width * SCENE.backgroundScale));
  var height = Math.max(2, Math.round(canvas.height * SCENE.backgroundScale));
  if (background.width === width && background.height === height) return;

  background.width = width;
  background.height = height;

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, background.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, background.framebuffer);
  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    showFailure('地形背景帧缓冲创建失败，背景将无法生成。');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  gl.bindTexture(gl.TEXTURE_2D, null);
}

/**
 * 运行时环境立方体贴图：从主体中心把同一套地形背景捕捉到 6 个面，
 * 立方体与湖面都采样这张贴图，镜面反射里才有山体、天空和地板。
 * 尺寸取 1024，按 LOD 0 满分辨率采样：镜面会把贴图放大两三倍，再降 mip
 * 山脊就糊了。只在光照或材质参数变化时重建，六面 raymarch 的开销不会摊到每帧。
 * 检测到软件渲染时降到 512，那是唯一还把开销摊到每次改参数的地方。
 */
var environment = {
  texture: null,
  framebuffer: null,
  size: 1024,
  signature: '',
  // 拖动光照滑杆时签名会逐帧变化，逐帧重捕六个面就是那次“卡”的来源。
  // 记下想要的新签名与时间戳，等手停下来一片刻再真正重捕。
  pending: '',
  pendingAt: 0,
  timer: 0
};

// 环境贴图重捕的静默时间：拖动期间继续用旧贴图，松手后立刻补上。
var ENV_REBUILD_DELAY = 160;

// 标准 cubemap 捕捉朝向：right = forward × up。
var ENV_FACES = [
  { forward: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] },
  { forward: [-1, 0, 0], right: [0, 0, 1], up: [0, -1, 0] },
  { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { forward: [0, 0, 1], right: [1, 0, 0], up: [0, -1, 0] },
  { forward: [0, 0, -1], right: [-1, 0, 0], up: [0, -1, 0] }
];

function buildEnvironmentTarget() {
  environment.texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, environment.texture);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  for (var face = 0; face < 6; face += 1) {
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA,
      environment.size, environment.size, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null
    );
  }

  environment.framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, environment.framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_CUBE_MAP_POSITIVE_X, environment.texture, 0
  );

  // 捕捉真实地板与台座时需要深度缓冲，否则近处的台座会盖住远处地板。
  environment.depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, environment.depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, environment.size, environment.size);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, environment.depth);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    showFailure('环境反射帧缓冲创建失败，反射将退化为黑色。');
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
}

/**
 * 只有光照与大气参数变化时才重建立方体贴图；相机移动不触发。
 * @param {number[]} lightPosition
 * @returns {string}
 */
function environmentSignature(lightPosition) {
  return [
    lightPosition[0].toFixed(3),
    lightPosition[1].toFixed(3),
    lightPosition[2].toFixed(3),
    lightPosition[3].toFixed(1),
    material.skyGlow.toFixed(3),
    material.fogDensity.toFixed(3),
    // 地板凹凸与阴影开关会改变捕捉内容，必须一起进签名。
    material.bumpStrength.toFixed(2),
    material.enableBump,
    material.enableShadow,
    material.enableFog,
    material.ka.toFixed(2),
    material.kd.toFixed(2),
    material.ks.toFixed(2),
    material.shininess.toFixed(1),
    material.usePCF,
    // 山湖精度决定捕捉进去的山形与云，切换后必须重抓一次立方体贴图。
    material.sceneDetail,
    // 天空盒是异步加载的：六面到齐后要重抓一次，镜面里才不会留一张黑天空。
    skybox.ready ? 1 : 0
  ].join('|');
}

function renderEnvironment(lightPosition, lightSpace) {
  var spot = vec3(0.0, SCENE.cubeY, 0.0);
  var sun = normalize(vec3(lightPosition[0], lightPosition[1], lightPosition[2]));
  var u = uniforms.terrain;

  gl.bindFramebuffer(gl.FRAMEBUFFER, environment.framebuffer);
  gl.viewport(0, 0, environment.size, environment.size);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  gl.useProgram(programs.terrain);
  gl.uniform3fv(u.u_eye, flatten(spot));
  gl.uniform1f(u.u_tanHalfFov, 1.0);
  gl.uniform1f(u.u_aspect, 1.0);
  gl.uniform3fv(u.u_sunDir, flatten(sun));
  gl.uniform3fv(u.u_lightColor, flatten(material.lightColor));
  gl.uniform3fv(u.u_ambientColor, flatten(material.ambientColor));
  gl.uniform3fv(u.u_fogColor, flatten(material.fogColor));
  gl.uniform3fv(u.u_horizonColor, flatten(material.horizonColor));
  gl.uniform1f(u.u_skyGlow, material.skyGlow);
  gl.uniform1f(u.u_fogDensity, material.fogDensity);
  gl.uniform1f(u.u_exposure, material.exposure);
  gl.uniform1f(u.u_time, sceneClock());
  gl.uniform1f(u.u_envMode, 1.0);
  gl.uniform1f(u.u_useEnv, 0.0);
  gl.uniform1i(u.u_pass, 0);
  // 环境贴图始终按完整效果捕捉；捕捉期间不让水面再采样自己。
  gl.uniform1f(u.u_enableShadow, 1.0);
  gl.uniform1f(u.u_enableFog, 1.0);
  gl.uniform1f(u.u_waterReflect, material.waterReflect);
  gl.uniform1f(u.u_enableWaterReflect, 0.0);

  // 生成期间解绑，避免采样正在写入的立方体贴图。
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

  var sceneProjection = perspective(90.0, 1.0, 0.1, 100.0);

  for (var i = 0; i < 6; i += 1) {
    var face = ENV_FACES[i];
    var forward = vec3(face.forward[0], face.forward[1], face.forward[2]);
    var up = vec3(face.up[0], face.up[1], face.up[2]);
    var center = vec3(
      spot[0] + forward[0],
      spot[1] + forward[1],
      spot[2] + forward[2]
    );

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, environment.texture, 0
    );
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 1) 背景：完整档走地形 / 水面 / 天空步进，简易档贴一张天空盒。
    if (material.sceneDetail > 0.5) {
      gl.useProgram(programs.terrain);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.uniform3fv(u.u_forward, flatten(forward));
      gl.uniform3fv(u.u_right, flatten(vec3(face.right[0], face.right[1], face.right[2])));
      gl.uniform3fv(u.u_up, flatten(up));
      // 必须每个面重新绑定地形 VAO：上一轮循环里的场景绘制会把 VAO 切到
      // 地板/台座的顶点缓冲上。只在循环外绑一次，后五个面就是拿地板顶点去画
      // 全屏四边形，画面停在清屏色——整张立方体贴图只剩一个平色，镜面因此
      // 退化成一块“玻璃盖板”。
      gl.bindVertexArray(vaos.terrain);
      gl.drawArrays(gl.TRIANGLES, 0, buffers.screen.count);
    } else {
      // 简易档：同一条捕捉路径，只是把背景换成天空盒，地面、台座与阴影
      // 仍然照常画进来，方块映出的还是这个场景，而不是一张悬空的照片。
      var faceView = lookAt(spot, center, up);
      renderSkybox(faceView, sceneProjection, 1.0);
    }

    // 2) 把真实场景再画一遍进立方体贴图：地板纹理、凹凸、光照、阴影、
    //    接触阴影与台座都由主程序实时计算，不再用程序化木板近似。
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    var sceneView = lookAt(spot, center, up);
    var mu = uniforms.main;
    gl.useProgram(programs.main);
    gl.uniformMatrix4fv(mu.u_ViewMatrix, false, flatten(sceneView));
    gl.uniformMatrix4fv(mu.u_ProjectionMatrix, false, flatten(sceneProjection));
    gl.uniformMatrix4fv(mu.u_LightSpaceMatrix, false, flatten(lightSpace));
    gl.uniform3fv(mu.viewPos, flatten(spot));
    gl.uniform4fv(mu.u_lightPosition, flatten(lightPosition));
    gl.uniform1i(mu.diffuseTexture, 0);
    gl.uniform1i(mu.depthTexture, 1);
    gl.uniform1i(mu.envSampler, 2);
    gl.uniform1i(mu.normalTexture, 3);
    applyMaterialUniforms(mu);
    gl.uniform1i(mu.u_pass, 0);
    gl.uniform1f(mu.u_envCapture, 1.0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, textures.normal);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures.floor);

    sceneObjects.forEach(function (object) {
      if (object.layer || object.envCapture === false) return;
      drawMainObject(object);
    });

    gl.bindVertexArray(null);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
  }
  gl.bindVertexArray(null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);

  // 生成 mip：水面按偏模糊的 mip 采样，倒影更接近被涟漪打散的效果；
  // 玻璃取 LOD 0，512 面分辨率足以保留山脊与云团的轮廓。先解绑 FBO 再改纹理。
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, environment.texture);
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
}

/**
 * 石材收边用的程序化纹理。噪声按周期取哈希，四边可无缝平铺。
 * @returns {HTMLCanvasElement}
 */
function createStoneCanvas() {
  var size = 256;
  var surface = document.createElement('canvas');
  surface.width = size;
  surface.height = size;
  var context = surface.getContext('2d');
  var image = context.createImageData(size, size);

  function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function periodicNoise(x, y, period) {
    var xi = Math.floor(x);
    var yi = Math.floor(y);
    var xf = x - xi;
    var yf = y - yi;
    var u = xf * xf * (3.0 - 2.0 * xf);
    var v = yf * yf * (3.0 - 2.0 * yf);

    function sample(ix, iy) {
      var px = ((ix % period) + period) % period;
      var py = ((iy % period) + period) % period;
      return hash(px, py);
    }

    var a = sample(xi, yi);
    var b = sample(xi + 1, yi);
    var c = sample(xi, yi + 1);
    var d = sample(xi + 1, yi + 1);
    return (a * (1.0 - u) + b * u) * (1.0 - v) + (c * (1.0 - u) + d * u) * v;
  }

  for (var y = 0; y < size; y += 1) {
    for (var x = 0; x < size; x += 1) {
      var value = 0.0;
      var amplitude = 0.5;
      var period = 8;
      for (var octave = 0; octave < 4; octave += 1) {
        value += amplitude * periodicNoise(x / size * period, y / size * period, period);
        period *= 2;
        amplitude *= 0.5;
      }

      var grain = hash(x * 3.1, y * 1.7) * 0.10;
      var speck = hash(x * 0.7, y * 2.3) > 0.965 ? 0.22 : 0.0;
      var base = Math.min(0.82, 0.33 + value * 0.30 + grain + speck);

      var index = (y * size + x) * 4;
      image.data[index] = Math.round(base * 255 * 1.02);
      image.data[index + 1] = Math.round(base * 255 * 0.99);
      image.data[index + 2] = Math.round(base * 255 * 0.94);
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  return surface;
}

function loadTextures() {
  var cubeImage = document.getElementById('cubeTexImage');
  var floorImage = document.getElementById('planeTexImage');
  textures.cube = configureTexture(cubeImage);
  textures.floor = configureTexture(floorImage);
  textures.normal = configureNormalMap(floorImage);

  var stoneCanvas = createStoneCanvas();
  textures.stone = configureTexture(stoneCanvas);
  textures.stoneNormal = configureNormalMap(stoneCanvas);
}

// ---------------------------------------------------------------- 尺寸与矩阵

// 全屏 raymarch 每帧的采样量 = 像素数 × 步数，像素数是最省事的那一档：
// 降分辨率只是变糊，降步数会让山脊和云一截一截地跳。所以帧率不够时先降像素。
var renderScale = 1.0;
var RENDER_SCALE_MIN = 0.55;
var RENDER_SCALE_MAX = 1.0;
var RENDER_SCALE_STEP = 0.1;
var softwareRendering = false;
var SOFTWARE_RENDERER = /swiftshader|basic render|llvmpipe|software|mesa offscreen/i;

// 帧间隔采样只统计连续重绘（拖动、滚轮连发）；静止后的第一帧不代表开销。
// 快帧阈值取 19ms 而不是 16.7ms：60Hz 屏的垂直同步间隔正好是 16.67ms，
// 阈值卡在它下面会让分辨率降下去之后再也没机会升回来。
var frameProbe = { last: 0, slow: 0, fast: 0 };
var FRAME_GAP_IDLE = 120;
var FRAME_GAP_SLOW = 26;
var FRAME_GAP_FAST = 19;
var FRAME_SLOW_LIMIT = 6;
var FRAME_FAST_LIMIT = 45;

function detectSoftwareRendering() {
  var info = gl.getExtension('WEBGL_debug_renderer_info');
  if (!info) return false;
  var name = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  return typeof name === 'string' && SOFTWARE_RENDERER.test(name);
}

function governRenderScale() {
  var now = performance.now();
  var gap = frameProbe.last ? now - frameProbe.last : 0;
  frameProbe.last = now;

  if (gap > FRAME_GAP_IDLE || gap <= 0) {
    frameProbe.slow = 0;
    frameProbe.fast = 0;
    return;
  }

  if (gap > FRAME_GAP_SLOW) {
    frameProbe.slow += 1;
    frameProbe.fast = 0;
  } else if (gap < FRAME_GAP_FAST) {
    frameProbe.fast += 1;
    frameProbe.slow = 0;
  } else {
    frameProbe.slow = 0;
    frameProbe.fast = 0;
  }

  if (frameProbe.slow >= FRAME_SLOW_LIMIT && renderScale > RENDER_SCALE_MIN) {
    frameProbe.slow = 0;
    renderScale = Math.max(RENDER_SCALE_MIN, renderScale - RENDER_SCALE_STEP);
  } else if (frameProbe.fast >= FRAME_FAST_LIMIT && renderScale < RENDER_SCALE_MAX) {
    frameProbe.fast = 0;
    renderScale = Math.min(RENDER_SCALE_MAX, renderScale + RENDER_SCALE_STEP);
  }
}

function resizeCanvas() {
  if (!gl || !canvas) return;

  var dpr = Math.min(window.devicePixelRatio || 1, 2) * renderScale;
  var rect = canvas.getBoundingClientRect();
  var width = Math.max(1, Math.round(rect.width * dpr));
  var height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  resizeBackgroundTarget();
}

function currentState() {
  return UI.store.get();
}

function computeLightPosition(state) {
  var theta = toRad(state.lightAzimuth);
  var phi = toRad(state.lightElevation);
  var radius = state.lightDist;

  return vec4(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta),
    state.lightType === 0 ? 1.0 : 0.0
  );
}

function computeEye(state) {
  var theta = toRad(state.cameraAzimuth);
  var phi = toRad(state.cameraElevation);
  var radius = state.cameraDist;

  return vec3(
    state.targetX + radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    state.targetZ + radius * Math.sin(phi) * Math.cos(theta)
  );
}

function computeView(eye, state) {
  return lookAt(eye, vec3(state.targetX, 0.0, state.targetZ), vec3(0.0, 1.0, 0.0));
}

function computeProjection(state) {
  var aspect = canvas.width / Math.max(1, canvas.height);
  return perspective(state.fov, aspect, SCENE.near, SCENE.far);
}

function upForLight(direction) {
  return Math.abs(direction[1]) > 0.98 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
}

function computeLightSpace(lightPosition) {
  var direction = normalize(vec3(lightPosition[0], lightPosition[1], lightPosition[2]));
  var up = upForLight(direction);
  var projection;
  var eye;

  if (lightPosition[3] === 1.0) {
    projection = perspective(90.0, 1.0, 0.1, 100.0);
    eye = vec3(lightPosition[0], lightPosition[1], lightPosition[2]);
  } else {
    projection = ortho(-12.0, 12.0, -12.0, 12.0, 0.1, 60.0);
    eye = vec3(direction[0] * 30.0, direction[1] * 30.0, direction[2] * 30.0);
  }

  var view = lookAt(eye, vec3(0.0, 0.0, 0.0), up);
  return mult(projection, view);
}

// ---------------------------------------------------------------- 渲染

// 场景时钟：水与云的运动都从这里取时间。从脚本加载起算，
// 避免长时间停留后大数值吃掉 float32 的精度。
var bootAt = performance.now();

function sceneClock() {
  return (performance.now() - bootAt) * 0.001;
}

function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(function () {
    renderQueued = false;
    render();
  });
}

function render() {
  if (!sceneReady || !gl) return;

  // 先按上一帧的实测间隔决定分辨率，resizeCanvas 随即把新尺寸写进画布。
  governRenderScale();
  resizeCanvas();

  var state = currentState();
  var lightPosition = computeLightPosition(state);
  var eye = computeEye(state);
  var view = computeView(eye, state);
  var projection = computeProjection(state);
  var lightSpace = computeLightSpace(lightPosition);

  // 阴影贴图先生成，环境捕捉里的真实地板才能采到方块投下的影子。
  renderShadowPass(lightSpace);

  // 环境贴图只跟随光照与大气参数更新，相机移动不触发重建。
  var signature = environmentSignature(lightPosition);
  if (signature !== environment.signature) {
    if (signature !== environment.pending) {
      environment.pending = signature;
      environment.pendingAt = performance.now();
    }
    if (performance.now() - environment.pendingAt >= ENV_REBUILD_DELAY) {
      renderEnvironment(lightPosition, lightSpace);
      environment.signature = signature;
      environment.pending = '';
    } else if (!environment.timer) {
      environment.timer = window.setTimeout(function () {
        environment.timer = 0;
        requestRender();
      }, ENV_REBUILD_DELAY);
    }
  }

  renderMainPass(state, eye, view, projection, lightSpace, lightPosition);

  // 天空盒的六张图在帧里补上传：没到位就继续要下一帧，到位或确认失败后停下。
  if (material.sceneDetail < 0.5 && !skybox.ready && !skybox.failed) requestRender();

  // 完整地形的水面波浪与云随时间流动，需要连续重绘；简易档是静止照片，
  // 没有东西会动，保持按需渲染。软件渲染下连续重绘只会把整页拖成幻灯片，
  // 同样保持按需渲染。
  if (material.sceneDetail > 0.5 && !softwareRendering) requestRender();
}

function renderShadowPass(lightSpace) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.viewport(0, 0, depthSize, depthSize);
  gl.clear(gl.DEPTH_BUFFER_BIT);

  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  gl.useProgram(programs.depth);
  gl.uniformMatrix4fv(uniforms.depth.u_LightSpaceMatrix, false, flatten(lightSpace));

  // 只有内层花卉与两级台座投影；反射层与玻璃层不进入阴影贴图。
  sceneObjects.forEach(function (object) {
    if (!object.castsShadow) return;
    gl.uniformMatrix4fv(uniforms.depth.u_ModelMatrix, false, flatten(object.model));
    gl.bindVertexArray(vaos.depth[object.vao] || vaos.depth.unit);
    gl.drawArrays(gl.TRIANGLES, 0, object.count);
  });

  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// ---------------------------------------------------------------- 天空盒

// 简易档的背景：模板里那套 6 面天空盒贴图（已缩到 1024²，六张共约 460 KB）。
var skybox = {
  texture: null,
  ready: false,
  loaded: 0,
  faces: ['right', 'left', 'top', 'bottom', 'front', 'back']
};

var skyboxModel = null;

// lookAt 返回的是行主序的 4×4，平移在第 4 列（m[0..2][3]）。天空盒只要旋转。
function mat4NoTranslation(m) {
  var out = mat4();
  for (var i = 0; i < 3; i += 1) {
    for (var j = 0; j < 3; j += 1) out[i][j] = m[i][j];
  }
  return out;
}

function loadSkybox() {
  skyboxModel = mat4();
  skyboxModel[0][0] = 60.0;
  skyboxModel[1][1] = 60.0;
  skyboxModel[2][2] = 60.0;

  skybox.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, skybox.texture);
  // 只做背景，不参与 mipmap 采样；边缘夹紧，接缝处不出现反向重复。
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // 六个面全部到位前不画：不完整的立方体贴图在 WebGL 里是“全黑 + 一次警告”，
  // 会在首帧和第一次环境捕捉里留下黑天空，之后也不会自己补上。
  // 图片对象必须挂在 skybox 上：只留闭包引用的话，加载途中被回收，
  // onload 就再也不会触发，六个请求全部 200 却一张都没上传。
  // 六个面全部到位前不画：不完整的立方体贴图在 WebGL 里是“全黑 + 一次警告”，
  // 会在首帧和第一次环境捕捉里留下黑天空，之后也不会自己补上。
  //
  // 这里既不用 onload，也不用 image.decode()，更不用 setInterval：在这个页面上
  // 三者都不落地——六个请求全部 200、图片对象 complete 且 naturalWidth 正常，
  // 回调却一次都不进。改成在渲染帧里检查 complete 再上传（见 uploadSkyboxFaces），
  // 主循环本来就是 rAF，帧一定会来。
  skybox.images = skybox.faces.map(function (name) {
    var image = new Image();
    image.src = 'skybox/' + name + '.jpg';
    return image;
  });
}

// 只有六个面都上传完才允许采样；返回是否已就绪。
function uploadSkyboxFaces() {
  if (skybox.ready) return true;

  var uploaded = 0;
  var broken = 0;
  skybox.images.forEach(function (image, index) {
    if (image.uploaded) {
      uploaded += 1;
      return;
    }
    if (!image.complete) return;
    if (image.naturalWidth === 0) {
      // 加载失败：complete 为真但宽度是 0，不要为它一直要帧。
      broken += 1;
      return;
    }

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skybox.texture);
    gl.texImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + index, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image
    );
    image.uploaded = true;
    uploaded += 1;
  });

  if (uploaded === 6) {
    skybox.ready = true;
    skybox.loaded = 6;
  } else if (broken > 0 && skybox.images.every(function (image) { return image.complete; })) {
    skybox.failed = true;
  }
  return skybox.ready;
}

function renderSkybox(viewMatrix, projectionMatrix, envMode) {
  if (!uploadSkyboxFaces()) return false;

  var u = uniforms.skybox;
  gl.useProgram(programs.skybox);
  gl.uniformMatrix4fv(u.u_ModelMatrix, false, flatten(skyboxModel));
  // 天空盒跟着相机走：必须去掉视图矩阵的平移。否则立方体留在世界原点，
  // 眼高 7 m 会把照片里的地平线压到视线下方，远山整条被木地板挡住，
  // 天空只剩一片平色——看起来就像贴图没生效。
  gl.uniformMatrix4fv(u.u_ViewMatrix, false, flatten(mat4NoTranslation(viewMatrix)));
  gl.uniformMatrix4fv(u.u_ProjectionMatrix, false, flatten(projectionMatrix));
  gl.uniform1f(u.u_exposure, material.exposure);
  gl.uniform1f(u.u_envMode, envMode);
  gl.uniform1i(u.u_skybox, 5);

  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, skybox.texture);

  var cullWasOn = gl.isEnabled(gl.CULL_FACE);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);

  gl.bindVertexArray(vaos.skybox);
  gl.drawArrays(gl.TRIANGLES, 0, buffers.unit.count);
  gl.bindVertexArray(null);

  if (cullWasOn) gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  return true;
}

function renderMainPass(state, eye, view, projection, lightSpace, lightPosition) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);

  // 背景：简易档直接贴模板的天空盒，完整档走程序化地形与体积云。
  if (material.sceneDetail > 0.5) {
    renderBackground(state, eye, lightPosition);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    compositeBackground();
  } else {
    renderSkybox(view, projection, 0.0);
  }

  gl.useProgram(programs.main);
  var u = uniforms.main;
  gl.uniformMatrix4fv(u.u_ViewMatrix, false, flatten(view));
  gl.uniformMatrix4fv(u.u_ProjectionMatrix, false, flatten(projection));
  gl.uniformMatrix4fv(u.u_LightSpaceMatrix, false, flatten(lightSpace));
  gl.uniform3fv(u.viewPos, flatten(eye));
  gl.uniform4fv(u.u_lightPosition, flatten(lightPosition));

  gl.uniform1i(u.diffuseTexture, 0);
  gl.uniform1i(u.depthTexture, 1);
  gl.uniform1i(u.envSampler, 2);
  gl.uniform1i(u.normalTexture, 3);
  gl.uniform1i(u.u_woodTexture, 9);
  gl.uniform1i(u.u_stoneTexture, 10);

  applyMaterialUniforms(u);
  gl.uniform1f(u.u_envCapture, 0.0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, environment.texture);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, textures.normal);
  gl.activeTexture(gl.TEXTURE9);
  gl.bindTexture(gl.TEXTURE_2D, textures.floor);
  gl.activeTexture(gl.TEXTURE10);
  gl.bindTexture(gl.TEXTURE_2D, textures.stone);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures.floor);

  var pass = material.pass;

  // 不透明物体：木台、石缘、侧裙、两级台座。
  sceneObjects.forEach(function (object) {
    if (object.layer) return;
    drawMainObject(object);
  });

  // 灯源（仅点光源有实体灯泡）。
  if (pass === 0 && lightPosition[3] === 1.0) {
    drawLamp(view, projection, lightPosition);
    gl.useProgram(programs.main);
  }

  // 中央展品：方块。镜面档单层不透明；玻璃档先背面后正面两层混合，
  // 玻璃才有体积，而不是贴在表面上的一层膜。
  var solidCube = null;
  sceneObjects.forEach(function (object) {
    if (object.layer === 'cube') solidCube = object;
  });

  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  if (pass === 0 && material.enableTransparent > 0.5) {
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.cullFace(gl.FRONT);
    gl.uniform1f(u.u_glassLayer, 0.0);
    drawMainObject(solidCube);

    gl.cullFace(gl.BACK);
    gl.uniform1f(u.u_glassLayer, 1.0);
    drawMainObject(solidCube);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
  } else {
    gl.disable(gl.BLEND);
    gl.uniform1f(u.u_glassLayer, 1.0);
    drawMainObject(solidCube);
  }

  gl.disable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.bindVertexArray(null);
}

function drawMainObject(object) {
  if (!object) return;
  var u = uniforms.main;

  gl.uniformMatrix4fv(u.u_ModelMatrix, false, flatten(object.model));
  gl.uniform1f(u.u_uvScale, object.uv);
  gl.uniform1f(u.u_materialType, object.materialType);
  gl.uniform3fv(u.u_baseTint, flatten(material.glassColor));

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures[object.texture] || textures.floor);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, textures[object.normal] || textures.normal);

  gl.bindVertexArray(vaos.main[object.vao]);
  gl.drawArrays(gl.TRIANGLES, 0, object.count);
}

function drawLamp(view, projection, lightPosition) {
  var lampModel = mult(
    translate(lightPosition[0], lightPosition[1], lightPosition[2]),
    scale(SCENE.lampScale, SCENE.lampScale, SCENE.lampScale)
  );

  gl.useProgram(programs.lamp);
  gl.uniformMatrix4fv(uniforms.lamp.u_ModelMatrix, false, flatten(lampModel));
  gl.uniformMatrix4fv(uniforms.lamp.u_ViewMatrix, false, flatten(view));
  gl.uniformMatrix4fv(uniforms.lamp.u_ProjectionMatrix, false, flatten(projection));
  gl.uniform3fv(uniforms.lamp.lightColor, flatten(material.lightColor));
  gl.bindVertexArray(vaos.lamp);
  gl.drawArrays(gl.TRIANGLES, 0, buffers.unit.count);
}

// 由视图向量构造背景着色器需要的相机基；不依赖逆矩阵。
function cameraBasis(eye, state) {
  var fx = state.targetX - eye[0];
  var fy = -eye[1];
  var fz = state.targetZ - eye[2];
  var forwardLength = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1.0;
  fx /= forwardLength;
  fy /= forwardLength;
  fz /= forwardLength;

  var rx = -fz;
  var rz = fx;
  var rightLength = Math.sqrt(rx * rx + rz * rz) || 1.0;
  rx /= rightLength;
  rz /= rightLength;

  return {
    forward: vec3(fx, fy, fz),
    right: vec3(rx, 0.0, rz),
    up: vec3(-rz * fy, rz * fx - rx * fz, rx * fy)
  };
}

function renderBackground(state, eye, lightPosition) {
  var basis = cameraBasis(eye, state);
  var sun = normalize(vec3(lightPosition[0], lightPosition[1], lightPosition[2]));
  var u = uniforms.terrain;

  gl.bindFramebuffer(gl.FRAMEBUFFER, background.framebuffer);
  gl.viewport(0, 0, background.width, background.height);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  gl.useProgram(programs.terrain);
  gl.uniform3fv(u.u_eye, flatten(eye));
  gl.uniform3fv(u.u_forward, flatten(basis.forward));
  gl.uniform3fv(u.u_right, flatten(basis.right));
  gl.uniform3fv(u.u_up, flatten(basis.up));
  gl.uniform1f(u.u_tanHalfFov, Math.tan(toRad(state.fov) * 0.5));
  gl.uniform1f(u.u_aspect, canvas.width / Math.max(1, canvas.height));
  gl.uniform3fv(u.u_sunDir, flatten(sun));
  gl.uniform3fv(u.u_lightColor, flatten(material.lightColor));
  gl.uniform3fv(u.u_ambientColor, flatten(material.ambientColor));
  gl.uniform3fv(u.u_fogColor, flatten(material.fogColor));
  gl.uniform3fv(u.u_horizonColor, flatten(material.horizonColor));
  gl.uniform1f(u.u_skyGlow, material.skyGlow);
  gl.uniform1f(u.u_fogDensity, material.fogDensity);
  gl.uniform1f(u.u_exposure, material.exposure);
  gl.uniform1f(u.u_time, sceneClock());
  gl.uniform1f(u.u_envMode, 0.0);
  gl.uniform1f(u.u_useEnv, 1.0);
  gl.uniform1i(u.u_pass, material.pass);
  gl.uniform1f(u.u_enableShadow, material.enableShadow);
  gl.uniform1f(u.u_enableFog, material.enableFog);
  gl.uniform1f(u.u_waterReflect, material.waterReflect);
  gl.uniform1f(u.u_enableWaterReflect, material.enableWaterReflect);
  gl.uniform1i(u.envSampler, 2);

  // 湖面反射与立方体共用同一张运行时环境贴图。
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, environment.texture);

  gl.bindVertexArray(vaos.terrain);
  gl.drawArrays(gl.TRIANGLES, 0, buffers.screen.count);
  gl.bindVertexArray(null);
}

function compositeBackground() {
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.BLEND);
  gl.useProgram(programs.composite);

  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, background.texture);
  gl.uniform1i(uniforms.composite.u_background, 4);

  gl.bindVertexArray(vaos.composite);
  gl.drawArrays(gl.TRIANGLES, 0, buffers.screen.count);
  gl.bindVertexArray(null);

  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
}

// ---------------------------------------------------------------- 输入

function bindInput() {
  canvas.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  canvas.addEventListener('pointerdown', function (event) {
    if (event.button === 0) dragMode = 1;
    else if (event.button === 1) dragMode = 2;
    else if (event.button === 2) dragMode = 3;
    else return;

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  canvas.addEventListener('pointermove', function (event) {
    if (!dragMode) return;

    var dx = event.clientX - lastPointerX;
    var dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    var store = UI.store;

    if (dragMode === 1) {
      store.batch(function () {
        store.set('cameraAzimuth', roundTo(wrapAngle(store.get('cameraAzimuth') - dx * 0.3), 1));
        store.set('cameraElevation', roundTo(clampNumber(store.get('cameraElevation') - dy * 0.3, 8, 88), 1));
      });
    } else if (dragMode === 2) {
      var pan = 0.002 * store.get('cameraDist');
      store.batch(function () {
        store.set('targetX', roundTo(store.get('targetX') - dx * pan, 2));
        store.set('targetZ', roundTo(store.get('targetZ') - dy * pan, 2));
      });
    } else {
      store.set('cameraDist', roundTo(clampNumber(store.get('cameraDist') + dy * 0.05, 3, 12), 1));
    }

    event.preventDefault();
  });

  function endDrag(event) {
    if (!dragMode) return;
    dragMode = 0;
    if (canvas.releasePointerCapture && event.pointerId !== undefined) {
      try { canvas.releasePointerCapture(event.pointerId); } catch (error) { /* 已自动释放 */ }
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    var store = UI.store;
    store.set('cameraDist', roundTo(clampNumber(store.get('cameraDist') + event.deltaY * 0.002, 3, 12), 1));
  }, { passive: false });
}

window.addEventListener('load', initScene);
