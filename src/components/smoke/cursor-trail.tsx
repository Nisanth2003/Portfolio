'use client';

import { useFBO } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { smokeStore } from './smoke-store';

/**
 * Smoke that trails the cursor.
 *
 * This is a two-target ping-pong simulation, not a particle system. Each frame:
 *
 *   1. Sample the previous frame slightly *offset* along a flow field — that
 *      displacement is the advection, and it is what makes the trail rise and curl
 *      after the cursor has gone rather than just fading in place.
 *   2. Multiply by a decay constant so old smoke dissipates.
 *   3. Blur slightly, so it spreads as it ages.
 *   4. Additively splat a soft brush along the segment from the previous cursor
 *      position to the current one.
 *
 * Splatting along a *segment* rather than at a point is the detail that matters: at
 * 60fps a fast flick moves the cursor hundreds of pixels between frames, and a point
 * splat would leave a dotted line instead of a continuous ribbon.
 *
 * Cost is two fullscreen texture reads at half resolution — far cheaper than the
 * layered noise it sits on top of.
 */

const SIM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SIM_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrev;
  uniform vec2 uMouse;
  uniform vec2 uPrevMouse;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uTime;
  uniform float uDecay;
  uniform float uRadius;
  uniform float uStrength;
  uniform float uActive;

  varying vec2 vUv;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  /** Distance from p to the segment ab. Gives a continuous brush along cursor travel. */
  float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  void main() {
    vec2 uv = vUv;

    // Flow field. Rise is deliberately weak and swirl is strong: smoke spreads and
    // curls outward, whereas fire climbs in a column. Getting this ratio wrong is
    // most of what makes a trail read as flame.
    //
    // Pushed further that way. Two swirl octaves at different scales instead of one,
    // so the plume folds over itself rather than shearing uniformly, and the upward
    // term is down from 0.5 to 0.28 — the previous value was enough of a column to
    // still register as a flicker.
    float swirl = noise(uv * 3.2 + uTime * 0.15) - 0.5;
    swirl += (noise(uv * 7.4 - uTime * 0.09) - 0.5) * 0.6;
    vec2 flow = vec2(swirl * 3.4, 0.28);

    // Sampling *behind* the flow direction is what moves the smoke forward.
    vec2 src = uv - flow * uTexel * 1.1;

    // Wide 4-tap blur while advecting, so wisps billow and dissolve rather than
    // holding a hard edge like a brush stroke.
    float prev = texture2D(uPrev, src).r * 0.36;
    prev += texture2D(uPrev, src + vec2(uTexel.x * 2.6, 0.0)).r * 0.16;
    prev += texture2D(uPrev, src - vec2(uTexel.x * 2.6, 0.0)).r * 0.16;
    prev += texture2D(uPrev, src + vec2(0.0, uTexel.y * 2.6)).r * 0.16;
    prev += texture2D(uPrev, src - vec2(0.0, uTexel.y * 2.6)).r * 0.16;

    float trail = prev * uDecay;

    // Aspect-corrected space, or the brush would be an ellipse on a wide viewport.
    vec2 p = vec2(uv.x * uAspect, uv.y);
    vec2 a = vec2(uPrevMouse.x * uAspect, uPrevMouse.y);
    vec2 b = vec2(uMouse.x * uAspect, uMouse.y);

    float d = segmentDistance(p, a, b);
    float brush = exp(-(d * d) / (uRadius * uRadius)) * uStrength * uActive;

    trail += brush;

    gl_FragColor = vec4(clamp(trail, 0.0, 1.5), 0.0, 0.0, 1.0);
  }
`;

/**
 * Clip-space quad. This must map uv 1:1 to the viewport, because the simulation
 * splats at screen UV — any mismatch and the smoke appears offset from the cursor
 * that drew it.
 */
const DISPLAY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const DISPLAY_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uTrail;
  uniform vec3 uAsh;
  uniform vec3 uViolet;
  uniform vec3 uEmber;
  uniform vec3 uAccent;
  uniform float uTime;

  varying vec2 vUv;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    float t = texture2D(uTrail, vUv).r;
    if (t < 0.004) discard;

    // Three grain scales now. The extra coarse octave gives the plume large soft
    // lumps instead of an even speckle, which is most of what separates "smoke" from
    // "airbrushed gradient" at a glance.
    float grain = noise(vUv * 9.0 - uTime * 0.09) * 0.30 + 0.76;
    grain *= noise(vUv * 22.0 + uTime * 0.3) * 0.30 + 0.74;
    grain *= noise(vUv * 58.0 - uTime * 0.18) * 0.26 + 0.84;
    float d = t * grain;

    /**
     * Purple ramp, coldest where it is thinnest.
     *
     *   thin  -> uAsh     near-black violet, the dissipating edge
     *   mid   -> uViolet  dark purple, the body of the plume
     *   dense -> uEmber   deep crimson-purple, only in the newest smoke
     *
     * The direction of that ramp is the whole trick. Fire is bright and hot in the
     * middle and dims outward; smoke is densest and *darkest* where it just left the
     * source. Every colour here is darker than the accent it replaced, and none of
     * them reaches the bloom threshold, so nothing can bloom into a flame.
     */
    vec3 col = mix(uAsh, uViolet, smoothstep(0.05, 0.55, d));
    col = mix(col, uEmber, smoothstep(0.62, 1.25, d));

    // A trace of the hovered project's colour, kept low so a warm accentColour on a
    // card cannot drag the plume back toward orange.
    col = mix(col, uAccent, 0.10);

    // Slightly more opaque than before, because the colours are now much darker —
    // this occludes the sky rather than lighting it. Still capped well under the
    // bloom threshold in smoke-canvas.tsx.
    float alpha = smoothstep(0.015, 0.46, d) * 0.55;
    gl_FragColor = vec4(col, alpha);
  }
`;

export function CursorTrail() {
  const { size } = useThree();

  // Half resolution: the trail is soft by nature, so full-res buys nothing visible
  // and doubles the cost of both texture reads.
  const width = Math.max(2, Math.round(size.width / 2));
  const height = Math.max(2, Math.round(size.height / 2));

  const fboSettings = useMemo(
    () => ({
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      // Half float, so decay stays smooth instead of banding into 8-bit steps.
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  );

  const targetA = useFBO(width, height, fboSettings);
  const targetB = useFBO(width, height, fboSettings);

  const swap = useRef(false);
  const prevMouse = useRef(new THREE.Vector2(0.5, 0.5));
  const displayMaterial = useRef<THREE.ShaderMaterial>(null);

  const accent = useMemo(() => new THREE.Color('#A855F7'), []);
  const accentTarget = useMemo(() => new THREE.Color('#A855F7'), []);

  /** The simulation pass lives in its own scene with its own camera, rendered by
   *  hand into a framebuffer — it never appears in the main scene graph. */
  const sim = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: SIM_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: null as THREE.Texture | null },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uTexel: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uDecay: { value: 0.965 },
        // Brush sigma in aspect-corrected units. Wider and softer again: a broad
        // low-strength puff spreads into a plume, where a tight strong one stays a
        // drawn line no matter what the flow field does to it. Strength comes down
        // with the slower decay, or density accumulates into a solid blob.
        uRadius: { value: 0.058 },
        uStrength: { value: 0.5 },
        uActive: { value: 0 },
      },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, camera, material };
  }, []);

  useFrame(({ gl }, delta) => {
    const d = Math.min(delta, 0.05);
    const u = sim.material.uniforms;

    const read = swap.current ? targetB : targetA;
    const write = swap.current ? targetA : targetB;

    u.uPrev.value = read.texture;
    u.uTime.value += d;
    u.uTexel.value.set(1 / width, 1 / height);
    u.uAspect.value = size.width / size.height;

    u.uPrevMouse.value.copy(prevMouse.current);
    u.uMouse.value.set(smokeStore.uv.x, smokeStore.uv.y);
    prevMouse.current.set(smokeStore.uv.x, smokeStore.uv.y);

    // Ease in rather than snapping on, so the first frame after load does not stamp
    // a blob wherever the cursor happens to be.
    const wanted = smokeStore.pointerActive ? 1 : 0;
    u.uActive.value += (wanted - u.uActive.value) * Math.min(1, d * 6);

    // Frame-rate independent decay: a fixed per-frame multiplier would dissipate at
    // different speeds on 60Hz and 144Hz displays.
    //
    // 0.02^seconds leaves a wisp at ~10% after 0.6s, against ~3% at the old 0.003.
    // Smoke hangs and thins; a fast burn-off is a flame guttering. Slower than this
    // and fast cursor movement smears the screen into a purple wash.
    u.uDecay.value = Math.pow(0.02, d);

    const previousTarget = gl.getRenderTarget();
    gl.setRenderTarget(write);
    gl.render(sim.scene, sim.camera);
    gl.setRenderTarget(previousTarget);

    swap.current = !swap.current;

    if (displayMaterial.current) {
      displayMaterial.current.uniforms.uTrail.value = write.texture;
      displayMaterial.current.uniforms.uTime.value += d;
      accentTarget.set(smokeStore.accent);
      accent.lerp(accentTarget, Math.min(1, d * 3));
    }
  });

  const displayUniforms = useMemo(
    () => ({
      uTrail: { value: null as THREE.Texture | null },
      // Dark purple -> purple -> crimson-purple. Read the ramp in DISPLAY_FRAG.
      uAsh: { value: new THREE.Color('#1B0F2E') },
      uViolet: { value: new THREE.Color('#4C1D95') },
      uEmber: { value: new THREE.Color('#7A1F4B') },
      uAccent: { value: accent },
      uTime: { value: 0 },
    }),
    [accent],
  );

  return (
    // Drawn last, in front of everything, at exactly viewport size.
    <mesh renderOrder={10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={displayMaterial}
        uniforms={displayUniforms}
        vertexShader={DISPLAY_VERT}
        fragmentShader={DISPLAY_FRAG}
        transparent
        depthWrite={false}
        depthTest={false}
        // NormalBlending, not Additive. Additive can only ever brighten what is
        // behind it, which is why the trail glowed like flame no matter how much the
        // colour was toned down. Smoke occludes; it does not add light.
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}
