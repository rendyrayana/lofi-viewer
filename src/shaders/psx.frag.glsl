uniform sampler2D albedoMap;
uniform bool useDither;
uniform float ditherGamma;
uniform float exposure;
uniform float brightness;
uniform float contrast;

varying vec2 vUV;
varying float vW;

// 4x4 Bayer dither matrix (stored as floats, values / 16.0)
float bayerMatrix(int x, int y) {
    // Row 0: -4, 0, -3, 1
    // Row 1:  2,-2,  3,-1
    // Row 2: -3, 1, -4, 0
    // Row 3:  3,-1,  2,-2
    float m[16];
    m[0]  = -4.0; m[1]  =  0.0; m[2]  = -3.0; m[3]  =  1.0;
    m[4]  =  2.0; m[5]  = -2.0; m[6]  =  3.0; m[7]  = -1.0;
    m[8]  = -3.0; m[9]  =  1.0; m[10] = -4.0; m[11] =  0.0;
    m[12] =  3.0; m[13] = -1.0; m[14] =  2.0; m[15] = -2.0;
    return m[y * 4 + x] / 16.0;
}

float dither5bit(float val, float bayer) {
    // gamma correct
    float lin = pow(val, ditherGamma);
    // add bayer offset (scale to 5-bit range 0-31)
    float quantized = lin * 31.0 + bayer;
    // round and clamp
    float rounded = clamp(floor(quantized + 0.5), 0.0, 31.0);
    // de-gamma back
    return pow(rounded / 31.0, 1.0 / ditherGamma);
}

void main() {
    vec2 correctedUV = vUV / vW;
    vec4 texColor = texture2D(albedoMap, correctedUV);

    vec3 col = texColor.rgb;

    // Exposure
    col *= exposure;

    // Brightness + Contrast
    col = (col - 0.5) * contrast + 0.5 + brightness;

    if (useDither) {
        int px = int(mod(gl_FragCoord.x, 4.0));
        int py = int(mod(gl_FragCoord.y, 4.0));
        float bayer = bayerMatrix(px, py);

        col.r = dither5bit(col.r, bayer);
        col.g = dither5bit(col.g, bayer);
        col.b = dither5bit(col.b, bayer);
    }

    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, texColor.a);
}
