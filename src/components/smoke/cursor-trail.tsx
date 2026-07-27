'use client';

import { useFBO } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';

import { smokeStore } from './smoke-store';

/**
 * Cursor smoke, as an actual fluid simulation.
 *
 * The previous version advected a density field along a procedural noise flow. It
 * dissipated convincingly but never *curled*, because there was no velocity field to
 * curl — the noise pushed density around, and density had no influence back. That is
 * why it read as a fading brush stroke rather than smoke.
 *
 * This is the standard GPU stable-fluids solver (Stam 1999, as popularised by Pavel
 * Dobryakov's WebGL fluid sim). Per frame, on ping-ponged float textures:
 *
 *   1. splat    — the pointer injects velocity (from its delta) and dye at its position
 *   2. curl     — measure the rotation of the velocity field
 *   3. vorticity— push velocity back along the curl gradient, amplifying eddies that
 *                 numerical diffusion would otherwise flatten out. THIS is the billow.
 *   4. divergence
 *   5. pressure — Jacobi iterations solving for a pressure field
 *   6. gradient — subtract its gradient, making velocity incompressible. THIS is what
 *                 makes the fluid roll around itself instead of just spreading.
 *   7. advect   — carry velocity along itself, then carry dye along velocity
 *
 * Steps 3 and 6 are the two the old version lacked, and between them they are the
 * entire difference between "a trail" and "smoke".
 *
 * Cost: 25 pressure iterations on a grid capped at 512px on the long edge, plus eight
 * cheap full-grid passes. Shares the page's single WebGL context rather than opening
 * its own canvas, so the moon, stars and rune gate still composite with it.
 */

/**
 * Constants taken from the reference implementation rather than tuned by eye, because
 * guessing them is what made the first attempt look like a thread instead of smoke.
 *
 * The simulation grid follows the viewport (the reference uses drawingBuffer >> 1)
 * rather than a fixed small square: a coarse grid cannot hold fine vorticity, so a
 * 128² field looks mushy no matter how the other numbers are set. Capped on the long
 * edge so cost stays bounded on weak GPUs, and aspect-preserving so the fluid stays
 * isotropic — a stretched grid makes eddies visibly oval.
 */
const SIM_MAX_EDGE = 512;
/** Jacobi iterations for the pressure solve. */
const PRESSURE_ITERATIONS = 25;
/** Vorticity confinement strength — the single biggest lever on how much it curls. */
const CURL_STRENGTH = 35;
/**
 * Per-frame multipliers at 60fps, exponentiated by dt so the look is identical on a
 * 144Hz display. 0.98 leaves dye at ~30% after one second, which is the difference
 * between smoke that hangs and a trail that blinks out.
 */
const DYE_DECAY_60 = 0.98;
const VELOCITY_DECAY_60 = 0.99;
const PRESSURE_DECAY = 0.8;
/** Gaussian splat radius in aspect-corrected UV². Five times the first attempt's. */
const SPLAT_RADIUS = 0.002;
/**
 * Pointer force. The reference works in pixels (`delta * 10`) against a half-viewport
 * grid; expressing it in grid units here makes it resolution-independent instead of
 * silently weaker on large monitors.
 */
const SPLAT_FORCE = 20;
/** Dye injected per move. Reference splats colour components around 0.06–0.36. */
const DYE_AMOUNT = 0.3;
/**
 * Frames between colour re-rolls. The reference counts pointer-move events and picks a
 * new colour every 25 of them, which is what makes the plume read as many-coloured
 * rather than one tinted cloud.
 */
const COLOR_HOLD_MOVES = 25;
/**
 * Hue advance per re-roll, as a fraction of the wheel. The golden ratio rather than
 * Math.random(): random hue lands on a near-identical colour often enough to look like
 * a bug, and the rest of this scene is deterministic on purpose so a reload looks the
 * same twice.
 */
const HUE_STEP = 0.618034;
/**
 * How much of the hovered project's accent is mixed into each new colour. Pointing at
 * a card still pulls the smoke toward its colour — it just no longer overrides it.
 */
const ACCENT_MIX = 0.3;
/**
 * Ceiling on displayed brightness, applied without touching hue. Two jobs: the plume
 * stays under the bloom threshold in smoke-canvas.tsx (glow is what made the old trail
 * read as fire), and dense cores stop clipping to white — "white smoke" was half of
 * what was wrong with the previous ramp.
 */
const DISPLAY_PEAK = 0.52;
/** Density at which the plume reaches full opacity. */
const DISPLAY_FILL = 0.3;

/*
 * Tuning guide, in order of how much each one changes the feel:
 *
 *   CURL_STRENGTH   more curl = more billowing. 35 is the reference; 60+ gets frantic.
 *   SPLAT_RADIUS    size of each puff. 0.002 reference; 0.0005 gives a thin ribbon.
 *   DYE_DECAY_60    how long it hangs. 0.98 reference; 0.995 leaves lasting clouds.
 *   SPLAT_FORCE     how hard your cursor shoves the fluid.
 *   DYE_AMOUNT      how much colour each move injects, before the display ceiling.
 *   HUE_STEP        how far apart consecutive plume colours are on the hue wheel.
 *   DISPLAY_PEAK    brightness ceiling. Raise it and the plume starts to bloom.
 *   SIM_MAX_EDGE    detail vs cost. 512 is a good laptop compromise; 256 halves the
 *                   pressure-solve cost and visibly coarsens the eddies.
 */

/**
 * Neighbour offsets are computed in the vertex shader rather than the fragment shader
 * so they interpolate for free — every pass below reads vL/vR/vT/vB.
 */
const BASE_VERT = /* glsl */ `
  precision highp float;
  uniform vec2 uTexel;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  void main() {
    vUv = uv;
    vL = uv - vec2(uTexel.x, 0.0);
    vR = uv + vec2(uTexel.x, 0.0);
    vT = uv + vec2(0.0, uTexel.y);
    vB = uv - vec2(0.0, uTexel.y);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const SPLAT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uTarget;
  uniform float uAspect;
  uniform vec3 uColor;
  uniform vec2 uPoint;
  uniform float uRadius;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspect;
    vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
    gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.0);
  }
`;

const ADVECT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity;
  uniform sampler2D uSource;
  uniform vec2 uTexel;
  uniform float uDt;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    // Semi-Lagrangian: look backwards along the velocity to find what arrives here.
    vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexel;
    gl_FragColor = texture2D(uSource, coord) * uDecay;
  }
`;

const CURL_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity;
  varying vec2 vL, vR, vT, vB;
  void main() {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    gl_FragColor = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
  }
`;

const VORTICITY_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity;
  uniform sampler2D uCurl;
  uniform float uCurlStrength;
  uniform float uDt;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  void main() {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;

    // Force points up the gradient of |curl|, scaled by the local curl — it feeds
    // energy back into eddies the solver's numerical diffusion is busy erasing.
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= uCurlStrength * C;
    force.y *= -1.0;

    vec2 vel = texture2D(uVelocity, vUv).xy + force * uDt;
    gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
  }
`;

const DIVERGENCE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uVelocity;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  void main() {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;

    // Reflect at the edges, so the fluid bounces off the viewport instead of leaking.
    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) L = -C.x;
    if (vR.x > 1.0) R = -C.x;
    if (vT.y > 1.0) T = -C.y;
    if (vB.y < 0.0) B = -C.y;

    gl_FragColor = vec4(0.5 * ((R - L) + (T - B)), 0.0, 0.0, 1.0);
  }
`;

const PRESSURE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uPressure;
  uniform sampler2D uDivergence;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
  }
`;

const GRADIENT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uPressure;
  uniform sampler2D uVelocity;
  varying vec2 vUv;
  varying vec2 vL, vR, vT, vB;
  void main() {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }
`;

const CLEAR_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uTexture;
  uniform float uValue;
  varying vec2 vUv;
  void main() { gl_FragColor = uValue * texture2D(uTexture, vUv); }
`;

const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uDye;
  uniform float uPeak;
  uniform float uFill;
  varying vec2 vUv;

  void main() {
    /**
     * The dye is now carried as colour, so display is just "show the dye" — same as the
     * reference implementation, which draws the density buffer straight to the screen.
     *
     * The previous version stored dye as a single scalar and mapped it through a fixed
     * violet -> crimson ramp here. That is why every plume came out the same two
     * colours no matter what: the colour was decided at display time, and density was
     * the only thing the fluid actually carried.
     */
    vec3 dye = texture2D(uDye, vUv).rgb;
    float density = max(max(dye.r, dye.g), dye.b);
    if (density < 0.004) discard;

    // Scale the whole triple by one factor, so capping brightness cannot shift the hue
    // or wash it out toward white the way clamping each channel would.
    vec3 col = dye * min(1.0, uPeak / max(density, 0.0001));

    gl_FragColor = vec4(col, smoothstep(0.0, uFill, density));
  }
`;

export function CursorTrail() {
  const { size } = useThree();

  // Dye at half viewport, so the plume has real edge detail when upscaled.
  const dyeW = Math.max(2, Math.round(size.width / 2));
  const dyeH = Math.max(2, Math.round(size.height / 2));

  // Velocity/pressure grid: half viewport, capped on the long edge, aspect preserved.
  const simScale = Math.min(0.5, SIM_MAX_EDGE / Math.max(size.width, size.height));
  const simW = Math.max(2, Math.round(size.width * simScale));
  const simH = Math.max(2, Math.round(size.height * simScale));

  const fbo = useMemo(
    () => ({
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  );

  const dyeA = useFBO(dyeW, dyeH, fbo);
  const dyeB = useFBO(dyeW, dyeH, fbo);
  const velA = useFBO(simW, simH, fbo);
  const velB = useFBO(simW, simH, fbo);
  const presA = useFBO(simW, simH, fbo);
  const presB = useFBO(simW, simH, fbo);
  const curlRT = useFBO(simW, simH, fbo);
  const divRT = useFBO(simW, simH, fbo);

  const dyeSwap = useRef(false);
  const velSwap = useRef(false);
  const presSwap = useRef(false);
  const prevPoint = useRef(new THREE.Vector2(0.5, 0.5));
  const seeded = useRef(false);
  const displayMaterial = useRef<THREE.ShaderMaterial>(null);

  /**
   * The colour currently being injected, plus the counter that decides when to move on
   * to the next one. Both are refs: the colour changes several times a second and no
   * part of the DOM cares, so this must never touch React state.
   */
  const dyeColor = useMemo(() => new THREE.Color(), []);
  const accentColor = useMemo(() => new THREE.Color(), []);
  const hue = useRef(0.72);
  const movesHeld = useRef(COLOR_HOLD_MOVES);

  const rollColor = useCallback(() => {
    hue.current = (hue.current + HUE_STEP) % 1;
    // Lightness under 0.6 keeps the plume a colour rather than a pastel: the reference
    // rolls all three channels independently, which averages out to something close to
    // white surprisingly often.
    dyeColor.setHSL(hue.current, 0.85, 0.55);
    accentColor.set(smokeStore.accent);
    dyeColor.lerp(accentColor, ACCENT_MIX);
  }, [accentColor, dyeColor]);

  /**
   * One offscreen scene, one quad, one material swapped per pass. Building a scene per
   * pass would allocate ten of everything for no benefit — only the shader differs.
   */
  const passes = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    mesh.frustumCulled = false;
    scene.add(mesh);

    const make = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        vertexShader: BASE_VERT,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        uniforms: { uTexel: { value: new THREE.Vector2() }, ...uniforms },
      });

    return {
      scene,
      camera,
      mesh,
      splat: make(SPLAT_FRAG, {
        uTarget: { value: null },
        uAspect: { value: 1 },
        uColor: { value: new THREE.Vector3() },
        uPoint: { value: new THREE.Vector2() },
        uRadius: { value: SPLAT_RADIUS },
      }),
      advect: make(ADVECT_FRAG, {
        uVelocity: { value: null },
        uSource: { value: null },
        uDt: { value: 0.016 },
        uDecay: { value: 1 },
      }),
      curl: make(CURL_FRAG, { uVelocity: { value: null } }),
      vorticity: make(VORTICITY_FRAG, {
        uVelocity: { value: null },
        uCurl: { value: null },
        uCurlStrength: { value: CURL_STRENGTH },
        uDt: { value: 0.016 },
      }),
      divergence: make(DIVERGENCE_FRAG, { uVelocity: { value: null } }),
      pressure: make(PRESSURE_FRAG, { uPressure: { value: null }, uDivergence: { value: null } }),
      gradient: make(GRADIENT_FRAG, { uPressure: { value: null }, uVelocity: { value: null } }),
      clear: make(CLEAR_FRAG, { uTexture: { value: null }, uValue: { value: PRESSURE_DECAY } }),
    };
  }, []);

  useFrame(({ gl }, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const simTexel = new THREE.Vector2(1 / simW, 1 / simH);
    const dyeTexel = new THREE.Vector2(1 / dyeW, 1 / dyeH);
    const aspect = size.width / size.height;

    // Reference constants are per-frame at 60fps; raising them to dt*60 makes the look
    // frame-rate independent instead of dissipating twice as fast at 120Hz.
    const frames = dt * 60;
    const dyeDecay = Math.pow(DYE_DECAY_60, frames);
    const velDecay = Math.pow(VELOCITY_DECAY_60, frames);

    const previousTarget = gl.getRenderTarget();
    const run = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) => {
      passes.mesh.material = material;
      gl.setRenderTarget(target);
      gl.render(passes.scene, passes.camera);
    };

    // Half-float targets are not guaranteed to start zeroed on every driver, and an
    // uninitialised velocity field explodes on the first pressure solve. Force the
    // clear colour to black rather than trusting the scene's — the canvas is created
    // with alpha:false, so its clear colour is not necessarily zero.
    if (!seeded.current) {
      seeded.current = true;
      const keptColor = new THREE.Color();
      gl.getClearColor(keptColor);
      const keptAlpha = gl.getClearAlpha();
      gl.setClearColor(0x000000, 0);
      for (const t of [dyeA, dyeB, velA, velB, presA, presB, curlRT, divRT]) {
        gl.setRenderTarget(t);
        gl.clear(true, false, false);
      }
      gl.setClearColor(keptColor, keptAlpha);
    }

    const vel = () => (velSwap.current ? velB : velA);
    const velOut = () => (velSwap.current ? velA : velB);
    const dye = () => (dyeSwap.current ? dyeB : dyeA);
    const dyeOut = () => (dyeSwap.current ? dyeA : dyeB);

    // ---- 1. splat -----------------------------------------------------------------
    const px = smokeStore.uv.x;
    const py = smokeStore.uv.y;
    const dx = px - prevPoint.current.x;
    const dy = py - prevPoint.current.y;
    prevPoint.current.set(px, py);

    const moved = Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5;
    if (smokeStore.pointerActive && moved) {
      const s = passes.splat.uniforms;
      s.uTexel.value = simTexel;
      s.uAspect.value = aspect;
      s.uPoint.value.set(px, py);

      // Velocity: the pointer's own movement, so the fluid is pushed the way you
      // actually moved. Converted to grid units (× the sim dimensions) so the same
      // gesture produces the same motion on a laptop and a 4K monitor — passing UV
      // deltas straight through made the effect weaker the larger the window got.
      s.uTarget.value = vel().texture;
      s.uColor.value.set(dx * simW * SPLAT_FORCE, dy * simH * SPLAT_FORCE, 1);
      run(passes.splat, velOut());
      velSwap.current = !velSwap.current;

      // Dye: an actual colour, advected as three channels. Holding one colour for a run
      // of frames and then stepping the hue is what gives the plume bands of colour —
      // re-rolling every frame would average back out to grey along the stroke.
      if (++movesHeld.current >= COLOR_HOLD_MOVES) {
        movesHeld.current = 0;
        rollColor();
      }

      s.uTexel.value = dyeTexel;
      s.uTarget.value = dye().texture;
      s.uColor.value.set(
        dyeColor.r * DYE_AMOUNT,
        dyeColor.g * DYE_AMOUNT,
        dyeColor.b * DYE_AMOUNT,
      );
      run(passes.splat, dyeOut());
      dyeSwap.current = !dyeSwap.current;
    }

    // ---- 2. curl ------------------------------------------------------------------
    passes.curl.uniforms.uTexel.value = simTexel;
    passes.curl.uniforms.uVelocity.value = vel().texture;
    run(passes.curl, curlRT);

    // ---- 3. vorticity confinement -------------------------------------------------
    const vo = passes.vorticity.uniforms;
    vo.uTexel.value = simTexel;
    vo.uVelocity.value = vel().texture;
    vo.uCurl.value = curlRT.texture;
    vo.uDt.value = dt;
    run(passes.vorticity, velOut());
    velSwap.current = !velSwap.current;

    // ---- 4. divergence ------------------------------------------------------------
    passes.divergence.uniforms.uTexel.value = simTexel;
    passes.divergence.uniforms.uVelocity.value = vel().texture;
    run(passes.divergence, divRT);

    // ---- 5. pressure --------------------------------------------------------------
    // Decay rather than zero: carrying part of last frame's pressure in as the initial
    // guess is what lets 18 Jacobi iterations converge as well as far more from cold.
    passes.clear.uniforms.uTexel.value = simTexel;
    passes.clear.uniforms.uTexture.value = (presSwap.current ? presB : presA).texture;
    passes.clear.uniforms.uValue.value = PRESSURE_DECAY;
    run(passes.clear, presSwap.current ? presA : presB);
    presSwap.current = !presSwap.current;

    const pr = passes.pressure.uniforms;
    pr.uTexel.value = simTexel;
    pr.uDivergence.value = divRT.texture;
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      pr.uPressure.value = (presSwap.current ? presB : presA).texture;
      run(passes.pressure, presSwap.current ? presA : presB);
      presSwap.current = !presSwap.current;
    }

    // ---- 6. subtract the pressure gradient ----------------------------------------
    const gr = passes.gradient.uniforms;
    gr.uTexel.value = simTexel;
    gr.uPressure.value = (presSwap.current ? presB : presA).texture;
    gr.uVelocity.value = vel().texture;
    run(passes.gradient, velOut());
    velSwap.current = !velSwap.current;

    // ---- 7. advect ----------------------------------------------------------------
    const ad = passes.advect.uniforms;
    ad.uDt.value = dt;

    ad.uTexel.value = simTexel;
    ad.uVelocity.value = vel().texture;
    ad.uSource.value = vel().texture;
    ad.uDecay.value = velDecay;
    run(passes.advect, velOut());
    velSwap.current = !velSwap.current;

    // Dye advects against the SIM texel scale, not its own: velocity is expressed in
    // simulation grid units, and dividing it by the dye's finer texels would move the
    // dye a fraction of the distance the fluid actually travelled.
    ad.uTexel.value = simTexel;
    ad.uVelocity.value = vel().texture;
    ad.uSource.value = dye().texture;
    ad.uDecay.value = dyeDecay;
    run(passes.advect, dyeOut());
    dyeSwap.current = !dyeSwap.current;

    gl.setRenderTarget(previousTarget);

    if (displayMaterial.current) {
      displayMaterial.current.uniforms.uDye.value = dye().texture;
    }
  });

  const displayUniforms = useMemo(
    () => ({
      uDye: { value: null as THREE.Texture | null },
      uPeak: { value: DISPLAY_PEAK },
      uFill: { value: DISPLAY_FILL },
      uTexel: { value: new THREE.Vector2() },
    }),
    [],
  );

  return (
    // Drawn last, in front of everything, at exactly viewport size.
    <mesh renderOrder={10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={displayMaterial}
        uniforms={displayUniforms}
        vertexShader={BASE_VERT}
        fragmentShader={DISPLAY_FRAG}
        transparent
        depthWrite={false}
        depthTest={false}
        // NormalBlending, not Additive. Additive can only brighten what is behind it,
        // which is what made the old trail glow like flame. Smoke occludes.
        blending={THREE.NormalBlending}
      />
    </mesh>
  );
}
