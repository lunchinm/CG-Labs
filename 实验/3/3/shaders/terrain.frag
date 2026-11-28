#version 300 es
precision highp float;

out vec4 FragColor;

in vec2 vNdc;

// 相机与光照
uniform vec3 u_eye;
uniform vec3 u_forward;
uniform vec3 u_right;
uniform vec3 u_up;
uniform float u_tanHalfFov;
uniform float u_aspect;

uniform vec3 u_sunDir;
uniform vec3 u_lightColor;
uniform vec3 u_ambientColor;
uniform vec3 u_fogColor;
uniform vec3 u_horizonColor;
uniform float u_skyGlow;
uniform float u_fogDensity;
uniform float u_exposure;

// 与主 Pass 共用的特效开关：环境也要响应阴影、雾效与水面反射的关闭。
uniform float u_enableShadow;
uniform float u_enableFog;
uniform float u_waterReflect;
uniform float u_enableWaterReflect;

// 运行时生成的环境立方体贴图：供湖面反射采样，避免在背景里递归采样自己。
uniform samplerCube envSampler;
uniform float u_useEnv;

// 以下只在生成立方体贴图时使用：1 表示捕捉通道，输出线性色。
uniform float u_envMode;

// 与 box.frag 共用同一套渲染视图编号，让地形背景也参与调试通道：
// 1 阴影、2 环境反射、3 雾效、4 法线、5 透明度。
uniform int u_pass;

const float WATER_Y = -1.06;
const float MAX_DIST = 145.0;

// ---------------------------------------------------------------- 噪声

float hash21(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 34.56);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 turn = mat2(0.80, 0.60, -0.60, 0.80);
    for (int i = 0; i < 4; i++) {
        value += amplitude * vnoise(p);
        p = turn * p * 2.03 + 11.7;
        amplitude *= 0.5;
    }
    return value;
}

// ---------------------------------------------------------------- 高度场

// 中央平台之外是一圈湖面，28 以后岸线抬升，44 以后进入主山脊，
// 92 以后再加一层远山，三层叠出纵深，避免一堵均匀的绿墙。
float terrainHeight(vec2 p) {
    float radius = length(p);
    float detail = (fbm(p * 0.21 + 4.0) - 0.5) * 0.9;

    // 半径 28 以内三层掩码全为 0，高度只剩细起伏；提前返回省掉 3 次 fbm。
    // 中央平台与湖底占了画面下半部，这是步进里最常走到的分支。
    if (radius <= 28.0) return -2.25 + detail;

    float shore = smoothstep(28.0, 44.0, radius);
    float ridge = smoothstep(44.0, 78.0, radius);
    float far = smoothstep(92.0, 138.0, radius);

    vec2 q = p * 0.045;
    float base = fbm(q);
    float ridgeNoise = 1.0 - abs(fbm(q * 0.55 + vec2(13.1, 7.7)) * 2.0 - 1.0);
    float ridgeFine = 1.0 - abs(fbm(q * 1.60 + vec2(31.0, 5.0)) * 2.0 - 1.0);

    float height = -2.25;
    height += shore * (0.9 + base * 2.6 + ridgeFine * ridgeFine * 1.3);
    height += ridge * (0.4 + ridgeNoise * ridgeNoise * 5.0 + base * 2.4);
    height += far * (2.5 + ridgeNoise * 10.0 + base * 2.5);
    height += detail;
    return height;
}

vec3 terrainNormal(vec2 p, float distance) {
    float eps = 0.035 + distance * 0.0015;
    float left = terrainHeight(p - vec2(eps, 0.0));
    float right = terrainHeight(p + vec2(eps, 0.0));
    float down = terrainHeight(p - vec2(0.0, eps));
    float up = terrainHeight(p + vec2(0.0, eps));
    return normalize(vec3(left - right, 2.0 * eps, down - up));
}

// 阴影射线：从落点朝太阳走，碰到更高地形就判为遮挡。
float terrainShadow(vec3 p, vec3 normal) {
    vec3 origin = p + normal * 0.18;
    float t = 0.25;
    for (int i = 0; i < 14; i++) {
        vec3 q = origin + u_sunDir * t;
        float height = terrainHeight(q.xz);
        if (q.y < height) return 0.34;
        t += max(0.35, (q.y - height) * 0.42);
    }
    return 1.0;
}

// ---------------------------------------------------------------- 体积云

// 云层是一块 35–140 m 的平板：底边贴着远山脊线，顶边落在画面顶端的天空带里。
// 射线在板内步进，用三维 fBm 密度和朝太阳的四步短程步进估计透光，得到有厚度、
// 有明暗的云团，而不是贴在天空上的二维噪声。
const float CLOUD_BOTTOM = 35.0;
const float CLOUD_TOP = 140.0;
// 天空没有山体遮挡时，云可以一直铺到 700 m 外；山体命中时才在落点截断。
const float CLOUD_REACH = 700.0;

float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash31(i);
    float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
        value += amplitude * vnoise3(p);
        p = p * 2.03 + vec3(9.7, 5.3, 7.1);
        amplitude *= 0.5;
    }
    // 三层的振幅和是 0.875，归一化回 0..1，阈值才对应“覆盖率”。
    return value * 1.142857;
}

float cloudDensity(vec3 p) {
    float h = (p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
    if (h <= 0.0 || h >= 1.0) return 0.0;

    // 大尺度云区只依赖 xz，覆盖率乘在最后；为 0 时整块密度必为 0，
    // 提前退出可以省掉 warp / shape / detail 的三维噪声采样。
    float cluster = fbm(p.xz * 0.0035 + 3.7);
    float field = smoothstep(0.48, 0.66, cluster);
    if (field <= 0.0) return 0.0;

    // 云底平、云顶蓬松：底部 10% 收拢，上半层散开。
    float profile = smoothstep(0.0, 0.10, h) * (1.0 - smoothstep(0.50, 1.0, h));

    vec3 q = p * 0.012;
    float warp = fbm(q.xz * 0.85 + q.y * 0.45);
    vec3 wq = q + vec3(warp * 0.8, h * 0.6, warp * 0.8);
    float shape = fbm3(wq + vec3(4.1, 0.0, 2.7));
    float detail = vnoise3(wq * 3.3 + vec3(9.0, 3.0, 6.0));
    float erosion = vnoise3(wq * 8.0 + vec3(2.0, 7.0, 3.0));

    // 大尺度云区把云分成几团，团与团之间留出蓝天；小尺度噪声收紧边缘。
    float mask = shape + (detail - 0.5) * 0.18 + (erosion - 0.5) * 0.07;
    float cover = smoothstep(0.56, 0.69, mask) * field;
    return cover * profile;
}

// 把云合成到地形 / 水面 / 天空之上；surfaceDistance 用来保证山体挡住云。
vec3 volumetricClouds(vec3 eye, vec3 dir, vec3 baseColor, float surfaceDistance) {
    if (abs(dir.y) < 0.0005) return baseColor;

    float t0 = (CLOUD_BOTTOM - eye.y) / dir.y;
    float t1 = (CLOUD_TOP - eye.y) / dir.y;
    if (t0 > t1) {
        float swapValue = t0;
        t0 = t1;
        t1 = swapValue;
    }
    t0 = max(t0, 1.0);
    t1 = min(t1, surfaceDistance);
    if (t1 - t0 < 0.5) return baseColor;

    const int STEPS = 40;
    float stepSize = (t1 - t0) / float(STEPS);
    float jitter = hash21(gl_FragCoord.xy + floor(u_eye.xz * 13.0)) * stepSize * 0.8;
    float t = t0 + jitter;

    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);
    float sunGlow = pow(max(dot(dir, u_sunDir), 0.0), 8.0);

    // 近处云团的裁剪距离。主视角永远俯视中央平台，正上方的天空不会出现在
    // 画面里，所以背景保留“只显示 140 m 以外”的干净天际线；捕捉环境立方体
    // 贴图时要放行近处云，否则镜面顶面反射的是一整块纯蓝，读起来像玻璃盖板。
    float nearStart = (u_envMode > 0.5) ? 18.0 : 140.0;
    // 整段步进都落在裁剪起点之内时，密度恒为 0、透射比保持 1，最后必然
    // 直接返回底色；先判掉，省下 40 次采样（大部分俯视地形的射线走这里）。
    if (t1 <= nearStart) return baseColor;
    float nearCut = (u_envMode > 0.5) ? smoothstep(18.0, 55.0, t) : smoothstep(140.0, 280.0, t);

    for (int i = 0; i < STEPS; i++) {
        vec3 p = eye + dir * t;
        float density = cloudDensity(p) * nearCut;
        if (density > 0.002) {
            // 朝太阳走四步累计光学厚度：云底暗、云顶亮，边缘透出暖光。
            float sunDepth = cloudDensity(p + u_sunDir * 12.0)
                + cloudDensity(p + u_sunDir * 26.0)
                + cloudDensity(p + u_sunDir * 42.0)
                + cloudDensity(p + u_sunDir * 60.0);
            float sunlight = exp(-sunDepth * 1.1);

            // 越靠云底，被上方云体遮挡越多，进一步压暗底部。
            float h = (p.y - CLOUD_BOTTOM) / (CLOUD_TOP - CLOUD_BOTTOM);
            sunlight *= mix(0.14, 1.0, smoothstep(0.0, 0.66, h));

            vec3 cloudColor = mix(vec3(0.075, 0.090, 0.135), vec3(1.25, 0.98, 0.74), sunlight);
            cloudColor += u_lightColor * sunGlow * 1.1 * sunlight;
            cloudColor += u_ambientColor * (0.10 + 0.14 * h);

            float sigma = density * 1.70;
            float absorb = 1.0 - exp(-sigma * stepSize);
            scattered += cloudColor * absorb * transmittance;
            transmittance *= 1.0 - absorb;
            if (transmittance < 0.02) break;
        }
        t += stepSize;
    }

    // 太淡的云不参与合成，避免山体上出现低密度采样噪声。
    if (transmittance > 0.97) return baseColor;

    // 远处的云并入偏冷的雾色，避免像贴纸一样浮在山脊前，也不会整片发黄。
    float cloudHaze = 1.0 - exp(-pow(t * 0.006, 1.6));
    vec3 cloudFog = mix(u_fogColor, u_horizonColor, 0.30) * (1.0 - transmittance);
    vec3 cloudRGB = mix(scattered, cloudFog, clamp(cloudHaze, 0.0, 0.32));
    return cloudRGB + baseColor * transmittance;
}

vec3 skyColor(vec3 dir) {
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 zenith = u_ambientColor * 2.1;
    vec3 color = mix(u_horizonColor, zenith, pow(h, 0.70));
    // 天空亮度：整体明暗 + 地平线暖带同步变化，立方体与湖面的天空倒影一起响应。
    color *= mix(0.65, 1.25, u_skyGlow);
    color = mix(color, u_horizonColor, exp(-abs(dir.y) * 16.0) * 0.65 * u_skyGlow);

    float sun = max(dot(dir, u_sunDir), 0.0);
    color += u_lightColor * pow(sun, 1400.0) * 8.0;
    color += u_lightColor * pow(sun, 14.0) * 0.35;
    color += u_lightColor * pow(sun, 3.0) * 0.08;

    // 高层薄云：给天顶和立方体顶面的天空倒影一点纹理，
    // 避免高高角度只剩一整块纯蓝。
    //
    // 按“高空平面投影”取样：原来直接拿 dir.xz 当 UV，天顶附近 dir.xz≈0，
    // 噪声退化成常数，水平镜面反射天顶时就是一整块纯蓝，被读成玻璃盖板。
    vec2 cirrusUv = dir.xz / max(dir.y, 0.55);
    float cirrusNoise = fbm(cirrusUv * 3.2 + vec2(3.7, 1.9));
    float cirrus = smoothstep(0.44, 0.66, cirrusNoise) * smoothstep(0.08, 0.60, h);
    color = mix(color, u_lightColor * 0.82 + u_fogColor * 0.18, cirrus * 0.28);
    return color;
}

vec3 waterColor(vec3 rayOrigin, vec3 rayDir, float distance, out vec3 waterNormal) {
    vec3 p = rayOrigin + rayDir * distance;
    vec2 wp = p.xz;

    float e = 0.20;
    float n0 = fbm(wp * 0.16);
    float nx = fbm((wp + vec2(e, 0.0)) * 0.16);
    float nz = fbm((wp + vec2(0.0, e)) * 0.16);
    // 法线扰动的倾斜幅度。环境立方体贴图修好后，湖面真的会映到地平线暖带：
    // 3.2 的斜率让反射方向在几度内翻来翻去，暖带与山影被搅成大色块；收到 1.4
    // 保留倒影层次，同时不会把水面打成一地油污。
    vec3 broadNormal = normalize(vec3((n0 - nx) * 1.4, 1.0, (n0 - nz) * 1.4));

    // 细碎涟漪只参与高光，不参与反射方向；否则掠射角下反射射线会在
    // 山脊/天空之间高频跳动，湖面出现成块噪点。
    float fine = fbm(wp * 1.35 + vec2(6.2, 2.8));
    vec3 normal = normalize(broadNormal + vec3((fine - 0.5) * 0.16, 0.0, (fine - 0.5) * 0.16));

    vec3 reflectedDir = reflect(rayDir, broadNormal);
    // 水面不可能反射自身下方的地板；掠射光线被涟漪压到地平线以下时钳住。
    reflectedDir.y = max(reflectedDir.y, 0.02);
    // 水面用独立的高模糊 mip 采样运行时环境贴图：山脊和天空被涟漪打散，
    // 不再出现立方体贴图近景平台的低分辨率块。
    vec3 reflected = (u_envMode > 0.5)
        ? skyColor(reflectedDir)
        : textureLod(envSampler, reflectedDir, 3.40).rgb;
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(-rayDir, broadNormal), 0.0), 5.0);

    vec3 deep = vec3(0.025, 0.045, 0.062);
    // 水面反射只由“水面反射”滑杆与开关控制，与正方体反射互不影响。
    float reflMix = clamp(0.30 + 0.66 * fresnel, 0.0, 1.0)
        * u_waterReflect * u_enableWaterReflect;
    vec3 color = mix(deep, reflected, clamp(reflMix, 0.0, 1.0));

    // 近岸浅水：湖底抬升处透出青绿色，岸线不再是一条硬边。
    float depth = max(WATER_Y - terrainHeight(wp), 0.0);
    float shallow = (1.0 - smoothstep(0.0, 0.60, depth)) * 0.55;
    color = mix(color, vec3(0.105, 0.150, 0.140), shallow);

    vec3 halfDir = normalize(u_sunDir - rayDir);
    float ndh = max(dot(normal, halfDir), 0.0);
    // 宽高光给出水面整体的光泽，窄高光保留太阳的锐利反光点。
    float gloss = pow(ndh, 180.0) * 1.25 + pow(ndh, 900.0) * 2.40;
    color += u_lightColor * gloss * 0.85;
    color += u_horizonColor * 0.07 * fresnel;

    // 湖面也吃距离雾：雾浓度滑杆从 0 推大时，远处水面会一起并入天色。
    float waterFog = 1.0 - exp(-pow(distance * u_fogDensity * 0.28, 1.55));
    color = mix(color, u_fogColor, clamp(waterFog, 0.0, 0.68) * u_enableFog);

    waterNormal = broadNormal;
    return color;
}

vec3 shadeLand(vec3 p, vec3 normal, float distance, out float shadowVisibility) {
    float slope = clamp(normal.y, 0.0, 1.0);
    float height = p.y - WATER_Y;

    // 草地 / 干草 / 岩石 / 沙岸四层材质：坡度越陡、海拔越高越偏岩石，
    // 叠加层理噪声，山体不再是一整片均匀的绿色。
    float patchNoise = fbm(p.xz * 0.10 + 8.3);
    float strata = fbm(p.xz * 0.52 + vec2(0.0, p.y * 1.25));
    vec3 grass = mix(vec3(0.072, 0.100, 0.058), vec3(0.140, 0.150, 0.078), patchNoise);
    vec3 dry = mix(vec3(0.155, 0.135, 0.085), vec3(0.215, 0.185, 0.115), strata);
    vec3 rock = mix(vec3(0.140, 0.132, 0.124), vec3(0.215, 0.198, 0.178), strata);
    vec3 sand = vec3(0.215, 0.180, 0.130);

    vec3 albedo = mix(grass, dry, smoothstep(0.30, 0.78, patchNoise * 0.75 + height * 0.035));
    float rockMask = smoothstep(0.60, 0.86, 1.0 - slope);
    rockMask = max(rockMask, smoothstep(8.0, 17.0, height) * 0.88);
    albedo = mix(albedo, rock, clamp(rockMask, 0.0, 1.0));
    albedo = mix(sand, albedo, smoothstep(0.04, 0.50, height));
    albedo *= 0.76 + strata * 0.46;

    float diffuse = max(dot(normal, u_sunDir), 0.0);
    float shadow = diffuse > 0.001 ? terrainShadow(p, normal) : 0.3;

    // 大尺度云影：让山体出现成片的明暗块，而不是一条均匀的绿带。
    float cloud = smoothstep(0.32, 0.70, fbm(p.xz * 0.017 + vec2(19.0, 7.0)));
    shadow *= mix(0.58, 1.0, cloud);
    // 关闭阴影时地形恢复满照度，调试视图也同步变成无遮挡。
    shadow = mix(1.0, shadow, u_enableShadow);
    shadowVisibility = shadow;

    vec3 ambient = u_ambientColor * (0.42 + 0.58 * normal.y);
    vec3 color = albedo * (ambient + u_lightColor * diffuse * shadow * 2.2);

    // 三段式空气透视：近处保留对比，远处逐渐并入冷色雾；关闭雾效时收掉。
    // 雾浓度滑杆同时控制山体与湖面，成片里不再是只有物体变灰。
    float haze = 1.0 - exp(-pow(distance * u_fogDensity * 0.28, 1.55));
    vec3 hazeColor = u_fogColor * 0.90 + vec3(0.010, 0.020, 0.045);
    return mix(color, hazeColor, clamp(haze, 0.0, 0.72) * u_enableFog);
}

// ---------------------------------------------------------------- 步进

float marchTerrain(vec3 origin, vec3 dir, float limit, out bool hit) {
    float t = 0.08;
    hit = false;

    for (int i = 0; i < 80; i++) {
        vec3 p = origin + dir * t;
        float height = terrainHeight(p.xz);
        float delta = p.y - height;

        if (delta < 0.015) {
            hit = true;
            break;
        }
        if (p.y > 45.0 && dir.y >= 0.0) break;

        t += max(0.08, delta * 0.45) * (1.0 + t * 0.018);
        if (t > limit) break;
    }
    return t;
}


vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    // 环境捕捉通道只负责地形、水面与天空；中央平台、地板、石材与台座
    // 由真实场景几何在同一张立方体贴图里实时绘制，不再使用程序化近似。
    vec3 rayDir = normalize(
        u_forward
        + u_right * (vNdc.x * u_aspect * u_tanHalfFov)
        + u_up * (vNdc.y * u_tanHalfFov)
    );

    float tWater = 1e6;
    if (rayDir.y < -0.0001) {
        tWater = (WATER_Y - u_eye.y) / rayDir.y;
    }

    float limit = rayDir.y >= 0.0 ? MAX_DIST : min(tWater, MAX_DIST);
    bool hit;
    float distance = marchTerrain(u_eye, rayDir, limit, hit);

    bool waterHit = !hit && tWater > 0.0 && tWater < MAX_DIST;
    vec3 surfaceNormal = vec3(0.0, 1.0, 0.0);
    float shadowVisibility = 1.0;
    vec3 color;
    if (hit) {
        vec3 p = u_eye + rayDir * distance;
        surfaceNormal = terrainNormal(p.xz, distance);
        color = shadeLand(p, surfaceNormal, distance, shadowVisibility);
    } else if (waterHit) {
        color = waterColor(u_eye, rayDir, tWater, surfaceNormal);
    } else {
        color = skyColor(rayDir);
    }

    // 调试通道也绘制地形背景，让山体、湖面与天空一起显示对应效果，
    // 不再是一块空白底色。
    if (u_envMode < 0.5 && u_pass != 0) {
        if (u_pass == 1) {
            // 阴影：白 = 被遮挡，黑 = 直射光或天空。
            FragColor = vec4(vec3(hit ? 1.0 - shadowVisibility : 0.0), 1.0);
            return;
        }
        if (u_pass == 3) {
            // 雾效：与主 Pass 相同的指数平方雾，距离越远越白。
            float surfaceDistance = hit ? distance : (waterHit ? tWater : MAX_DIST);
            float fog = 1.0 - exp(-pow(u_fogDensity * surfaceDistance, 2.0));
            fog *= u_enableFog;
            FragColor = vec4(vec3(clamp(fog, 0.0, 1.0)), 1.0);
            return;
        }
        if (u_pass == 4) {
            // 法线：地形与水面输出世界空间法线，天空用中灰占位。
            vec3 debugNormal = (hit || waterHit)
                ? surfaceNormal
                : vec3(0.5, 0.5, 0.5);
            FragColor = vec4(
                (hit || waterHit) ? debugNormal * 0.5 + 0.5 : debugNormal,
                1.0
            );
            return;
        }
        if (u_pass == 5) {
            // 透明度：地形与水面都不透明，输出黑色，让 B2 成为唯一亮部。
            FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }

    // 体积云在最终合成前叠加：命中山体时在落点截断，山会挡住后面的云；
    // 纯天空射线则让云一直铺到 CLOUD_REACH 外，画面顶部才有完整的云团。
    float cloudLimit = hit ? distance : CLOUD_REACH;
    color = volumetricClouds(u_eye, rayDir, color, cloudLimit);

    float dither = (hash21(gl_FragCoord.xy * 1.7) - 0.5) / 255.0;

    if (u_envMode > 0.5) {
        // alpha 留给“这个方向上是不是陆地”：镜面求交时用它判断远处水面
        // 有没有被山挡住，水面才不会一路铺到地平线、拉成一条直线。
        FragColor = vec4(clamp(color + dither, 0.0, 1.0), hit ? 1.0 : 0.0);
        return;
    }

    color = mix(color, u_fogColor,
        smoothstep(90.0, MAX_DIST, distance) * 0.12
        * smoothstep(0.0, 0.08, u_fogDensity) * u_enableFog);
    FragColor = vec4(clamp(aces(color * u_exposure) + dither, 0.0, 1.0), 1.0);
}
