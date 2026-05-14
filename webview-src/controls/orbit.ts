// OrbitControls is set up in scene/index.ts directly (it needs the camera and
// renderer DOM element). This module exposes helpers used by interaction.ts.

import * as THREE from 'three';

export function screenToWorld(
  event: MouseEvent,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement,
): THREE.Vector3 {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const vec = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
  vec.sub(camera.position).normalize();
  return vec;
}
