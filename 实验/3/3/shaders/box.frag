#version 300 es
precision highp float;

out vec4 FragColor;

in vec3 Normal;
in vec3 FragPos;
in vec3 LocalPos;
in vec2 TexCoord;
in vec4 FragPosLightSpace;

// TODO2 material terms
uniform float ambientStrength;
uniform float diffuseStrength;
uniform float specularStrength;
uniform float shininess;

uniform vec3 viewPos;
uniform vec4 u_lightPosition;
uniform vec3 lightColor;

uniform mediump sampler2D diffuseTexture;
uniform highp sampler2D depthTexture;
uniform mediump sampler2D normalTexture;
uniform mediump samplerCube envSampler;
uniform mediump sampler2D u_woodTexture;
uniform mediump sampler2D u_stoneTexture;
uniform mat4 u_LightSpaceMatrix;

// Scene A / bonus uniforms
uniform vec3 u_ambientColor;
uniform vec3 u_fogColor;
uniform vec3 u_baseTint;
uniform float u_envMix;
uniform float u_opacity;
uniform float u_bumpStrength;
uniform float u_fogDensity;
uniform float u_uvScale;
uniform float u_usePCF;
uniform float u_enableShadow;
uniform float u_enableBump;
uniform float u_enableFog;
uniform float u_enableReflect;
// 表面档位：0 镜面（实体、alpha 恒 1），1 玻璃（花体 + 混合）。
// 与 u_opacity 彻底分开：不透明度只控玻璃档的 alpha，不再兼任反射占比，
// 否则“调透明”必然改坏“镜面”，这正是上一版反复翻车的原因。
uniform float u_enableTransparent;
// 材质类型：0 实体方块、1 木台、2 石材。
uniform float u_materialType;
uniform vec2 u_texelSize;
uniform float u_exposure;
uniform int u_pass;
uniform float u_envCapture;
// 点光源距离衰减系数：f(d) = 1 / (a + b*d + c*d²)。
uniform float u_attenA;
uniform float u_attenB;
uniform float u_attenC;
// 两级台座在木台上的矩形占地：xy = 中心，zw = 半宽。
// 本地反射求交用的台座包围盒、地板/石缘/水面高度。
uniform vec3 u_plinth0Min;
uniform vec3 u_plinth0Max;
uniform vec3 u_plinth1Min;
uniform vec3 u_plinth1Max;
uniform float u_floorY;
uniform float u_floorHalf;
uniform float u_floorUvScale;
uniform float u_stoneY;
uniform float u_stoneHalf;
uniform float u_waterY;
// 方块中心高度：环境贴图就是从这一点捕捉的，判断"对岸"时要用同一个视点。
uniform float u_cubeCenterY;
// 水面反射的两档控制与地形共用同一组 store 值：镜面里那一条湖水也要跟着
// “水面反射”滑杆变，否则关掉水面反射时，倒影里还留着一片反光的湖。
uniform float u_waterReflect;
uniform float u_enableWaterReflect;
// 反射多出来的那段光程的雾权重。直接视图的雾按“眼→表面”调过，镜面还要
// 再走一段“表面→命中点”，全量计入会把倒影洗成一块灰面板。
uniform float u_reflectFogScale;
// 玻璃档分两层绘制：0 = 背面层，1 = 正面层。
uniform float u_glassLayer;

float shadowCalculation(vec4 fragPosLightSpace, vec3 normal, vec3 lightDir) {
    // TODO3: shadow map lookup with optional 3x3 PCF
    vec3 proj = fragPosLightSpace.xyz / fragPosLightSpace.w;
    proj = proj * 0.5 + 0.5;

    if (proj.z > 1.0 || proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 0.0;

    float bias = max(0.0025 * (1.0 - dot(normal, lightDir)), 0.0008);
    float shadow = 0.0;

    if (u_usePCF > 0.5) {
        for (int x = -1; x <= 1; ++x) {
            for (int y = -1; y <= 1; ++y) {
                float closest = texture(depthTexture, proj.xy + vec2(float(x), float(y)) * u_texelSize * 2.0).r;
                shadow += (proj.z - bias > closest) ? 1.0 : 0.0;
            }
        }
        shadow /= 9.0;
    } else {
        float closest = texture(depthTexture, proj.xy).r;
        shadow = (proj.z - bias > closest) ? 1.0 : 0.0;
    }

    return shadow;
}

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// ---------------------------------------------------------------- 噪声
// 与地形着色器同一套值噪声：镜面里那一条湖水要跟真湖水有同样的涟漪结构，
// 不能是一块平色带。
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

// 镜面里的水纹只要“有涟漪”，不要满配 fbm：方块在近景能吃掉上百万像素，
// 每个像素四次八度噪声直接把帧率拖下去。两八度 + 复用主噪声做高光扰动，
// 远看和地形那边没差，开销只剩四分之一。
float fbm2(vec2 p) {
    float value = 0.5 * vnoise(p);
    value += 0.25 * vnoise(mat2(0.80, 0.60, -0.60, 0.80) * p * 2.03 + 11.7);
    return value;
}



// 反射光线与轴对齐盒求交；返回最近命中距离和命中面法线。
bool intersectAABB(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float tHit, out vec3 nHit) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (bmin - ro) * inv;
    vec3 t1 = (bmax - ro) * inv;
    vec3 tsmall = min(t0, t1);
    vec3 tbig = max(t0, t1);
    float tNear = max(max(tsmall.x, tsmall.y), tsmall.z);
    float tFar = min(min(tbig.x, tbig.y), tbig.z);

    if (tNear > tFar || tFar < 0.0) return false;

    tHit = tNear > 0.0 ? tNear : tFar;
    vec3 p = ro + rd * tHit;
    vec3 center = (bmin + bmax) * 0.5;
    vec3 halfSize = max((bmax - bmin) * 0.5, vec3(0.00001));
    vec3 d = abs(p - center) / halfSize;

    if (d.x >= d.y && d.x >= d.z) {
        nHit = vec3(sign(p.x - center.x), 0.0, 0.0);
    } else if (d.y >= d.z) {
        nHit = vec3(0.0, sign(p.y - center.y), 0.0);
    } else {
        nHit = vec3(0.0, 0.0, sign(p.z - center.z));
    }
    return true;
}

/**
 * 反射命中点的着色。
 *
 * 与主分支共用同一套项：Blinn-Phong、阴影贴图、高光按纹理亮度调制。只把
 * 视线换成反射方向的反向。少了高光亮度调制这一项，倒影里的木地板就会比
 * 旁边真地板更亮、更黄，被读成“里面另有一面墙”。
 */
vec3 lightSurface(vec3 p, vec3 n, vec3 rd, float texLuma) {
    vec3 toLight = u_lightPosition.xyz - p;
    float distanceToLight = length(toLight);
    vec3 lightDir = normalize(toLight);
    float attenuation = (u_lightPosition.w == 1.0)
        ? clamp(1.0 / (u_attenA + u_attenB * distanceToLight + u_attenC * distanceToLight * distanceToLight), 0.0, 1.0)
        : 1.0;

    vec3 viewDir = normalize(-rd);
    vec3 halfDir = normalize(viewDir + lightDir);

    float shadow = (u_enableShadow > 0.5)
        ? shadowCalculation(u_LightSpaceMatrix * vec4(p, 1.0), n, lightDir)
        : 0.0;

    vec3 ambient = ambientStrength * u_ambientColor;
    vec3 diffuse = diffuseStrength * max(dot(n, lightDir), 0.0) * lightColor * attenuation;
    vec3 specular = specularStrength * pow(max(dot(n, halfDir), 0.0), shininess) * lightColor * attenuation;
    specular *= step(0.0001, dot(n, lightDir)) * mix(0.35, 1.0, texLuma);

    return ambient + (1.0 - shadow) * (diffuse + specular);
}



/**
 * 反射路径的雾。
 *
 * 光程 = 眼→表面 + 表面→命中点。第二段只按 u_reflectFogScale 计入：指数
 * 平方雾是按直接视图调的，把反射的长光程全量算进去，倒影会比实景更灰更白。
 */
float reflectionFog(float surfaceDistance, float extraPath) {
    float scaled = surfaceDistance + extraPath * u_reflectFogScale;
    float fog = 1.0 - exp(-pow(u_fogDensity * scaled, 2.0));
    return clamp(fog, 0.0, 1.0) * u_enableFog;
}

/**
 * 反射里的法线扰动。
 *
 * 木台、台座、石缘在直接视图里都吃凹凸贴图；镜像里只按几何法线着色的话，
 * 台阶的倒影就永远是一块平板，“凹凸强度”滑杆对它没有任何反应。
 */
vec3 bumpNormal(vec3 n, vec2 uv, float lod) {
    if (u_enableBump < 0.5) return n;
    vec3 mapN = textureLod(normalTexture, uv, lod).rgb * 2.0 - 1.0;
    mapN.xy *= u_bumpStrength;
    if (abs(n.y) > 0.5) {
        // 水平面：T = +X，B = -Z，与主分支同一套切线基。
        return normalize(vec3(mapN.x, mapN.z, -mapN.y));
    }
    // 竖直面：切线取水平方向，副切线由法线与切线叉乘得到。
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), n));
    vec3 bitangent = cross(n, tangent);
    return normalize(tangent * mapN.x + bitangent * mapN.y + n * mapN.z);
}

/**
 * 本地反射求交：两级台座、木地板、石缘、水面；都没命中才回退环境贴图。
 *
 * 只求一次交（单次反射）。命中点不再继续追下一次反射，颜色由“直接光照 +
 * 环境贴图”给出；所以命中点自己的法线扰动必须在这一遍里算，不然台阶和湖面
 * 在镜像里就只剩一块平色。
 */
vec3 traceLocalReflection(vec3 rayOrigin, vec3 rayDir) {
    float bestT = 1.0e9;
    int hitType = -1;
    vec3 hitNormal = vec3(0.0, 1.0, 0.0);
    vec3 hitPoint = vec3(0.0);

    float t;
    vec3 n;

    // 两级台座：反射光先碰到台阶，台阶就会出现在方块下半部。
    if (intersectAABB(rayOrigin, rayDir, u_plinth0Min, u_plinth0Max, t, n) && t > 0.0 && t < bestT) {
        bestT = t;
        hitType = 1;
        hitNormal = n;
        hitPoint = rayOrigin + rayDir * t;
    }
    if (intersectAABB(rayOrigin, rayDir, u_plinth1Min, u_plinth1Max, t, n) && t > 0.0 && t < bestT) {
        bestT = t;
        hitType = 1;
        hitNormal = n;
        hitPoint = rayOrigin + rayDir * t;
    }

    // 木地板。
    if (rayDir.y < -0.0001) {
        t = (u_floorY - rayOrigin.y) / rayDir.y;
        if (t > 0.0 && t < bestT) {
            vec3 p = rayOrigin + rayDir * t;
            if (abs(p.x) <= u_floorHalf && abs(p.z) <= u_floorHalf) {
                bestT = t;
                hitType = 0;
                hitNormal = vec3(0.0, 1.0, 0.0);
                hitPoint = p;
            }
        }

        // 木台外圈的深色石缘。
        t = (u_stoneY - rayOrigin.y) / rayDir.y;
        if (t > 0.0 && t < bestT) {
            vec3 p = rayOrigin + rayDir * t;
            bool outsideWood = abs(p.x) > u_floorHalf || abs(p.z) > u_floorHalf;
            bool insideStone = abs(p.x) <= u_stoneHalf && abs(p.z) <= u_stoneHalf;
            if (outsideWood && insideStone) {
                bestT = t;
                hitType = 1;
                hitNormal = vec3(0.0, 1.0, 0.0);
                hitPoint = p;
            }
        }

        // 平台外的水面。
        t = (u_waterY - rayOrigin.y) / rayDir.y;
        if (t > 0.0 && t < bestT) {
            vec3 p = rayOrigin + rayDir * t;
            bool outsideStone = abs(p.x) > u_stoneHalf || abs(p.z) > u_stoneHalf;
            if (outsideStone) {
                bestT = t;
                hitType = 2;
                hitNormal = vec3(0.0, 1.0, 0.0);
                hitPoint = p;
            }
        }
    }

    float surfaceDistance = length(viewPos - rayOrigin);

    if (hitType < 0) {
        // 没有本地命中：远处山体/天空从运行时环境贴图取。捕捉时已经带上了
        // 空气透视，这里不再叠雾。贴图是 1536，按 LOD 0 取满分辨率。
        return textureLod(envSampler, rayDir, 0.0).rgb;
    }

    float fog = reflectionFog(surfaceDistance, bestT);

    if (hitType == 0) {
        vec2 uv = vec2(
            0.5 + hitPoint.x / (2.0 * u_floorHalf),
            0.5 - hitPoint.z / (2.0 * u_floorHalf)
        ) * u_floorUvScale;
        vec3 albedo = texture(u_woodTexture, uv).rgb;
        float texLuma = dot(albedo, vec3(0.299, 0.587, 0.114));
        // 凹凸 LOD 跟着反射光程走：倒影在掠射角被拉长，纹路该一起变柔。
        float bumpLod = clamp(bestT * 0.12, 0.0, 4.0);
        vec3 nWood = bumpNormal(vec3(0.0, 1.0, 0.0), uv, bumpLod);
        vec3 lit = lightSurface(hitPoint, nWood, rayDir, texLuma);
        return mix(lit * albedo, u_fogColor, fog);
    }

    if (hitType == 1) {
        vec3 an = abs(hitNormal);
        bool isTop = an.y > an.x && an.y > an.z;
        // 石纹 uv 尺度对齐直接视图：台座顶面 3.5 m 铺 2.5 次。
        float stoneUvScale = 0.72;
        vec2 uv;
        if (isTop) {
            uv = hitPoint.xz * stoneUvScale + vec2(1.25);
        } else if (an.x > an.z) {
            uv = vec2(hitPoint.z, hitPoint.y) * stoneUvScale;
        } else {
            uv = vec2(hitPoint.x, hitPoint.y) * stoneUvScale;
        }
        vec3 albedo = texture(u_stoneTexture, uv).rgb;
        float texLuma = dot(albedo, vec3(0.299, 0.587, 0.114));
        float bumpLod = clamp(bestT * 0.12, 0.0, 4.0);
        vec3 nStone = bumpNormal(hitNormal, uv, bumpLod);
        vec3 lit = lightSurface(hitPoint, nStone, rayDir, texLuma);
        return mix(lit * albedo, u_fogColor, fog);
    }

    // 水面：与地形着色器里的 waterColor 同一套口径——同样用 fbm 求涟漪法线、
    // 同样按菲涅耳混合深水色与环境倒影、同样叠太阳高光。命中的湖面位置不同，
    // 涟漪相位自然不同，但质感必须一致，倒影里那一条湖才不是一块灰带。
    vec2 wp = hitPoint.xz;
    float eps = 0.20;
    float n0 = fbm2(wp * 0.16);
    float nx = fbm2((wp + vec2(eps, 0.0)) * 0.16);
    float nz = fbm2((wp + vec2(0.0, eps)) * 0.16);
    vec3 waterNormal = normalize(vec3((n0 - nx) * 1.4, 1.0, (n0 - nz) * 1.4));
    // 细碎涟漪只参与高光，不参与反射方向，避免掠射角下反射射线高频跳动。
    vec3 glossNormal = normalize(waterNormal + vec3((n0 - 0.5) * 0.16, 0.0, (n0 - 0.5) * 0.16));

    vec3 reflectedDir = reflect(rayDir, waterNormal);
    // 只防退化，不再把反射方向抬到 1.1°：掠射角的反射方向本来就该贴着地平线，
    // 抬高一点点就直接越过山脚、采到山上面的天空，水天交界处于是裂成一条亮边。
    reflectedDir.y = max(reflectedDir.y, 0.0015);
    vec3 reflected = textureLod(envSampler, reflectedDir, 3.40).rgb;
    float waterFresnel = 0.02 + 0.98 * pow(1.0 - max(dot(-rayDir, waterNormal), 0.0), 5.0);
    vec3 deep = vec3(0.025, 0.045, 0.062);
    float reflMix = clamp(0.30 + 0.66 * waterFresnel, 0.0, 1.0) * u_waterReflect * u_enableWaterReflect;
    vec3 water = mix(deep, reflected, clamp(reflMix, 0.0, 1.0));

    vec3 waterLightDir = normalize(u_lightPosition.xyz - hitPoint);
    vec3 halfDir = normalize(normalize(-rayDir) + waterLightDir);
    float ndh = max(dot(glossNormal, halfDir), 0.0);
    float gloss = pow(ndh, 180.0) * 1.25 + pow(ndh, 900.0) * 2.40;
    water += lightColor * gloss * 0.85;

    // 水面不再叠任何距离雾。两个原因：一是它反射的环境贴图在捕捉时已经带过
    // 空气透视，再雾一次就是双重衰减；二是 reflectionFog 用的指数平方雾在
    // 70 m 就饱和成纯雾色，掠射角的水面动辄上百米，整条湖会被刷成一块灰带，
    // 和山脚之间留下一条假边。远处该有的朦胧，环境贴图里本来就有。
    //
    // 另外水是按平面求交的，本地没有地形，等于一片铺到天边去的湖。环境贴图
    // 的 alpha 记录了从方块中心看出去每个方向是不是陆地，朝命中点那个方向
    // 若是陆地，说明这段水已经在对岸之外：换成该方向的岸上颜色。这样镜面里
    // 的湖面在真正的水岸处收住，而不是一路顶到地平线，显得比旁边真湖面高
    // 出一大截。
    vec3 toHit = normalize(hitPoint - vec3(0.0, u_cubeCenterY, 0.0));
    vec4 shoreSample = textureLod(envSampler, toHit, 1.0);
    water = mix(water, shoreSample.rgb, smoothstep(0.35, 0.65, shoreSample.a));

    return water;
}

void main() {
    bool isCube = u_materialType < 0.5;
    bool isWood = u_materialType > 0.5 && u_materialType < 1.5;
    bool isStone = u_materialType > 1.5;

    vec3 texColor = texture(diffuseTexture, TexCoord * u_uvScale).rgb;
    vec3 norm = normalize(Normal);

    // 凹凸只作用于木台与石材顶面；方块保持光滑镜面。
    if (u_enableBump > 0.5 && (isWood || isStone) && abs(norm.y) > 0.5) {
        float bumpLod = clamp(length(viewPos - FragPos) * 0.12, 0.0, 4.0);
        vec3 mapN = textureLod(normalTexture, TexCoord * u_uvScale, bumpLod).rgb * 2.0 - 1.0;
        mapN.xy *= u_bumpStrength;
        // Floor tangent frame: T = +X, B = -Z, N = +Y.
        norm = normalize(vec3(mapN.x, mapN.z, -mapN.y));
    }

    vec3 toLight = u_lightPosition.xyz - FragPos;
    float lightDistance = length(toLight);
    vec3 lightDir = normalize(toLight);
    float attenuation = (u_lightPosition.w == 1.0)
        ? clamp(1.0 / (u_attenA + u_attenB * lightDistance + u_attenC * lightDistance * lightDistance), 0.0, 1.0)
        : 1.0;

    vec3 viewDir = normalize(viewPos - FragPos);
    vec3 halfDir = normalize(viewDir + lightDir);

    // 阴影偏置使用几何法线，避免凹凸法线让偏置抖动、在地面上打出麻点。
    float shadow = (u_enableShadow > 0.5)
        ? shadowCalculation(FragPosLightSpace, normalize(Normal), lightDir)
        : 0.0;

    // TODO2: Blinn-Phong ambient, diffuse and specular terms
    vec3 ambient = ambientStrength * u_ambientColor;
    vec3 diffuse = diffuseStrength * max(dot(norm, lightDir), 0.0) * lightColor * attenuation;
    vec3 specular = specularStrength * pow(max(dot(norm, halfDir), 0.0), shininess) * lightColor * attenuation;
    specular *= step(0.0001, dot(norm, lightDir));

    float texLuma = (isWood || isStone)
        ? dot(texColor, vec3(0.299, 0.587, 0.114))
        : 1.0;
    specular *= mix(0.35, 1.0, texLuma);

    float fogFactor = 1.0 - exp(-pow(u_fogDensity * length(viewPos - FragPos), 2.0));
    fogFactor = clamp(fogFactor, 0.0, 1.0) * u_enableFog;

    if (isCube) {
        vec3 N = normalize(Normal);
        vec3 incident = normalize(FragPos - viewPos);
        vec3 reflected = reflect(incident, N);

        // 反射强度就是“反射占表面的比例”，0 是 0，不再是 0.78。
        float mirrorMix = clamp(u_envMix, 0.0, 1.0) * step(0.5, u_enableReflect);
        float fresnel = pow(1.0 - clamp(dot(N, -incident), 0.0, 1.0), 5.0);

        // 阴影 / 法线 / 雾效 / 透明度四个调试通道不需要反射结果，先返回：
        // 求交与水面噪声在近景是上百万像素，别为了一张通道图白算。
        if (u_pass == 1) {
            FragColor = vec4(vec3(0.12), 1.0);
            return;
        }
        if (u_pass == 3) {
            FragColor = vec4(vec3(fogFactor), 1.0);
            return;
        }
        if (u_pass == 4) {
            FragColor = vec4(N * 0.5 + 0.5, 1.0);
            return;
        }
        if (u_pass == 5) {
            float alphaOnly = 1.0;
            if (u_enableTransparent > 0.5) {
                alphaOnly = u_opacity * smoothstep(-1.0, -0.94, LocalPos.y);
                if (u_glassLayer < 0.5) {
                    alphaOnly *= 0.70;
                }
            }
            FragColor = vec4(vec3(1.0 - alphaOnly), 1.0);
            return;
        }

        // 每个片元沿真实反射方向做本地求交：台阶、木地板、石缘、水面。
        // 只有本地都没命中时，才回退到远处环境贴图（山体/天空）。
        // 玻璃档不用这份结果（只叠一层环境高光），除反射调试图外直接跳过。
        vec3 hitColor = vec3(0.0);
        if (u_pass == 2 || u_enableTransparent < 0.5) {
            hitColor = traceLocalReflection(FragPos + N * 0.004, reflected);
        }

        // 花体底色：只负责“不反射的那部分表面”，与镜面颜色分开算。
        vec3 bodyColor = (ambient * 0.85 + (1.0 - shadow) * (diffuse + specular)) * texColor;
        bodyColor = mix(bodyColor, u_fogColor, fogFactor);

        vec3 cubeColor;
        float alpha;
        if (u_enableTransparent > 0.5) {
            // 玻璃档：花体是主体，环境反射只按菲涅耳叠一层加色高光，不替换颜色。
            // 这样“透明混合”开关只影响玻璃，镜面档一个像素都不会动。
            vec3 envColor = textureLod(envSampler, reflected, 2.0).rgb * (1.0 - fogFactor);
            cubeColor = bodyColor;
            cubeColor += envColor * (0.06 + 0.34 * fresnel) * mirrorMix;
            alpha = u_opacity;
            if (u_glassLayer < 0.5) {
                // 背面层压暗，玻璃才有体积，而不是一层膜。
                cubeColor *= 0.82;
                alpha *= 0.70;
            }
            alpha *= smoothstep(-1.0, -0.94, LocalPos.y);
        } else {
            // 镜面档：反射就是表面本身，花体只在反射强度下调时作为底色露出。
            // 不做“底 + 面”两层合成，也就不存在“透过表面看到里面一面墙”。
            cubeColor = mix(bodyColor, hitColor, mirrorMix);
            alpha = 1.0;
        }

        if (u_pass == 2) {
            // 环境反射：显示“镜面看到的东西”。
            FragColor = vec4(aces(hitColor * u_exposure), 1.0);
            return;
        }
        if (u_pass == 4) {
            FragColor = vec4(N * 0.5 + 0.5, 1.0);
            return;
        }
        FragColor = vec4(aces(cubeColor * u_exposure), alpha);
        return;
    }

    // 木台 / 石材
    vec3 color = (ambient + (1.0 - shadow) * (diffuse + specular)) * texColor;

    color = mix(color, u_fogColor, fogFactor);

    if (u_pass == 1) {
        FragColor = vec4(vec3(shadow), 1.0);
        return;
    }
    if (u_pass == 2) {
        // 环境反射视图：木台、石缘、台阶也各自输出“它反射到的环境”，整幅画面
        // 才是同一口径的反射通道，而不是只有方块变了色。粗糙面取更高的 mip。
        vec3 reflectedDir = reflect(normalize(FragPos - viewPos), norm);
        reflectedDir.y = max(reflectedDir.y, 0.0);
        float envLod = isWood ? 4.0 : 3.2;
        FragColor = vec4(aces(textureLod(envSampler, reflectedDir, envLod).rgb * u_exposure), 1.0);
        return;
    }
    if (u_pass == 3) {
        FragColor = vec4(vec3(fogFactor), 1.0);
        return;
    }
    if (u_pass == 4) {
        FragColor = vec4(norm * 0.5 + 0.5, 1.0);
        return;
    }
    if (u_pass == 5) {
        FragColor = vec4(vec3(0.0), 1.0);
        return;
    }

    // 环境捕捉存线性色：与地形、水面同一口径，采样后再统一做一次 ACES。
    if (u_envCapture > 0.5) {
        FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        return;
    }

    FragColor = vec4(aces(color * u_exposure), 1.0);
}