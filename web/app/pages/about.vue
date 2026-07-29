<script setup lang="ts">
import { citations, FEEDBACK_FORM_URL, organisations } from '~~/content/team'

/**
 * About.
 *
 * Replaces two things at once: a two-sentence stub in this app, and the
 * legacy app's About page, which was a single 4.9MB bitmap of the whole team
 * panel with no way back to the rest of the site.
 *
 * Structured rather than reproduced -- partners, then the people, then where
 * the imaging and the model came from, all as real text with the DOIs as
 * real links. See content/team.ts for what that bitmap cost.
 */
useHead({ title: 'About — Breast Educational Resource' })

const { publicUrl } = useAssetUrl()
</script>

<template>
  <!-- A `<main>`, not a `<div>`: this page does not use the case layout (it
       has no stage and no sidebar), so nothing else on it provides the one
       main landmark every page owes. -->
  <main class="mx-auto max-w-5xl px-6 py-10 sm:px-10 sm:py-16">
    <!-- The legacy About page was a dead end: it had no way back to the app
         at all, which is the second half of the human's #13. -->
    <NuxtLink
      to="/"
      class="group inline-flex min-h-11 items-center gap-1.5 text-caption
             uppercase tracking-[0.14em] text-text-muted hover:text-brand"
    >
      <svg viewBox="0 0 24 24" class="size-3 transition-transform group-hover:-translate-x-0.5" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="m15 5-7 7 7 7" />
      </svg>
      Back to the resource
    </NuxtLink>

    <h1 class="mt-4 text-h1 font-bold tracking-tight text-text">About</h1>
    <p class="prose-medical mt-4 max-w-2xl text-body text-text-muted">
      Te Uma is an educational resource from the Auckland Bioengineering
      Institute, built with Breast Cancer Foundation NZ and Iwi United Engaged.
    </p>

    <!-- ── Partners ─────────────────────────────────────────────────────── -->
    <section class="mt-14" aria-labelledby="partners-heading">
      <h2 id="partners-heading" class="text-caption uppercase tracking-[0.14em] text-text-muted">
        Partners
      </h2>
      <ul class="mt-5 flex flex-wrap items-center gap-x-12 gap-y-8">
        <li v-for="org in organisations.filter(o => o.logo)" :key="org.name">
          <img
            :src="publicUrl(`logos/${org.logo}`)"
            :alt="org.name"
            :style="{ width: `${org.logoWidth}rem` }"
            class="h-auto max-w-full"
            loading="lazy"
          >
        </li>
      </ul>
    </section>

    <!-- ── Team ─────────────────────────────────────────────────────────── -->
    <section class="mt-14" aria-labelledby="team-heading">
      <h2 id="team-heading" class="text-caption uppercase tracking-[0.14em] text-text-muted">
        Our Team
      </h2>

      <div v-for="org in organisations" :key="org.name" class="mt-8">
        <h3 class="text-body font-bold text-text">{{ org.name }}</h3>
        <ul class="mt-4 grid grid-cols-3 gap-x-6 gap-y-6 sm:grid-cols-4 md:grid-cols-6">
          <li v-for="person in org.members" :key="person.name" class="flex flex-col items-center text-center">
            <!-- Decorative: the person's name is the very next node in the
                 accessibility tree, so an `alt` repeating it would announce
                 everyone twice. -->
            <img
              :src="publicUrl(`team/${person.photo}`)"
              alt=""
              aria-hidden="true"
              width="96"
              height="96"
              loading="lazy"
              class="size-20 rounded-full object-cover ring-1 ring-border sm:size-24"
            >
            <span class="mt-2 text-body-sm leading-snug text-text">{{ person.name }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── Sources ──────────────────────────────────────────────────────── -->
    <section class="mt-14" aria-labelledby="sources-heading">
      <h2 id="sources-heading" class="text-caption uppercase tracking-[0.14em] text-text-muted">
        Imaging and model sources
      </h2>
      <ul class="mt-5 flex flex-col gap-5">
        <li v-for="c in citations" :key="c.doi" class="max-w-3xl">
          <p class="text-body-sm font-bold text-text">{{ c.used }}</p>
          <p class="mt-1 text-body-sm leading-relaxed text-text-muted">
            {{ c.reference }}
            <!-- A real anchor. In the bitmap this was a picture of a URL. -->
            <a
              :href="c.doi"
              target="_blank"
              rel="noopener noreferrer"
              class="text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
            >{{ c.doi }}</a>
          </p>
        </li>
      </ul>
    </section>

    <!-- ── Feedback ─────────────────────────────────────────────────────── -->
    <section class="mt-14 border-t border-border pt-8">
      <p class="text-body-sm text-text-muted">
        Visit our
        <a
          :href="FEEDBACK_FORM_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="font-bold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
        >online form</a>
        to give us your valuable feedback about this app.
      </p>
    </section>
  </main>
</template>
