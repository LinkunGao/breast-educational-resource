# Breast Educational Resource (Te Uma)

[![Read the Docs][readthedocs]][readthedocs-url]

A Nuxt 4 application for Auckland Bioengineering Institute's breast education
research. The app lives in `web/`; the Nuxt 2 app that preceded it was removed
once `web/` reached parity, and remains in git history.

## Development

```bash
cd web
yarn install
yarn dev          # http://localhost:3158
yarn test         # Vitest
yarn generate     # static build -> web/.output/public
```

## Assets

Imaging assets are produced by a compression pipeline. Put the uncompressed
sources under `assets-src/modelView/`, then:

```bash
node scripts/optimize-assets.mjs   # -> web/public/modelView/
```

The pipeline re-encodes NRRD volumes as gzip, compresses GLB geometry with
Draco, and skips the 12 files an md5 audit identified as placeholder copies
(see `docs/superpowers/specs/2026-07-28-foundation-rebuild-design.md` section
3.1).

The generated `web/public/modelView/` **is** committed. GitHub Pages builds
straight from the repository, so leaving it out would deploy a site with no
models to load.

The four `density*.glb` anatomy models are not authored by hand. They are
derived from `density-3` by adding and removing whole mammary lobes:

```bash
node scripts/build-density-models.mjs [--dry-run]
```

Team portraits for the About page are cut out of the legacy composite sheet:

```bash
node scripts/extract-team-photos.mjs [--dry-run]
```

## Deployment

### GitHub Pages

`.github/workflows/deploy_on_github_pages.yml` builds `web/` and publishes
`web/.output/public` to the `gh-pages` branch. It runs on a new release, or
on demand from the Actions tab (`Run workflow`). The site is served under
`/breast-educational-resource/`, which the workflow passes as
`NUXT_APP_BASE_URL`.

### Docker

```bash
docker compose up --build   # http://localhost:3158
```

Builds `web/` and serves the Nitro output with Node.

## Work with docs

You can write the docs with `reStructuredText` in .rst or `markdown` in .md format.

```sh
cd docs
# After you edit the docs, you want view it locally
# windows
./make html
# mac or linux
# make html

# install this package if you haven't installed it before
# npm i live-server -g

cd build/html

live-server
```

## Important documentation

- [Nuxt 4](https://nuxt.com/docs)
- [Tailwind CSS 4](https://tailwindcss.com/docs)
- [Pinia](https://pinia.vuejs.org/)
- [Threejs](https://threejs.org/docs/)
- [Copper3d](https://github.com/LinkunGao/copper3d_visualisation)

[readthedocs]: https://img.shields.io/readthedocs/web-app-template
[readthedocs-url]: https://web-app-template.readthedocs.io/en/latest/
