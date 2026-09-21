varying vec3 vNormalView;

void main() {
    vec3 n = normalize(vNormalView);

    // Key light direction (view space)
    vec3 keyDir = normalize(vec3(-0.4, 0.8, 0.5));
    float keyDiff = max(dot(n, keyDir), 0.0);

    // Fill light
    vec3 fillDir = normalize(vec3(0.7, 0.2, 0.5));
    float fillDiff = max(dot(n, fillDir), 0.0) * 0.22;

    // Fake AO based on view-space normal z
    float ao = mix(0.42, 1.0, pow(abs(n.z), 0.4));

    // Clay base color
    vec3 clayColor = vec3(0.76, 0.72, 0.68);

    // Combine
    vec3 col = clayColor * (keyDiff + fillDiff) * ao;

    // Ambient
    col += clayColor * 0.18;

    col = clamp(col, 0.0, 1.0);
    gl_FragColor = vec4(col, 1.0);
}
