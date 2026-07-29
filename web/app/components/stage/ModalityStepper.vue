<script setup lang="ts">
import type { Modality, ModalityId } from '~~/content/types'

const props = defineProps<{
  modalities: Modality[]
  active: ModalityId
  slug: string
}>()

/** Ink/fill/chip-background token names and icon path per modality.
 * `chipBg` is a separate, explicit background utility (not `bg-current`)
 * for the active step's number chip -- see the template comment on why. */
const STYLE: Record<ModalityId, { ink: string, fill: string, chipBg: string, icon: string }> = {
  anatomy: {
    ink: 'text-anatomy-ink', fill: 'bg-anatomy-fill', chipBg: 'bg-anatomy-ink',
    icon: 'M12 2a7 7 0 0 0-7 7c0 3 2 5 2 8h10c0-3 2-5 2-8a7 7 0 0 0-7-7',
  },
  mammogram: {
    ink: 'text-mammogram-ink', fill: 'bg-mammogram-fill', chipBg: 'bg-mammogram-ink',
    icon: 'M4 4h16v16H4zm2 2v12h12V6z',
  },
  ultrasound: {
    ink: 'text-ultrasound-ink', fill: 'bg-ultrasound-fill', chipBg: 'bg-ultrasound-ink',
    icon: 'M12 3a9 9 0 0 1 9 9h-2a7 7 0 0 0-7-7zm0 4a5 5 0 0 1 5 5h-2a3 3 0 0 0-3-3z',
  },
  mri: {
    ink: 'text-mri-ink', fill: 'bg-mri-fill', chipBg: 'bg-mri-ink',
    icon: 'M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20m0 4a6 6 0 1 1 0 12a6 6 0 0 1 0-12',
  },
}

const activeIndex = computed(
  () => props.modalities.findIndex(m => m.id === props.active),
)

/** Left/right arrow keys move between steps (design doc §11). */
function onKeydown(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (delta === 0) return
  const next = activeIndex.value + delta
  if (next < 0 || next >= props.modalities.length) return
  event.preventDefault()
  navigateTo(`/${props.slug}/${props.modalities[next]!.id}`)
}
</script>

<template>
  <ol
    class="flex items-center gap-1 overflow-x-auto px-4 py-3"
    aria-label="Imaging modalities"
    @keydown="onKeydown"
  >
    <li v-for="(m, i) in props.modalities" :key="m.id" class="flex items-center">
      <NuxtLink
        :to="`/${props.slug}/${m.id}`"
        class="flex min-h-11 shrink-0 items-center gap-2 rounded-ctl px-3 text-body-sm
               transition-colors hover:bg-surface-sunken"
        :class="m.id === props.active
          ? [STYLE[m.id].fill, STYLE[m.id].ink, 'font-bold']
          : 'text-text-muted'"
        :aria-current="m.id === props.active ? 'step' : undefined"
      >
        <!-- `bg-current` here would resolve against this same element's
             own `color`, which `text-surface` also sets -- white background,
             white text, 1.00:1. Using an explicit `chipBg` utility instead
             of `bg-current` breaks that self-reference; the ink/white
             pairing it produces measures 5.36-8.92:1 (tokens.test.ts). -->
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded-full
                 text-caption font-bold"
          :class="m.id === props.active
            ? [STYLE[m.id].chipBg, 'text-surface']
            : 'border border-text-muted'"
          aria-hidden="true"
        >
          {{ i + 1 }}
        </span>

        <svg viewBox="0 0 24 24" class="size-4 shrink-0" aria-hidden="true">
          <path fill="currentColor" :d="STYLE[m.id].icon" />
        </svg>

        <span class="whitespace-nowrap">{{ m.label }}</span>
      </NuxtLink>

      <!-- text-muted, not border-strong: border-strong measures 1.73:1 on
           white, under the 3:1 non-text floor (default.vue's bottom-sheet
           handle documents the same failure and the same fix). -->
      <span
        v-if="i < props.modalities.length - 1"
        class="mx-1 h-px w-4 shrink-0 bg-text-muted"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
