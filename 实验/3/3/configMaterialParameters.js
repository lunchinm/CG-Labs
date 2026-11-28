/*
 * configMaterialParameters.js
 * 黄昏湖畔场景的材质默认值与 uniform 上传。
 * 所有可调数值集中在这里；UI 只写 store，渲染器再同步到 material。
 *
 * 特效作用边界：
 *   envMix            反射强度：镜面档＝镜面占表面的比例，玻璃档＝玻璃上的环境高光强度
 *   waterReflect      只作用于湖面
 *   opacity           不透明度：只在玻璃档（透明混合开）生效，控制方块 alpha；
 *                     镜面档是实体，alpha 恒 1，此滑杆不参与
 *   bumpStrength      作用于木台、石材顶面，以及反射中命中的木地板、台座与石缘
 *   skyGlow           只作用于天空与地平线，反射回退到环境贴图时同步变化
 *   enableTransparent 表面档位开关：开＝玻璃档（默认），关＝镜面档。两档在着色器里
 *                     互斥，参数不互相挪用，调一档不会改坏另一档
 */

var MATERIAL_DEFAULTS = {
  ka: 0.95,
  kd: 0.88,
  ks: 0.55,
  shininess: 96.0,
  // 反射强度默认满值：玻璃档下即环境高光拉满。
  envMix: 1.0,
  waterReflect: 0.85,
  opacity: 0.45,
  bumpStrength: 1.2,
  fogDensity: 0.035,
  skyGlow: 0.55,
  exposure: 1.05,
  // 背景来源：0 简易贴图（模板的 6 面天空盒，默认），1 完整地形（程序化山湖）。
  sceneDetail: 0,
  pass: 0,
  enableShadow: true,
  enablePCF: true,
  enableBump: true,
  enableFog: true,
  enableReflect: true,
  enableWaterReflect: true,
  // 默认走玻璃档：半透明是被要求的加分项，打开即是默认画面。
  enableTransparent: true
};

var MATERIAL_COLORS = {
  light: vec3(1.00, 0.78, 0.54),
  ambient: vec3(0.16, 0.22, 0.34),
  fog: vec3(0.34, 0.44, 0.58),
  horizon: vec3(1.00, 0.55, 0.28),
  glass: vec3(0.36, 0.52, 0.62)
};

var MATERIAL_TUNING = {
  uvScaleCube: 1.0,
  uvScaleFloor: 6.0,
  uvScaleStone: 10.0,
  depthTextureSize: 2048,
  normalStrength: 6.0,
  // 点光源距离衰减：f(d) = 1 / (a + b*d + c*d²)，对应 lec10 的点光源衰减。
  attenA: 1.0,
  attenB: 0.02,
  attenC: 0.002,
  // 反射多出来的那一段光程的雾权重。直接视图的雾按“眼→表面”调过，
  // 全量计入反射光程会把倒影洗成一块灰面板；0.35 是让镜面里的木地板
  // 和旁边真地板亮度对齐的实测值。
  reflectFogScale: 0.35
};

var material = {
  ka: MATERIAL_DEFAULTS.ka,
  kd: MATERIAL_DEFAULTS.kd,
  ks: MATERIAL_DEFAULTS.ks,
  shininess: MATERIAL_DEFAULTS.shininess,
  lightColor: MATERIAL_COLORS.light,
  ambientColor: MATERIAL_COLORS.ambient,
  envMix: MATERIAL_DEFAULTS.envMix,
  waterReflect: MATERIAL_DEFAULTS.waterReflect,
  opacity: MATERIAL_DEFAULTS.opacity,
  bumpStrength: MATERIAL_DEFAULTS.bumpStrength,
  fogColor: MATERIAL_COLORS.fog,
  fogDensity: MATERIAL_DEFAULTS.fogDensity,
  uvScaleCube: MATERIAL_TUNING.uvScaleCube,
  uvScaleFloor: MATERIAL_TUNING.uvScaleFloor,
  glassColor: MATERIAL_COLORS.glass,
  horizonColor: MATERIAL_COLORS.horizon,
  skyGlow: MATERIAL_DEFAULTS.skyGlow,
  exposure: MATERIAL_DEFAULTS.exposure,
  sceneDetail: MATERIAL_DEFAULTS.sceneDetail,
  pass: MATERIAL_DEFAULTS.pass,
  usePCF: 1.0,
  enableShadow: 1.0,
  enableBump: 1.0,
  enableFog: 1.0,
  enableReflect: 1.0,
  enableWaterReflect: 1.0,
  enableTransparent: 0.0
};

/**
 * 把 store 中的显示参数同步到 material。
 * 只处理 UI 能改的字段，颜色与采样尺度保持配置文件中的常量。
 * @param {Object} state
 */
function syncMaterialFromState(state) {
  material.ka = state.ka;
  material.kd = state.kd;
  material.ks = state.ks;
  material.shininess = state.shininess;
  material.envMix = state.envMix;
  material.waterReflect = state.waterReflect;
  material.opacity = state.opacity;
  material.bumpStrength = state.bumpStrength;
  material.fogDensity = state.fogDensity;
  material.skyGlow = state.skyGlow;
  material.exposure = state.exposure;
  material.sceneDetail = state.sceneDetail ? 1.0 : 0.0;
  material.pass = state.pass;
  material.usePCF = state.enablePCF ? 1.0 : 0.0;
  material.enableShadow = state.enableShadow ? 1.0 : 0.0;
  material.enableBump = state.enableBump ? 1.0 : 0.0;
  material.enableFog = state.enableFog ? 1.0 : 0.0;
  material.enableReflect = state.enableReflect ? 1.0 : 0.0;
  material.enableWaterReflect = state.enableWaterReflect ? 1.0 : 0.0;
  material.enableTransparent = state.enableTransparent ? 1.0 : 0.0;
}

/**
 * 上传主程序共用的材质 / 特效 uniform。
 * u_uvScale、u_materialType 与 u_baseTint 由调用方按物体单独设置。
 * @param {WebGLUniformLocation[]} u
 */
function applyMaterialUniforms(u) {
  gl.uniform1f(u.ambientStrength, material.ka);
  gl.uniform1f(u.diffuseStrength, material.kd);
  gl.uniform1f(u.specularStrength, material.ks);
  gl.uniform1f(u.shininess, material.shininess);

  gl.uniform3fv(u.lightColor, flatten(material.lightColor));
  gl.uniform3fv(u.u_ambientColor, flatten(material.ambientColor));
  gl.uniform3fv(u.u_fogColor, flatten(material.fogColor));

  gl.uniform1f(u.u_envMix, material.envMix);
  gl.uniform1f(u.u_opacity, material.opacity);
  gl.uniform1f(u.u_bumpStrength, material.bumpStrength);
  gl.uniform1f(u.u_fogDensity, material.fogDensity);
  gl.uniform1f(u.u_attenA, MATERIAL_TUNING.attenA);
  gl.uniform1f(u.u_attenB, MATERIAL_TUNING.attenB);
  gl.uniform1f(u.u_attenC, MATERIAL_TUNING.attenC);
  gl.uniform1f(u.u_exposure, material.exposure);

  // 本地反射求交：两级台座的包围盒，以及木台/石缘/水面的高度。
  gl.uniform3fv(u.u_plinth0Min, flatten(vec3(
    -SCENE.plinthTopHalf,
    SCENE.plinthTopY - SCENE.plinthTopHalfHeight,
    -SCENE.plinthTopHalf
  )));
  gl.uniform3fv(u.u_plinth0Max, flatten(vec3(
    SCENE.plinthTopHalf,
    SCENE.plinthTopY + SCENE.plinthTopHalfHeight,
    SCENE.plinthTopHalf
  )));
  gl.uniform3fv(u.u_plinth1Min, flatten(vec3(
    -SCENE.plinthBaseHalf,
    SCENE.plinthBaseY - SCENE.plinthBaseHalfHeight,
    -SCENE.plinthBaseHalf
  )));
  gl.uniform3fv(u.u_plinth1Max, flatten(vec3(
    SCENE.plinthBaseHalf,
    SCENE.plinthBaseY + SCENE.plinthBaseHalfHeight,
    SCENE.plinthBaseHalf
  )));
  gl.uniform1f(u.u_floorY, SCENE.floorY);
  gl.uniform1f(u.u_floorHalf, SCENE.floorHalf);
  gl.uniform1f(u.u_floorUvScale, MATERIAL_TUNING.uvScaleFloor);
  gl.uniform1f(u.u_stoneY, SCENE.stoneTop);
  gl.uniform1f(u.u_stoneHalf, SCENE.stoneHalf);
  gl.uniform1f(u.u_waterY, SCENE.stoneTop - 0.052);
  gl.uniform1f(u.u_cubeCenterY, SCENE.cubeY);

  gl.uniform1f(u.u_usePCF, material.usePCF);
  gl.uniform1f(u.u_enableShadow, material.enableShadow);
  gl.uniform1f(u.u_enableBump, material.enableBump);
  gl.uniform1f(u.u_enableFog, material.enableFog);
  gl.uniform1f(u.u_enableReflect, material.enableReflect);
  gl.uniform1f(u.u_enableTransparent, material.enableTransparent);
  gl.uniform1f(u.u_reflectFogScale, MATERIAL_TUNING.reflectFogScale);
  gl.uniform1f(u.u_waterReflect, material.waterReflect);
  gl.uniform1f(u.u_enableWaterReflect, material.enableWaterReflect);

  gl.uniform2f(u.u_texelSize, 1.0 / MATERIAL_TUNING.depthTextureSize, 1.0 / MATERIAL_TUNING.depthTextureSize);
  gl.uniform1i(u.u_pass, material.pass);
}
