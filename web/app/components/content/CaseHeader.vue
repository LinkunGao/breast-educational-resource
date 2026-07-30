<script setup lang="ts">
import { CASE_GROUP_LABEL } from '~~/content/cases'
import type { Case } from '~~/content/types'
import { GROUP_INK } from '~/utils/groupInk'

const props = defineProps<{ case: Case }>()

// The overline takes the group's own colour (utils/groupInk.ts), so the
// page title carries the same mark as the sidebar heading the reader chose
// it from.
</script>

<template>
  <header>
    <p
      class="text-caption font-bold uppercase tracking-wide"
      :class="GROUP_INK[props.case.group]"
    >
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
