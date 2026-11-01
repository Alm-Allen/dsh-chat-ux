/**
 * 纸的着色器：照 nocturne 的 core/shaders.js 逐字搬过来，一个字都没有改。
 *
 * 为什么原样搬：SURFACE 出 albedo 与法线两张图、LIGHT 在它们上面算辐照度，这是"像纸"与"一块米色"的
 * 分界（nocturne 文档第 1 节那张表）。这里的常数是按上游官方截图的亮度分布调过的——均值 112.5、
 * p50 114.7、p95 177.8——改一个数就得重新对一遍那张表，而重新对齐的代价远大于"改起来别扭"。
 *
 * 只有一处是移植时加上的 `uPaper`：低频纸纹按纸的物理尺寸缩放，理由见 nocturne 文档 3.1。
 *
 * 三个模板字符串里的注释里不许出现反引号，否则字符串会提前结束；GLSL 里本来也没有反引号
 */
export const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const NOISE = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

export const SURFACE = `#version 300 es
precision highp float;
uniform vec2 uSize; uniform float uScale; uniform float uSeed; uniform float uFold; uniform float uFelt;
uniform float uAge; uniform float uMottle; uniform float uCrinkle; uniform float uLaid; uniform float uLinen;
uniform float uPaper;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outNormal;
${NOISE}
const mat2 TURN = mat2(0.8, -0.6, 0.6, 0.8);
float relief(vec2 p) {
  vec2 q = p / uPaper;
  vec2 w = vec2(fbm(q * 0.012 + uSeed), fbm(q * 0.012 + uSeed + 9.2));
  float veins = 1.0 - abs(fbm(q * 0.02 + w * 3.0) * 2.0 - 1.0);
  float r = 0.35 * pow(veins, 6.0) + 0.35 * noise(q * vec2(0.6, 0.18)) + 0.3 * noise(p * 1.9);
  if (uFelt > 0.0) {
    vec2 q = TURN * p;
    float tooth = 0.62 * noise(q * 0.45) + 0.38 * noise(TURN * q * 0.95 + 5.3);
    float felt = 0.7 * tooth + 0.2 * noise(q * 0.11 + 2.1) + 0.1 * noise(q * vec2(0.5, 0.12));
    r = mix(r, felt, uFelt);
  }
  float laidLines = 0.5 + 0.5 * sin(p.y * 6.2831 / 4.2);
  float chain = exp(-pow((mod(p.x, 96.0) - 48.0) / 3.2, 2.0));
  r = mix(r, r * 0.6 + laidLines * 0.18 + chain * 0.35, uLaid);
  float weave = 0.5 + 0.5 * sin(p.x * 6.2831 / 3.4) * sin(p.y * 6.2831 / 3.4);
  float slub = noise(p * vec2(0.07, 1.3));
  return mix(r, r * 0.3 + weave * 0.5 + slub * 0.35, uLinen);
}
vec3 albedo(vec2 p) {
  vec2 uv = p / uSize;
  vec2 q = p / uPaper;
  float mottle = fbm(q * 0.006 + uSeed) * 0.65 + fbm(q * 0.022 + uSeed * 2.0) * 0.35;
  vec3 tint = mix(vec3(1.0, 0.985, 0.95), vec3(0.86, 0.74, 0.55), smoothstep(0.35, 0.8, mottle) * 0.85);
  vec3 base = mix(vec3(1.0), tint, uMottle);
  vec3 tone = vec3(1.0);
  float edge = min(min(uv.x, 1.0 - uv.x) * uSize.x, uv.y * uSize.y);
  float ragged = edge + (fbm(q * 0.05 + 3.0) - 0.5) * 26.0;
  tone *= mix(vec3(1.0), vec3(0.62, 0.45, 0.28), (1.0 - smoothstep(0.0, 46.0, ragged)) * 0.85);
  vec2 cell = floor(p / 70.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(float(i), float(j));
      if (hash12(c + uSeed) > 0.16) continue;
      vec2 centre = (c + vec2(hash12(c + 1.7), hash12(c + 4.1))) * 70.0;
      float radius = mix(1.5, 6.5, hash12(c + 8.3));
      float spot = 1.0 - smoothstep(radius * 0.4, radius * 2.4, length(p - centre));
      tone *= mix(vec3(1.0), vec3(0.8, 0.62, 0.45), spot * 0.7);
    }
  }
  float tide = smoothstep(0.015, 0.0, abs(fbm(q * 0.004 + uSeed + 31.0) - 0.58));
  tone *= mix(vec3(1.0), vec3(0.82, 0.7, 0.52), tide * 0.35);
  float fold = (p.y - uFold) / 2.5;
  tone *= 1.0 - 0.08 * exp(-fold * fold) + 0.03 * exp(-(fold - 2.2) * (fold - 2.2));
  float chainTone = exp(-pow((mod(p.x, 96.0) - 48.0) / 3.2, 2.0));
  base *= 1.0 - uLaid * (0.03 * chainTone + 0.005 * (0.5 + 0.5 * sin(p.y * 6.2831 / 4.2)));
  base *= 1.0 - uLinen * 0.02 * (0.5 + 0.5 * sin(p.x * 6.2831 / 3.4) * sin(p.y * 6.2831 / 3.4));
  if (uFelt > 0.0) {
    vec2 q = TURN * p;
    float threads = smoothstep(0.86, 0.97, noise(q * vec2(0.06, 1.1) + uSeed));
    threads += smoothstep(0.86, 0.97, noise(TURN * q * vec2(1.1, 0.06) + 3.0));
    base *= 1.0 - uFelt * 0.035 * min(1.0, threads);
  }
  return base * mix(vec3(1.0), tone, uAge);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uScale - gl_FragCoord.y) / uScale;
  float e = 0.9;
  float h0 = relief(p);
  float slope = 1.2 + 3.0 * uCrinkle;
  vec3 n = normalize(vec3(-(relief(p + vec2(e, 0.0)) - h0) * slope, -(relief(p + vec2(0.0, e)) - h0) * slope, 1.0));
  outAlbedo = vec4(albedo(p), 1.0);
  outNormal = vec4(n.xy * 0.5 + 0.5, 0.0, 1.0);
}`;

export const LIGHT = `#version 300 es
precision highp float;
uniform sampler2D uAlbedo; uniform sampler2D uNormal;
uniform vec2 uSize; uniform float uScale; uniform int uSource;
uniform vec3 uLightPos; uniform vec3 uLightDir; uniform vec2 uCone; uniform float uExposure;
uniform vec4 uWindow; uniform vec4 uPanes; uniform vec3 uTint; uniform float uLamp;
uniform float uAmbient; uniform vec3 uAmbientTint; uniform float uRelief; uniform float uCrinkle;
uniform float uGrain; uniform float uTime; uniform float uSoft;
out vec4 outColor;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float between(float offset, float cell, float bar, float soft) {
  float t = offset / cell;
  return smoothstep(bar - soft, bar + soft, abs(t - round(t)) * cell);
}
float gobo(vec2 p) {
  float soft = max(0.5, uPanes.z);
  p.x -= (p.y - uWindow.y) * uPanes.w;
  vec2 d = p - uWindow.xy;
  vec2 inside = smoothstep(-soft, soft, uWindow.zw * 0.5 - abs(d));
  vec2 pane = uWindow.zw / uPanes.xy;
  float bar = clamp(0.04 * min(pane.x, pane.y), 4.0, 16.0);
  float open = between(d.x + uWindow.z * 0.5, pane.x, bar, soft) * between(d.y + uWindow.w * 0.5, pane.y, bar, soft);
  return inside.x * inside.y * (0.3 + 0.7 * open);
}
const float BULB = 30.0;
float irradiance(vec3 P, vec3 n) {
  // 3 是静止的漫射光：没有灯座、没有光锥、没有热点，只有一片从纸心散开的柔光。
  // 它不看光标、不看时间，同一个纸样永远算出同一张图——所以这一路只在纸纹重建时算一次，
  // 打字、滚动、切会话都不会再惊动它。椭圆而不是圆：纸是横的，等比扩散会像一块圆斑
  if (uSource == 3) {
    vec2 centre = P.xy / uSize - vec2(0.5, 0.44);
    float reach = length(centre * vec2(0.95, 1.30));
    return mix(1.0, 0.52, smoothstep(0.04, 1.05, reach));
  }
  if (uSource == 2) return max(0.0, dot(n, -uLightDir)) * gobo(P.xy);
  vec3 d = P - uLightPos; float d2 = max(1.0, dot(d, d)); vec3 r = d * inversesqrt(d2);
  float near = uSoft * (1.0 - smoothstep(0.0, 260.0, sqrt(d2)));
  float cone = smoothstep(uCone.x - 0.3 * near, uCone.y, dot(r, uLightDir));
  return cone * max(0.0, -dot(n, r)) / (d2 + uSoft * BULB * BULB);
}
void main() {
  ivec2 texel = ivec2(gl_FragCoord.xy);
  vec3 albedo = texelFetch(uAlbedo, texel, 0).rgb;
  vec2 nxy = texelFetch(uNormal, texel, 0).xy * 2.0 - 1.0;
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uScale - gl_FragCoord.y) / uScale;
  float lit = (1.0 - exp(-irradiance(vec3(p, 0.0), vec3(0.0, 0.0, 1.0)) * uExposure)) * uLamp;
  vec2 uv = p / uSize;
  float vignette = smoothstep(0.15, 1.1, length((uv - vec2(0.5, 0.55)) * vec2(1.0, 1.15)));
  // 这一项是灯亮着时压给环境光的那一点暗角。nocturne 的 0.3 配的是一盏罩住半个屏幕的灯，
  // 换成圆形光斑之后那三成正好落在唯一还亮着的地方，于是边角整片发闷。一路降到 0.04
  float ambient = mix(1.0, uAmbient * (1.0 - 0.04 * vignette), uLamp);
  vec3 irr = uAmbientTint * ambient + (1.0 - ambient) * lit * uTint;
  float relief = uRelief * (1.0 - 0.4 * lit);
  float bound = (0.16 * uCrinkle + 0.04) * relief;
  irr *= clamp(1.0 + (-nxy.x * 0.35 - nxy.y * 0.55) * (0.6 + 2.2 * uCrinkle) * relief, 1.0 - bound, 1.0 + bound);
  irr *= mix(0.9, 1.0, smoothstep(0.0, 28.0, min(uv.x, 1.0 - uv.x) * uSize.x));
  float g = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
  outColor = vec4(clamp(albedo * irr + g * (uGrain * 0.045 + 1.5 / 255.0), 0.0, 1.0), 1.0);
}`;
