<script setup lang="ts">
import { CASE_GROUP_LABEL } from '~~/content/cases'
import type { Case } from '~~/content/types'

const props = defineProps<{ case: Case }>()
</script>

<template>
  <header>
    <p class="text-caption font-bold uppercase tracking-wide text-text-muted">
      {{ CASE_GROUP_LABEL[props.case.group] }}
    </p>

    <!--
      No BI-RADS badge and no "Reference density background: grade X" line.
      Both are gone at the client's instruction (feedback item 3, "I think we
      can remove BIRADS"). The density series carries the grade in its nav
      title instead -- see content/cases.ts.
    -->
    <h1 class="mt-1 text-h1 font-bold text-text xl:text-display">
      {{ props.case.heading }}
    </h1>
  </header>
</template>
