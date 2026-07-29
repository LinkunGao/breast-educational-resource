# Te Uma — The Breast Educational Platform

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
yarn generate     # 静态产物 -> web/.output/public
```

## Assets

影像资产由压缩流水线生成。先把源文件放到 `assets-src/modelView/`,然后:

```bash
node scripts/optimize-assets.mjs   # -> web/public/modelView/
```

流水线会把 NRRD 重编码为 gzip、用 Draco 压缩 GLB,并跳过 md5 审计认定
为占位副本的 12 个文件(见 `docs/superpowers/specs/2026-07-28-foundation-rebuild-design.md` §3.1)。

生成后的 `web/public/modelView/` 是入库的——GitHub Pages 从仓库直接构建,
没有它部署出来的站点就没有模型可加载。

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
