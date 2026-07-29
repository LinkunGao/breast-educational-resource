<script setup lang="ts">
import type { Case } from '~~/content/types'

const props = defineProps<{ case: Case }>()

const GROUP_LABEL = {
  overview: 'Overview',
  density: 'Breast Density',
  benign: 'Benign Condition',
  cancer: 'Breast Cancer',
} as const
</script>

<template>
  <header>
    <p class="text-caption font-bold uppercase tracking-wide text-text-muted">
      {{ GROUP_LABEL[props.case.group] }}
    </p>

    <div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="text-h1 font-bold text-text xl:text-display">
        {{ props.case.heading }}
      </h1>
      <span
        v-if="props.case.biRads"
        class="rounded-chip bg-brand-subtle px-2 py-0.5 text-caption font-bold text-brand-hover"
      >
        BI-RADS {{ props.case.biRads }}
      </span>
    </div>

    <!--
      Design doc §4.3: these cases have no anatomy model of their own and
      borrow the density series' model. The previous implementation hid
      this reuse; here it is stated explicitly.
    -->
    <p
      v-if="props.case.referenceDensity"
      class="mt-2 flex items-start gap-1.5 text-body-sm text-text-muted"
    >
      <svg viewBox="0 0 24 24" class="mt-0.5 size-4 shrink-0" aria-hidden="true">
        <path
          fill="currentColor"
          d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20a10 10 0 0 0 0-20"
        />
      </svg>
      <span>
        Reference density background: grade {{ props.case.referenceDensity }}
      </span>
    </p>
  </header>
</template>
