varying vec3 vNormalView;

void main() {
    // Transform normal to view space
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
