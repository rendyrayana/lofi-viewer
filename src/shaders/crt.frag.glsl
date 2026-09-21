uniform sampler2D tDiffuse;
uniform float time;
uniform vec2 resolution;
uniform float grainIntensity;
uniform float vignetteDarkness;
uniform float vignetteOuterRadius;
uniform float vignetteInnerRadius;
uniform float scanlineIntensity;
uniform float chromaticAberration;
uniform float warbleAmount;
uniform float warbleSpeed;

varying vec2 vUv;

// Pseudo-random noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;

    // --- Warble ---
    float warble = sin(uv.y * 40.0 + time * warbleSpeed) * warbleAmount * 0.001;
    uv.x += warble;

    // --- Chromatic Aberration ---
    float ca = chromaticAberration * 0.005;
    vec2 uvR = uv + vec2(ca, 0.0);
    vec2 uvB = uv - vec2(ca, 0.0);

    float r = texture2D(tDiffuse, uvR).r;
    float g = texture2D(tDiffuse, uv).g;
    float b = texture2D(tDiffuse, uvB).b;
    vec3 col = vec3(r, g, b);

    // --- Scanlines ---
    float scanline = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = mix(1.0, scanline, scanlineIntensity * 0.4);
    col *= scanline;

    // --- Film Grain (luminance-weighted soft-light blend) ---
    float noise = hash(uv + fract(time * 0.03)) * 2.0 - 1.0;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    // Soft-light style blend: more effect at mid-tones
    float grainWeight = 1.0 - abs(lum * 2.0 - 1.0) * 0.5;
    col += noise * grainIntensity * 0.08 * grainWeight;

    // --- Vignette (radial) ---
    vec2 uvCenter = uv - 0.5;
    float dist = length(uvCenter);
    float vignette = smoothstep(vignetteOuterRadius, vignetteInnerRadius, dist);
    col = mix(col * (1.0 - vignetteDarkness), col, vignette);

    // --- CRT radial vignette (extra corner darkening) ---
    float crtVig = 1.0 - dot(uvCenter * 1.2, uvCenter * 1.2);
    crtVig = clamp(crtVig, 0.0, 1.0);
    crtVig = pow(crtVig, 1.5);
    col *= crtVig;

    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);
}
