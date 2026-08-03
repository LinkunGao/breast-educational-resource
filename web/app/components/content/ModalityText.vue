<script setup lang="ts">
import type { Modality } from '~~/content/types'
// Imported, not auto-imported: the unit suite runs on plain Vitest with
// Nuxt's auto-imports stubbed out.
import { MODALITY_INK } from '~/utils/modalityInk'
import { layOutCopy } from './groupSentences'

const props = defineProps<{ modality: Modality }>()

const copy = computed(() => layOutCopy(props.modality.text))
</script>

<template>
  <div class="prose-medical">
    <!--
      Which panel this column is talking about.

      Not decoration: at three-up there are three canvases on screen and,
      until this line existed, nothing in the content column said which one
      the paragraph belonged to. The label is the app's own interface word
      (the same string the tab strip and the prev/next cards use) in that
      modality's own ink -- no clinical copy is involved.
    -->
    <p
      data-modality-overline
      class="flex items-center gap-2.5 text-caption font-bold uppercase tracking-[0.16em]"
      :class="MODALITY_INK[props.modality.id]"
    >
      <span class="h-px w-6 shrink-0 bg-current opacity-50" aria-hidden="true" />
      {{ props.modality.label }}
    </p>

    <!--
      The first sentence enlarged into a lede. Purely a style change -- the
      characters are untouched, and `layOutCopy` withholds the treatment
      entirely rather than setting a 269-character sentence at 20px.
    -->
    <p
      v-if="copy.lede"
      data-modality-copy
      class="mt-3.5 text-h2 font-normal leading-[1.45] tracking-[-0.012em] text-text"
      v-html="copy.lede"
    />

    <!--
      Body paragraphs in the full ink, NOT text-muted.

      Grey body copy on a near-white page is half of what read on screen as
      haze. The hierarchy here is carried by size and leading -- 20px lede
      over 16px body at 1.75 -- which is how it is carried in print, rather
      than by fading the thing the reader actually came to read.
    -->
    <p
      v-for="(para, i) in copy.body"
      :key="i"
      data-modality-copy
      class="mt-4 text-body leading-[1.75] text-text"
      v-html="para"
    />

    <!-- Reserved by the schema (global constraint): keyFacts is always [],
         so this never renders today. -->
    <ul v-if="props.modality.keyFacts.length" class="mt-5 flex flex-col gap-2">
      <li
        v-for="fact in props.modality.keyFacts"
        :key="fact"
        class="flex gap-2 text-body-sm text-text"
      >
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
        {{ fact }}
      </li>
    </ul>
  </div>
</template>
