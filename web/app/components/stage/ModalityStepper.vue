<script setup lang="ts">
import type { Modality, ModalityId } from '~~/content/types'

const props = defineProps<{
  modalities: Modality[]
  active: ModalityId
  slug: string
}>()

/** Ink/fill token names and icon path per modality. */
const STYLE: Record<ModalityId, { ink: string, fill: string, icon: string }> = {
  anatomy: {
    ink: 'text-anatomy-ink', fill: 'bg-anatomy-fill',
    icon: 'M12 2a7 7 0 0 0-7 7c0 3 2 5 2 8h10c0-3 2-5 2-8a7 7 0 0 0-7-7',
  },
  mammogram: {
    ink: 'text-mammogram-ink', fill: 'bg-mammogram-fill',
    icon: 'M4 4h16v16H4zm2 2v12h12V6z',
  },
  ultrasound: {
    ink: 'text-ultrasound-ink', fill: 'bg-ultrasound-fill',
    icon: 'M12 3a9 9 0 0 1 9 9h-2a7 7 0 0 0-7-7zm0 4a5 5 0 0 1 5 5h-2a3 3 0 0 0-3-3z',
  },
  mri: {
    ink: 'text-mri-ink', fill: 'bg-mri-fill',
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
  navigateTo(`/case/${props.slug}/${props.modalities[next]!.id}`)
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
        :to="`/case/${props.slug}/${m.id}`"
        class="flex min-h-11 shrink-0 items-center gap-2 rounded-ctl px-3 text-body-sm
               transition-colors hover:bg-surface-sunken"
        :class="m.id === props.active
          ? [STYLE[m.id].fill, STYLE[m.id].ink, 'font-bold']
          : 'text-text-muted'"
        :aria-current="m.id === props.active ? 'step' : undefined"
      >
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded-full
                 text-caption font-bold"
          :class="m.id === props.active
            ? 'bg-current text-surface'
            : 'border border-border-strong'"
          aria-hidden="true"
        >
          <span :class="m.id === props.active ? 'text-surface' : ''">{{ i + 1 }}</span>
        </span>

        <svg viewBox="0 0 24 24" class="size-4 shrink-0" aria-hidden="true">
          <path fill="currentColor" :d="STYLE[m.id].icon" />
        </svg>

        <span class="whitespace-nowrap">{{ m.label }}</span>
      </NuxtLink>

      <span
        v-if="i < props.modalities.length - 1"
        class="mx-1 h-px w-4 shrink-0 bg-border-strong"
        aria-hidden="true"
      />
    </li>
  </ol>
</template>
