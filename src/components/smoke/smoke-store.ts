/**
 * Shared mutable state between the DOM and the WebGL smoke field.
 *
 * A plain module object, deliberately not React state or context: scroll position
 * and pointer position change every frame, and putting them through React would
 * re-render the whole tree 60 times a second. The canvas reads these inside
 * useFrame; DOM components write to them directly.
 */
export const smokeStore = {
  /** Page scroll progress, 0 at the top, 1 at the bottom. */
  scroll: 0,
  /** Normalised pointer position, -1..1 on both axes. Used for scene parallax. */
  pointer: { x: 0, y: 0 },
  /**
   * Pointer in texture space: 0..1, with y=0 at the BOTTOM to match GL convention.
   * This is what the cursor trail splats at, so it must be in the same space as the
   * framebuffer it writes into.
   */
  uv: { x: 0.5, y: 0.5 },
  /** True once the pointer has actually moved, so no trail is splatted at 0,0. */
  pointerActive: false,
  /**
   * Accent the smoke is currently tinted toward. Hovering a project pushes its
   * colour into the field — this replaces the floating panels as the way the
   * background responds to what you are pointing at.
   */
  accent: '#A855F7',
  /** 0..1 energy spike, decays on its own. Raised on hover and click. */
  surge: 0,
};

export function surge(amount = 1) {
  smokeStore.surge = Math.min(1, smokeStore.surge + amount);
}

export function setAccent(hex: string | null | undefined) {
  smokeStore.accent = hex || '#A855F7';
}
