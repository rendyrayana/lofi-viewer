export const PSX_VERT = /* glsl */`
uniform float uSnapPrecision;
uniform bool uVertexSnap;

out vec2 vUv;
out vec3 vAffineUvW; // .xy = uv*w, .z = w  →  div in frag gives affine interp
out vec3 vNormal;
out vec3 vViewPos;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = -mvPos.xyz;

  gl_Position = projectionMatrix * mvPos;

  if (uVertexSnap) {
    float snap = uSnapPrecision;
    gl_Position.xyz /= gl_Position.w;
    gl_Position.x = floor(gl_Position.x * snap + 0.5) / snap;
    gl_Position.y = floor(gl_Position.y * snap + 0.5) / snap;
    gl_Position.xyz *= gl_Position.w;
  }

  // Pre-multiply UV by clip-W; GPU interpolates this linearly,
  // then dividing by interpolated W in the fragment gives affine UVs.
  vAffineUvW = vec3(uv * gl_Position.w, gl_Position.w);
}
`;

export const PSX_FRAG = /* glsl */`
uniform bool uAffineWarp;
uniform bool uHasMap;
uniform sampler2D map;
uniform vec3 diffuse;
uniform float opacity;
uniform float uExposure;
uniform vec3 ambientLightColor;
uniform vec3 keyLightColor;
uniform vec3 keyLightDir;
uniform bool uFogEnabled;
uniform vec3 uFogColor;
uniform float uFogDensity;

in vec2 vUv;
in vec3 vAffineUvW;
in vec3 vNormal;
in vec3 vViewPos;

out vec4 fragColor;

void main() {
  vec2 texUv = uAffineWarp ? vAffineUvW.xy / vAffineUvW.z : vUv;

  vec4 col = vec4(diffuse, opacity);
  if (uHasMap) col *= texture(map, texUv);

  vec3 normal = normalize(vNormal);
  float NdotL = max(dot(normal, normalize(keyLightDir)), 0.0);
  vec3 light = ambientLightColor + keyLightColor * NdotL;

  vec3 linearCol = col.rgb * light * uExposure;

  // Exponential fog applied in linear space
  if (uFogEnabled && uFogDensity > 0.0) {
    float dist = length(vViewPos);
    float fogFactor = clamp(exp(-uFogDensity * dist), 0.0, 1.0);
    vec3 fogLinear = pow(max(uFogColor, vec3(0.0)), vec3(2.2));
    linearCol = mix(fogLinear, linearCol, fogFactor);
  }

  // Manual sRGB encoding (Three.js skips auto-encoding for GLSL3 out vars)
  vec3 srgbCol = mix(linearCol * 12.92,
                     pow(clamp(linearCol, vec3(0.0031308), vec3(1.0)), vec3(1.0/2.4)) * 1.055 - 0.055,
                     step(vec3(0.0031308), linearCol));
  fragColor = vec4(srgbCol, col.a);
}
`;

export const DITHER_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uBits: { value: 5.0 },
    uDither: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uBits;
    uniform int uDither;
    varying vec2 vUv;

    float bayer2(ivec2 p) {
      int idx = (p.y & 1) * 2 + (p.x & 1);
      if (idx == 0) return 0.0/4.0;
      if (idx == 1) return 2.0/4.0;
      if (idx == 2) return 3.0/4.0;
      return 1.0/4.0;
    }

    float bayer4(ivec2 p) {
      int x = p.x & 3, y = p.y & 3;
      int idx = y * 4 + x;
      if (idx == 0)  return 0.0/16.0;  if (idx == 1)  return 8.0/16.0;
      if (idx == 2)  return 2.0/16.0;  if (idx == 3)  return 10.0/16.0;
      if (idx == 4)  return 12.0/16.0; if (idx == 5)  return 4.0/16.0;
      if (idx == 6)  return 14.0/16.0; if (idx == 7)  return 6.0/16.0;
      if (idx == 8)  return 3.0/16.0;  if (idx == 9)  return 11.0/16.0;
      if (idx == 10) return 1.0/16.0;  if (idx == 11) return 9.0/16.0;
      if (idx == 12) return 15.0/16.0; if (idx == 13) return 7.0/16.0;
      if (idx == 14) return 13.0/16.0; return 5.0/16.0;
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float levels = pow(2.0, uBits) - 1.0;
      if (uDither != 0) {
        ivec2 coord = ivec2(gl_FragCoord.xy);
        float threshold = (uDither == 2) ? bayer2(coord) : bayer4(coord);
        color.rgb += (threshold - 0.5) / levels;
      }
      color.rgb = floor(color.rgb * levels + 0.5) / levels;
      gl_FragColor = clamp(color, 0.0, 1.0);
    }
  `,
};

export const CRT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uCurvature: { value: 0.0 },
    uVignette: { value: 0.3 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uCurvature;
    uniform float uVignette;
    varying vec2 vUv;

    vec2 barrelDistort(vec2 uv, float k) {
      vec2 p = uv * 2.0 - 1.0;
      float r2 = dot(p, p);
      p *= 1.0 + k * r2;
      return p * 0.5 + 0.5;
    }

    void main() {
      vec2 uv = vUv;
      if (uCurvature > 0.0) {
        uv = barrelDistort(uv, uCurvature * 0.3);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
      }

      vec4 color = texture2D(tDiffuse, uv);

      if (uVignette > 0.0) {
        vec2 vc = (vUv - 0.5) * 2.0;
        float v = 1.0 - dot(vc, vc) * uVignette * 0.5;
        color.rgb *= clamp(v, 0.0, 1.0);
      }

      gl_FragColor = color;
    }
  `,
};

export const FX_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uCA: { value: 0.0 },
    uGrain: { value: 0.0 },
    uTime: { value: 0.0 },
    uGrade: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform float uCA;
    uniform float uGrain;
    uniform float uTime;
    uniform int uGrade;
    uniform int uBloom;
    uniform float uBloomIntensity;
    uniform float uScanlines;
    uniform float uScanlineOpacity;
    uniform float uDPR;
    uniform float uCurvature;
    uniform float uScreenH;
    varying vec2 vUv;

    vec2 barrelDistort(vec2 uv, float k) {
      vec2 p = uv * 2.0 - 1.0;
      p *= 1.0 + k * dot(p, p);
      return p * 0.5 + 0.5;
    }

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec3 col;
      if (uCA > 0.0) {
        vec2 off = (uv - 0.5) * uCA * 0.02;
        col.r = texture2D(tDiffuse, uv + off).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - off).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      if (uGrain > 0.0) {
        float g = rand(uv + fract(uTime * 0.01)) * 2.0 - 1.0;
        col += g * uGrain * 0.08;
      }

      if (uGrade == 1) { // Warm VHS
        col = mat3(1.1,0.05,0.0, 0.0,0.95,0.0, 0.0,0.0,0.7) * col;
      } else if (uGrade == 2) { // Cold CRT
        col = mat3(0.8,0.0,0.0, 0.0,0.9,0.0, 0.1,0.1,1.2) * col;
      } else if (uGrade == 3) { // Sepia
        float lum = dot(col, vec3(0.299,0.587,0.114));
        col = vec3(lum * 1.1, lum * 0.9, lum * 0.65);
      }

      if (uBloom == 1) col += texture2D(tBloom, uv).rgb * uBloomIntensity;

      // Scanlines applied LAST so they never interact with CA sampling.
      // Use CSS-pixel granularity (divide by DPR) so they're visible on Retina.
      if (uScanlines > 0.0) {
        vec2 distUv = (uCurvature > 0.0) ? barrelDistort(vUv, uCurvature * 0.3) : vUv;
        // Only draw scanlines inside the visible image (not the clipped black border).
        if (distUv.x >= 0.0 && distUv.x <= 1.0 && distUv.y >= 0.0 && distUv.y <= 1.0) {
          float sourceY = distUv.y * uScreenH;
          float bandPx  = max(1.0, uScanlines * 8.0) * uDPR;
          float phase   = mod(sourceY, bandPx * 2.0);
          float bright  = step(bandPx, phase);
          float darkVal = 1.0 - uScanlineOpacity * 0.5;
          col *= mix(darkVal, 1.0, bright);
        }
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export const BLOOM_EXTRACT_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 bloom = max(col - uThreshold, 0.0) / (1.0 - uThreshold + 0.001);
    gl_FragColor = vec4(bloom, 1.0);
  }
`;

export const BLOOM_BLUR_FRAG = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform vec2 uOffset;
  varying vec2 vUv;
  void main() {
    vec3 col =
      texture2D(tDiffuse, vUv - uOffset * 2.0).rgb * 0.0625
    + texture2D(tDiffuse, vUv - uOffset).rgb       * 0.25
    + texture2D(tDiffuse, vUv).rgb                 * 0.375
    + texture2D(tDiffuse, vUv + uOffset).rgb       * 0.25
    + texture2D(tDiffuse, vUv + uOffset * 2.0).rgb * 0.0625;
    gl_FragColor = vec4(col, 1.0);
  }
`;
