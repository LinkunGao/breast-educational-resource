<script setup lang="ts">
import type { Modality } from '~~/content/types'
import { splitLede } from './splitLede'

const props = defineProps<{ modality: Modality }>()

const parts = computed(() => splitLede(props.modality.text))

/** Design doc §6.1: collapse past 3 paragraphs. Every current paragraph is a
 * single block of copy, so this is always false today -- the disclosure
 * button exists for whenever a modality's text grows past that. */
const needsDisclosure = computed(() => parts.value.rest.length > 2)
const expanded = ref(false)
</script>

<template>
  <div class="prose-medical">
    <!-- The first sentence enlarged into a lede. Purely a style change --
         the characters are untouched. -->
    <p class="text-h2 font-normal leading-normal text-text" v-html="parts.lede" />

    <template v-if="!needsDisclosure || expanded">
      <p
        v-for="(para, i) in parts.rest"
        :key="i"
        class="mt-4 text-body text-text-muted"
        v-html="para"
      />
    </template>

    <button
      v-if="needsDisclosure"
      type="button"
      class="mt-3 min-h-11 text-body-sm font-bold text-brand hover:text-brand-hover"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show less' : 'Read the full description' }}
    </button>

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
