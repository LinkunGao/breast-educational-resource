Overview
========

.. warning::

   This Sphinx site still describes the **Nuxt 2 application that Task 12
   deleted**. It was inherited from the heart education app this project was
   templated from, and the paths it refers to (``frontend/pages``,
   ``frontend/plugins``, ``frontend/assets``) no longer exist in this
   repository.

   The current application lives in ``web/`` and is Nuxt 4 + TypeScript +
   Tailwind 4. Until this site is rewritten, the authoritative documents are:

   - ``README.md`` at the repository root, for how to run, build and deploy it
   - ``docs/superpowers/specs/2026-07-28-foundation-rebuild-design.md``, for
     the architecture, the asset strategy and the acceptance criteria
   - ``docs/browser-pass-checklist.md``, for what still needs a human at a
     browser

This page previously consisted of a single
``.. include:: ../../../frontend/README.rst``. That file went with the rest of
the Nuxt 2 app, which turned this page from stale prose into a **Sphinx build
error** -- ``.readthedocs.yaml`` builds ``docs/source/conf.py`` on every
commit. The include is therefore removed rather than repointed: there is no
equivalent file in ``web/`` to include, and inventing one here would just
create a second place for the same drift.
