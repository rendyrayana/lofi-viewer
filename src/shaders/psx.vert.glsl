uniform float snapResolution;
uniform bool snapVertices;
uniform bool useAffineUV;

varying vec2 vUV;
varying float vW;

void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

    if (snapVertices) {
        vec2 half_res = vec2(snapResolution * 0.5);
        clip.xy = round(clip.xy / clip.w * half_res) / half_res * clip.w;
    }

    if (useAffineUV) {
        vUV = uv * clip.w;
        vW  = clip.w;
    } else {
        vUV = uv;
        vW  = 1.0;
    }

    gl_Position = clip;
}
