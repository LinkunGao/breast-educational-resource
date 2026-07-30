<script setup lang="ts">
import type { Case, ModalityId, PanelId } from '~~/content/types'

/**
 * The one-up slot strip.
 *
 * This is `ModalityStepper` re-keyed from modality to SLOT. The difference
 * matters for `benign-cyst`, whose middle slot holds both the 3D mammogram
 * and the 2D ultrasound: the reader switches between those two, so the
 * ultrasound is a variant inside the mammogram tab rather than a fourth tab
 * of its own. The client's words were "有的页面可能有 2d 和 3d 的
 * mammogram，他们是不用展开的，是需要切换的，默认先显示 3d 的".
 *
 * Three-up has no use for this: each panel is labelled in place there, so a
 * strip would name the same three things twice.
 */
const props = defineProps<{
  case: Case
  activePanel: PanelId
  /**
   * The non-default modality each slot is currently showing, if any. Owned
   * by `CasePanels`; read here so a tab links to the variant its slot is
   * actually on rather than always to the 3D default.
   */
  variants: Partial<Record<PanelId, ModalityId>>
}>()

const emit = defineEmits<{ variant: [{ panel: PanelId, modality: ModalityId }] }>()

/**
 * Per-modality ink token and icon, carried over from `ModalityStepper`
 * unchanged -- including `ultrasound`, which is still drawn, just inside
 * the variant control below rather than as a tab of its own.
 *
 * Each icon draws HOW THE IMAGE IS MADE, which is the one thing that
 * actually distinguishes the four. An earlier set was abstract geometry and
 * read as exactly that: "你那三个图标有什么含义吗？完全搞不懂".
 *
 *   anatomy     a breast in profile against the chest wall -- the model
 *   mammogram   the same profile flattened between two compression plates
 *   ultrasound  a transducer and the sector it insonates
 *   mri         a stack of parallel slices through a volume
 *
 * All stroke, no fill, so they hold up at 16px and inherit the tab's own
 * colour without a second token.
 */
const STYLE: Record<ModalityId, { ink: string, paths: string[] }> = {
  anatomy: {
    ink: 'text-anatomy-ink',
    // A semicircle off a vertical chest wall, plus the nipple. Drawn as an
    // arc rather than a shallow bezier because the bezier came out as a
    // play triangle at 16px.
    paths: ['M4.5 3.5v17', 'M4.5 5.5a6.5 6.5 0 0 1 0 13', 'M11 12h3.5'],
  },
  mammogram: {
    ink: 'text-mammogram-ink',
    // The same breast, flattened between two compression plates -- which is
    // literally what a mammogram does to it, and reads against the anatomy
    // icon precisely because the two share a shape.
    paths: ['M3 6.5h18', 'M3 17.5h18', 'M4.5 9v6', 'M4.5 9c7 0 11 .9 11 3s-4 3-11 3'],
  },
  ultrasound: {
    ink: 'text-ultrasound-ink',
    // Transducer plus the sector it insonates. The sector is deliberately
    // wide and the arc inside it is what makes it read as a beam rather
    // than as a lampshade.
    paths: ['M9.5 3h5v3.5h-5z', 'M9.5 6.5 4.5 19.5h15L14.5 6.5', 'M8 14.5a6.6 6.6 0 0 1 8 0'],
  },
  mri: {
    ink: 'text-mri-ink',
    paths: ['M12 3.5 3.5 8 12 12.5 20.5 8z', 'M3.5 12 12 16.5 20.5 12', 'M3.5 16 12 20.5 20.5 16'],
  },
}

/** Each slot paired with the modality it is currently showing, so a tab's
 *  icon and link follow the reader's 3D/2D choice. */
const tabs = computed(() => props.case.panels.map((panel) => {
  const chosen = panel.modalities.find(m => m.id === props.variants[panel.id])
  return { panel, current: chosen ?? panel.modalities[0]! }
}))

/**
 * Left/right arrow keys move between SLOTS, not between modalities, so
 * `benign-cyst`'s 2D ultrasound is no longer a step the reader has to pass
 * through on the way to the MRI.
 */
function onKeydown(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  const index = props.case.panels.findIndex(p => p.id === props.activePanel)
  const next = props.case.panels[index + delta]
  if (!next) return
  event.preventDefault()
  const target = next.modalities.find(m => m.id === props.variants[next.id]) ?? next.modalities[0]!
  navigateTo(`/${props.case.slug}/${target.id}`)
}
</script>

<template>
  <!--
    A tab strip, not a numbered stepper: the order is conveyed by an `<ol>`
    read left to right with `aria-current="step"`, rather than by drawing
    numbers over it. The active tab is marked by weight, by the modality's
    own ink, and by a 2px rule on the container's bottom border, which is
    the quietest available way to say "you are here".
  -->
  <ol
    class="flex items-center gap-1 overflow-x-auto px-4"
    aria-label="Imaging modalities"
    @keydown="onKeydown"
  >
    <li v-for="t in tabs" :key="t.panel.id">
      <NuxtLink
        :to="`/${props.case.slug}/${t.current.id}`"
        class="relative flex min-h-12 shrink-0 items-center gap-2 px-3 text-body-sm
               transition-colors
               after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t-full
               after:bg-current after:transition-opacity"
        :class="t.panel.id === props.activePanel
          ? [STYLE[t.current.id].ink, 'font-bold after:opacity-100']
          : 'text-text-muted hover:text-text after:opacity-0'"
        :aria-current="t.panel.id === props.activePanel ? 'step' : undefined"
      >
        <svg
          viewBox="0 0 24 24"
          class="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path v-for="d in STYLE[t.current.id].paths" :key="d" :d="d" />
        </svg>

        <span class="whitespace-nowrap">{{ t.panel.label }}</span>

        <!--
          The 3D/2D control, on the active slot only. Shown inside the tab
          so the two readings stay adjacent, and `.prevent` because these
          buttons sit inside the tab's own NuxtLink -- without it a click
          would both emit and follow the link.
        -->
        <span
          v-if="t.panel.id === props.activePanel && t.panel.modalities.length > 1"
          data-variant
          class="ml-1 flex gap-1"
        >
          <button
            v-for="m in t.panel.modalities"
            :key="m.id"
            type="button"
            class="rounded-chip px-2 py-0.5 text-caption"
            :class="m.id === t.current.id
              ? 'bg-brand-subtle font-bold text-brand-hover'
              : 'text-text-muted hover:bg-surface-sunken'"
            :aria-pressed="m.id === t.current.id"
            @click.prevent="emit('variant', { panel: t.panel.id, modality: m.id })"
          >
            {{ m.label }}
          </button>
        </span>
      </NuxtLink>
    </li>
  </ol>
</template>
