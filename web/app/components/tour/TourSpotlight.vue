<script setup lang="ts">
/**
 * The ROI reticle drawn over the current target.
 *
 * Four corner brackets, the way a radiologist marks a region of interest --
 * not a glowing box that smothers the edge it frames. Purely an overlay: it
 * never touches the target element, so nothing about the app's own layout,
 * stacking or canvas sizing changes while the tour runs. Positioning is
 * viewport-fixed because the rect handed in comes from getBoundingClientRect.
 */
const props = defineProps<{
  rect: DOMRect | null
  /** Uppercase label above the top-left bracket. Optional: a centred step
   *  with no target has nothing to name. */
  label?: string
  /** Keys the scan-line sweep so it replays once per STEP, not on every
   *  scroll/resize remeasurement of the same target's rect. */
  stepId?: string
}>()

const OFFSET = 6 // brackets float just outside the target rect
const STROKE = '1.5px'

/** Arm length scales with the target so it reads at small sizes without
 *  swallowing large ones: 18% of the shorter side, clamped to [14, 28]px. */
const armLen = computed(() => {
  if (!props.rect) return 18
  const short = Math.min(props.rect.width, props.rect.height)
  return Math.round(Math.min(28, Math.max(14, short * 0.18)))
})

/** A dark contact shadow plus the accent's own soft glow -- the pair is what
 *  keeps the bracket visible on both a dark MRI slice and a white sidebar,
 *  not the accent colour alone (that measures under 3:1 on white). */
const glow = 'drop-shadow(0 0 1px var(--hud-base)) drop-shadow(0 0 1px var(--hud-base)) drop-shadow(0 0 6px rgb(224 166 232 / .55))'

const corners = computed(() => {
  const len = `${armLen.value}px`
  const base = { width: len, height: len, borderColor: 'var(--hud-accent)', borderStyle: 'solid' as const, filter: glow }
  return [
    { name: 'tl', style: { ...base, top: `-${OFFSET}px`, left: `-${OFFSET}px`, borderWidth: `${STROKE} 0 0 ${STROKE}` } },
    { name: 'tr', style: { ...base, top: `-${OFFSET}px`, right: `-${OFFSET}px`, borderWidth: `${STROKE} ${STROKE} 0 0` } },
    { name: 'bl', style: { ...base, bottom: `-${OFFSET}px`, left: `-${OFFSET}px`, borderWidth: `0 0 ${STROKE} ${STROKE}` } },
    { name: 'br', style: { ...base, bottom: `-${OFFSET}px`, right: `-${OFFSET}px`, borderWidth: `0 ${STROKE} ${STROKE} 0` } },
  ]
})
</script>

<template>
  <div
    v-if="props.rect"
    data-tour-halo
    aria-hidden="true"
    class="pointer-events-none fixed z-40"
    :style="{
      top: `${props.rect.top}px`,
      left: `${props.rect.left}px`,
      width: `${props.rect.width}px`,
      height: `${props.rect.height}px`,
    }"
  >
    <!-- Target name. Dark text-shadow doubles as the same on-any-background
         trick as the brackets' drop-shadow pair. -->
    <p
      v-if="props.label"
      class="absolute left-0 -top-6 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.16em]"
      :style="{ color: 'var(--hud-ink)', textShadow: '0 0 1px var(--hud-base), 0 1px 3px var(--hud-base)' }"
    >
      {{ props.label }}
    </p>

    <span
      v-for="corner in corners"
      :key="corner.name"
      class="absolute"
      :style="corner.style"
    />

    <!-- One top-to-bottom pass on open, not a loop -- motion-safe gated, and
         keyed to the step so scroll/resize remeasurement never replays it. -->
    <span
      :key="props.stepId"
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-0 motion-safe:animate-[tour-scan_3.6s_ease-out_1]"
      style="background: linear-gradient(90deg, transparent, var(--hud-accent), transparent);
             filter: drop-shadow(0 0 4px var(--hud-accent));"
    />
  </div>
</template>
