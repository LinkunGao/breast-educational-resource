<script setup lang="ts">
import type { Modality } from '~~/content/types'
import { splitLede } from './splitLede'

const props = defineProps<{ modality: Modality }>()

const parts = computed(() => splitLede(props.modality.text))
</script>

<template>
  <div class="prose-medical">
    <!-- The first sentence enlarged into a lede. Purely a style change --
         the characters are untouched. -->
    <p class="text-h2 font-normal leading-normal text-text" v-html="parts.lede" />

    <p
      v-for="(para, i) in parts.rest"
      :key="i"
      class="mt-4 text-body text-text-muted"
      v-html="para"
    />

    <!-- Reserved by the schema (global constraint): keyFacts is always [],
         so this never renders today. -->
    <ul v-if="props.modality.keyFacts.length" class="mt-4 flex flex-col gap-2">
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
