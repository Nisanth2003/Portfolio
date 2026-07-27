'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { KernelSize } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

import { CursorTrail } from './cursor-trail';
import { smokeStore } from './smoke-store';

/**
 * Night sky, moon, stars — and nothing that churns.
 *
 * The previous version ran a permanent two-layer noise field. That is what made the
 * background feel "always there": something was always moving whether you touched the
 * page or not, so it read as wallpaper rather than atmosphere. The ambient layer here
 * is a near-static gradient with a very faint slow haze; the only things that move on
 * their own are the stars twinkling. Everything else responds to you.
 */

const NOISE = /* glsl */ `
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

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }
`;

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Full-screen quad in clip space, for layers that must cover the viewport exactly.
 *
 * Sizing a plane from `viewport.width/height` only works if the mesh sits at z=0,
 * because that is the depth R3F measures. Placing such a plane further away
 * under-covers the frustum and leaves bands down the sides of the screen; placing it
 * nearer over-covers it and desynchronises its UVs from screen space. Writing clip
 * coordinates directly sidesteps both: uv maps 1:1 to the viewport at any camera
 * setting, which the cursor trail depends on to line up with the pointer.
 */
const SCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export { SCREEN_VERT };

/**
 * The sky itself: a vertical gradient from deep indigo at the zenith to near-black
 * at the horizon, plus cool moonlight spilling from the upper right and one very
 * faint drifting haze band. Deliberately quiet.
 */
const SKY_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uScroll;
  uniform float uAspect;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uMoonlight;
  uniform vec3 uAccent;

  varying vec2 vUv;

  ${NOISE}

  void main() {
    vec2 uv = vUv;

    // Night gradient. Darker low down, so text sitting over the lower page has a
    // calm floor rather than competing with sky.
    vec3 col = mix(uHorizon, uZenith, pow(uv.y, 0.85));

    // Moonlight from the upper right.
    vec2 moon = vec2(0.78, 0.86);
    float d = length((uv - moon) * vec2(uAspect, 1.0));
    col += uMoonlight * pow(max(0.0, 1.0 - d * 0.85), 3.2) * 0.34;

    // One slow haze band, very faint. Scroll advances it gently; it never churns.
    float haze = fbm(vec2(uv.x * uAspect * 1.1, uv.y * 1.6 - uTime * 0.012 - uScroll * 0.5));
    col += uMoonlight * smoothstep(0.45, 0.95, haze) * 0.075;
    col += uAccent * smoothstep(0.6, 1.0, haze) * 0.045;

    // A whisper of violet at the very bottom keeps the Solo Leveling cast.
    col += uAccent * pow(1.0 - uv.y, 7.0) * 0.09;

    float vig = smoothstep(1.45, 0.15, length((uv - 0.5) * vec2(1.02, 1.0)));
    col *= mix(0.45, 1.0, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function NightSky() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const viewport = useThree((s) => s.viewport);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uAspect: { value: 1 },
      uZenith: { value: new THREE.Color('#120C2B') },
      uHorizon: { value: new THREE.Color('#05040C') },
      uMoonlight: { value: new THREE.Color('#8CA6D8') },
      uAccent: { value: new THREE.Color('#A855F7') },
    }),
    [],
  );

  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    const d = Math.min(delta, 0.05);
    m.uniforms.uTime.value += d;
    m.uniforms.uScroll.value += (smokeStore.scroll - m.uniforms.uScroll.value) * Math.min(1, d * 2);
    m.uniforms.uAspect.value = viewport.aspect;
  });

  return (
    // Screen-space quad, drawn first and never depth-tested, so it is always exactly
    // the size of the viewport and always behind the 3D contents.
    <mesh renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={SCREEN_VERT}
        fragmentShader={SKY_FRAG}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * The moon. A sphere normal is reconstructed from the disc so it takes real lambert
 * shading and limb darkening instead of reading as a flat white circle, with faint
 * maria from noise. This is the one element that is *meant* to bloom.
 */
const MOON_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uMoon;
  uniform vec3 uShade;

  varying vec2 vUv;

  ${NOISE}

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);

    float disc = smoothstep(1.0, 0.955, r);
    if (disc <= 0.002) discard;

    // Reconstruct the sphere normal, so the moon is lit rather than flat.
    float z = sqrt(max(0.0, 1.0 - r * r));
    vec3 normal = normalize(vec3(p, z));
    vec3 lightDir = normalize(vec3(-0.35, 0.42, 0.84));
    float lambert = clamp(dot(normal, lightDir), 0.0, 1.0);

    // Maria: large soft darker plains, plus a little fine texture. Kept light —
    // heavier values dragged the disc's luminance below the bloom threshold, which is
    // why it read as a grey concrete ball with no glow at all.
    float maria = fbm(vUv * 3.4);
    float fine = fbm(vUv * 11.0);
    float surface = 1.0 - maria * 0.16 - fine * 0.06;

    // The lit side is meant to clip to near-white — a moon is the brightest thing in
    // a night sky, and it needs to sit clearly above the bloom threshold to glow.
    // The shaded limb is what carries the form, not the overall level.
    vec3 col = mix(uShade, uMoon, 0.52 + 0.48 * lambert) * surface;
    col *= 3.0;

    // Limb brightening at the edge reads as atmosphere catching the rim.
    col += uMoon * smoothstep(0.86, 1.0, r) * 0.28;

    gl_FragColor = vec4(col * disc, disc);
  }
`;

const HALO_FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uHalo;
  uniform vec3 uMoon;

  varying vec2 vUv;

  void main() {
    float r = length((vUv - 0.5) * 2.0);
    if (r > 1.0) discard;

    // Two falloffs: a tight bright corona and a wide soft bloom of scattered light.
    float corona = pow(max(0.0, 1.0 - r), 9.0);
    float scatter = pow(max(0.0, 1.0 - r), 2.2);

    vec3 col = mix(uHalo, uMoon, corona);
    float alpha = corona * 1.0 + scatter * 0.4;

    // NOT premultiplied. three.js AdditiveBlending uses blendSrc = SrcAlpha, so the
    // GPU multiplies by alpha itself — outputting col * alpha here applied it twice
    // and squared the falloff, which erased the halo entirely.
    gl_FragColor = vec4(col, alpha);
  }
`;

function Moon() {
  const group = useRef<THREE.Group>(null);

  const moonUniforms = useMemo(
    () => ({
      uMoon: { value: new THREE.Color('#F6F8FE') },
      uShade: { value: new THREE.Color('#AFB9D6') },
    }),
    [],
  );

  const haloUniforms = useMemo(
    () => ({
      uHalo: { value: new THREE.Color('#93AEE4') },
      uMoon: { value: new THREE.Color('#F2F5FC') },
    }),
    [],
  );

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const d = Math.min(delta, 0.05);
    // Rises out of frame over roughly the first 40% of the page. The canvas is fixed,
    // so without this the moon trails you all the way down and ends up sitting behind
    // section headings — it belongs to the sky at the top, not to every section.
    const targetY = 2.55 + smokeStore.scroll * 6.0;
    g.position.y += (targetY - g.position.y) * Math.min(1, d * 2);
  });

  return (
    // Pulled inward from the frame edge: the vignette dims the corners, and out at
    // 2.15 it was eating the moon's own glow.
    <group ref={group} position={[1.85, 2.55, -4]}>
      <mesh>
        <planeGeometry args={[7.5, 7.5]} />
        <shaderMaterial
          uniforms={haloUniforms}
          vertexShader={VERT}
          fragmentShader={HALO_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[1.5, 1.5]} />
        <shaderMaterial
          uniforms={moonUniforms}
          vertexShader={VERT}
          fragmentShader={MOON_FRAG}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Stars. These replaced the rising violet embers — embers drift upward and glow warm,
 * which is exactly the fire read we are trying to get away from. Stars hold position
 * and twinkle instead.
 */
const STAR_COUNT = 520;

const STAR_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  attribute float aSeed;
  attribute float aSize;
  varying float vTwinkle;
  varying float vTone;

  void main() {
    vec3 p = position;

    // Almost stationary: a slow sway, and a gentle drift with scroll for depth.
    p.x += sin(uTime * 0.06 + aSeed * 30.0) * 0.06;
    p.y += uScroll * (0.4 + aSeed * 1.6);

    // Independent twinkle rates, and never fully off.
    vTwinkle = 0.45 + 0.55 * pow(abs(sin(uTime * (0.25 + aSeed * 0.9) + aSeed * 40.0)), 2.0);
    vTone = aSeed;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uCool;
  uniform vec3 uWarm;
  varying float vTwinkle;
  varying float vTone;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    vec3 col = mix(uCool, uWarm, vTone);
    gl_FragColor = vec4(col, core * core * vTwinkle * 0.95);
  }
`;

function Stars() {
  const material = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const seeds = new Float32Array(STAR_COUNT);
    const sizes = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Deterministic scatter — no Math.random, so the sky is identical every load.
      const a = i * 2.39996; // golden angle
      const radius = 1.5 + (((i * 37) % 100) / 100) * 11;
      positions[i * 3] = Math.cos(a) * radius;
      positions[i * 3 + 1] = Math.sin(a) * radius * 0.75 + 1.0;
      positions[i * 3 + 2] = -3 - (((i * 71) % 100) / 100) * 9;
      seeds[i] = ((i * 89) % 997) / 997;
      // Mostly faint pinpricks with a few brighter ones, or it reads as confetti.
      sizes[i] = 0.75 + Math.pow(((i * 41) % 100) / 100, 3) * 3.2;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uCool: { value: new THREE.Color('#DCE6F8') },
      uWarm: { value: new THREE.Color('#C6B6E8') },
    }),
    [],
  );

  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    const d = Math.min(delta, 0.05);
    m.uniforms.uTime.value += d;
    m.uniforms.uScroll.value += (smokeStore.scroll - m.uniforms.uScroll.value) * Math.min(1, d * 2);
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={STAR_VERT}
        fragmentShader={STAR_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** The gate: a summoning circle at the entrance, fading over the first screen. */
const RUNE_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFade;
  uniform vec3 uAccent;
  uniform vec3 uSystem;

  varying vec2 vUv;

  float ring(float r, float target, float w) {
    return smoothstep(w, 0.0, abs(r - target));
  }

  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float a = atan(c.y, c.x) / 6.2831853 + 0.5;

    float mask = 0.0;
    mask += ring(r, 0.98, 0.006) * 1.2;
    mask += ring(r, 0.90, 0.003);
    mask += ring(r, 0.58, 0.004);
    mask += ring(r, 0.30, 0.010) * 0.7;
    mask += step(0.72, fract(a * 72.0 + uTime * 0.03)) * ring(r, 0.94, 0.022) * 1.4;
    mask += step(0.55, fract(a * 30.0 - uTime * 0.05)) * ring(r, 0.74, 0.045) * 0.9;
    mask += step(0.965, fract(a * 6.0 + 0.5)) * smoothstep(0.98, 0.32, r) * 0.5;
    mask *= smoothstep(1.02, 0.9, r) * uFade;

    vec3 col = mix(uAccent, uSystem, smoothstep(0.55, 1.0, r));
    // Brightness in the colour, mask in alpha only — additive blending applies alpha,
    // so folding mask into both squared it and crushed the softer rings.
    gl_FragColor = vec4(col * 2.2, mask);
  }
`;

function RuneGate() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const group = useRef<THREE.Group>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFade: { value: 1 },
      uAccent: { value: new THREE.Color('#A855F7') },
      uSystem: { value: new THREE.Color('#22D3EE') },
    }),
    [],
  );

  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (material.current) {
      material.current.uniforms.uTime.value += d;
      const fade = Math.max(0, 1 - smokeStore.scroll * 9);
      material.current.uniforms.uFade.value +=
        (fade - material.current.uniforms.uFade.value) * Math.min(1, d * 4);
    }
    if (group.current) {
      group.current.rotation.z += d * 0.035;
      group.current.position.y = -2.7 - smokeStore.scroll * 10;
    }
  });

  return (
    <group ref={group} position={[0.4, -2.7, -3]} rotation={[-1.3, 0, 0]}>
      <mesh>
        <planeGeometry args={[10, 10]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={VERT}
          fragmentShader={RUNE_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

export default function SmokeCanvas({
  paused,
  onContextLost,
}: {
  paused: boolean;
  onContextLost?: () => void;
}) {
  return (
    <Canvas
      style={{ pointerEvents: 'none' }}
      camera={{ position: [0, 0, 5], fov: 50, near: 0.1, far: 40 }}
      dpr={[1, 1.25]}
      frameloop={paused ? 'never' : 'always'}
      performance={{ min: 0.5 }}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => {
        // three.js does not re-initialise itself when a context is restored, so
        // without reporting this upward the background stays black for the rest of
        // the session after any GPU reset.
        gl.domElement.addEventListener(
          'webglcontextlost',
          (event) => {
            event.preventDefault();
            onContextLost?.();
          },
          false,
        );
      }}
    >
      <AdaptiveDpr />

      <NightSky />
      <Moon />
      <Stars />
      <RuneGate />
      {/* Drawn last, in front of the sky. Deliberately dim — see cursor-trail.tsx. */}
      <CursorTrail />

      <EffectComposer multisampling={0}>
        {/* Threshold is set above the cursor trail's peak brightness on purpose. The
            trail glowing is precisely what made it read as fire instead of smoke, so
            only the moon, stars and rune lines are allowed past this. */}
        <Bloom
          mipmapBlur
          intensity={1.25}
          luminanceThreshold={0.42}
          luminanceSmoothing={0.2}
          kernelSize={KernelSize.MEDIUM}
        />
        <Vignette offset={0.34} darkness={0.45} />
      </EffectComposer>
    </Canvas>
  );
}
