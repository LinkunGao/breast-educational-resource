# Te Uma 地基重铸 — 设计文档

**项目**：Breast Educational Resource (Te Uma)
**子项目**：A — 地基重铸 (Foundation Rebuild)
**日期**：2026-07-28
**状态**：待评审

---

## 1. 背景

Te Uma 是 Auckland Bioengineering Institute 的乳腺健康教育应用。当前实现是 Nuxt 2.15 / Vue 2.7（已 EOL）+ copper3d 2.1.2，最近刚从 Vuetify 迁移到 Tailwind 3，但 SCSS 与 Tailwind 双系统并存。

外部 UI/UX 审计给出的评分是 **4.5/10**，核心诊断是「产品是内容中心的，而不是学习中心的」。管理层要求对 UI 做全面升级。

本文档定义**子项目 A**：技术栈重建、信息架构重构、视觉系统、相机编排动画、资产策略。它是其余所有子项目的前置。

### 1.1 子项目拆分

外部 PRD 描述的范围（Dashboard / Quiz / SCORM / xAPI / FHIR / 证书 / 讲师面板 / 学习分析）是一个完整 LMS，无法装进单个 spec。拆分如下：

| 子项目 | 内容 | 状态 |
|---|---|---|
| **A. 地基重铸** | Nuxt 4 + TS + Tailwind、copper3d 3.7.3、IA 重构、设计系统、相机编排、资产策略、WCAG AA | **本文档** |
| B. 引导式学习流 | 学习目标、进度追踪、完成状态、课程树勾选 | 后续独立 spec |
| C. 交互式解剖 | Hotspot、表面标注、并排对照模式 | 后续独立 spec |
| D. 测评系统 | Quiz、拖放标注、临床情境题 | 后续独立 spec |
| E. 企业化 | 认证、CMS、i18n、SCORM/xAPI、分析 | 建议长期搁置 |

---

## 2. 目标与非目标

### 2.1 目标

1. 把 Nuxt 2 / Vue 2 应用整体重建为 Nuxt 4 + TypeScript + Tailwind 4
2. copper3d 2.1.2 → 3.7.3，并用 3.x 的 `copperRendererOnDemond` 和 `orbitFraming` 重做渲染与相机层
3. 用一条明确的叙事线重构信息架构，取代当前的平行分类目录
4. 建立浅色医疗底 + 粉品牌的设计系统（70% 中性 / 20% 白卡 / 10% 品牌色）
5. 以 3D 相机编排为主轴设计动画
6. 把首屏与人均资产下载量降到可在 GitHub Pages 上服务公开流量的水平
7. 达到 WCAG 2.2 AA
8. 桌面 / 平板 / 手机三档响应式
9. 清除心脏教育应用遗留的死代码与死资产

### 2.2 非目标（明确排除）

- 不新增测验、进度追踪、用户账号、搜索、书签
- 不做 hotspot / 表面标注 / 并排对照模式
- **不修改任何医学文案原文**（见 §6.1）
- 不新增病例、不重新采集影像
- 不在本 spec 内执行 git 历史重写（见 §13.2）
- 不实现 `benign_calcifications` 病例（无任何影像资产，见 §4.4）

---

## 3. 现状审计

### 3.1 资产真相

`frontend/static/modelView/` 共 454MB，git 仓库 `.git` 已达 749MB（55 个资产文件被跟踪）。

**按 md5 校验后的实际情况：**

| 资产类型 | 文件数 | 唯一内容数 | 判定 |
|---|---|---|---|
| `*/left/*.glb` 解剖模型 | 4 | 4 | ✅ 真实，仅覆盖密度 A–D |
| `*/middle/m3d.nrrd` 3D 乳腺X光 | 9 | 9 | ✅ 真实病例数据 |
| `*/right/mri.nrrd` MRI | 9 | 9 | ✅ 真实病例数据 |
| `*/middle/m2d.nrrd` 2D 乳腺X光 | 4 | **2** | ❌ 占位副本 |
| `*/middle/u2d.nrrd` 超声 | 5 | **1** | ⚠️ 仅 Cyst 可信 |

**m2d 的重复模式具有破坏性**：`density-1 ≡ density-4`（md5 `4788b9d9`），`density-2 ≡ density-3`（md5 `812cca55`）。即密度 A 与密度 D 的 2D 片子完全相同。而应用自身文案写着：

> density_1: "Grade A low density breast tissue can be seen **clearly** on mammogram."
> density_4: "It may be **difficult to see** any of the breast structures ... through the opaque (dense white) breast tissue."

用同一张图配这两段文字会直接拆穿应用的核心教学论点。**结论：全部弃用 m2d。**

**u2d 全部 5 份 md5 相同**（`a1dd6b11`）。原作者显然是为 Cyst 制作的（Cyst 文案专门论述超声用于鉴别囊性/实性），随后被复制为其他病例的占位。**结论：仅 Cyst 保留超声模态，其余 4 例弃用。**

**单文件大小分布**（压缩前）：

```
cancer-dcis/right/mri.nrrd      70.6 MB   ← 最大
cancer-lobular/right/mri.nrrd   53.3 MB
density-2/middle/m3d.nrrd       31.6 MB
density-1/middle/m3d.nrrd       30.8 MB
benign-cyst/right/mri.nrrd      27.9 MB
density-3/right/mri.nrrd        27.2 MB
density-4/left/density100.glb   21.0 MB
...
```

### 3.2 代码缺陷

| # | 位置 | 问题 |
|---|---|---|
| C1 | `components/model/Model.vue:10` | 2D tab 的 `v-show="tab2==='2D Ultrasound'"` 使该 tab 仅对 `benign_cyst` 可见；其余病例的 2D 模态完全不可达 |
| C2 | `components/model/Model.vue:103-127` | `benign_fibroadenoma` / `cancer_*` 的 2D 路径指向 `m2d.nrrd`，**该文件在这些目录中不存在**（仅有 `u2d.nrrd`）。因 C1 隐藏了 tab 才未触发 404 |
| C3 | `components/model/LeftModel.vue:52-71` | 6 个 benign/cancer 病例静默复用 `density75.glb` / `density100.glb`，用户看到的"病变解剖"与病变无关 |
| C4 | `plugins/copper.js:14-58` | 模块加载时即构造 3 个 `copperRenderer` + 3 个游离 DOM 节点并全部 `animate()`；3 个常驻 rAF 循环与 3 个 WebGL context 无条件存在 |
| C5 | `Model.vue:71` / `LeftModel.vue:37` / `PanelControls.vue:35` | `modelUrlsArray` 在三个组件中各写一份，是 C2 长期未被发现的根因 |
| C6 | `Model.vue:281` `PanelControls.vue:168` | 调试用 `THREE.BoxHelper` 白色线框被加入生产场景 |
| C7 | `PanelControls.vue:171` | `loadModel()` 的触发条件 `modelUrlsArray[...].length > 2` 在 right 分支恒为 false，整个方法是死代码 |
| C8 | `layouts/default.vue`、`Navigation.vue`、`LeftModel.vue` | 跨组件通信依赖 `$nuxt.$emit` 事件总线（`menu-height-changed` / `panel-height` / `onNavChange`），Nuxt 3/4 无此 API |
| C9 | `layouts/default.vue:70-72` | `updated()` 钩子内重新测量 `clientHeight` 并写回 data，构成潜在的重渲染循环 |
| C10 | `Model.vue:309-321` `PanelControls.vue:198-210` | 相机状态恢复依赖 `setTimeout(..., 300)` 竞态 |
| C11 | `assets/data/markdown/breast-main.md` | 空文件（0 字节），而 `topics.json` 中每个病例的 `dataFile` 均指向它 → `Panel.vue` 恒渲染空内容 |
| C12 | `assets/data/videos.json`、`components/topics/VideoPlayer.vue`、`pages/video/` | 全部为心脏教育应用遗留内容 |
| C13 | `components/topics/Panel.vue:96` | 硬编码跳转 `/electricity-healthy`（心脏应用路由） |
| C14 | `assets/data/topics.json` vs `plugins/data.js` | `benign_calcifications` 在 `data.js` 中有完整文案与病灶索引，但 `topics.json` 无入口 |
| C15 | `topics.json` vs `data.js` | BI-RADS 命名两套混用：导航用 `1/2/3/4`，文案用 `A/B/C/D` |

---

## 4. 叙事与信息架构

### 4.1 叙事线

横向通读三组文案后，其内在逻辑是一致的：

> `rightPanelText.density_3`: "MRI ... shows an unobstructed image that is **not captured in the mammogram**."
> `rightPanelText.density_4`: "an MRI will be ordered if you have ... areas of concerns that **can't be seen on Mammogram**."
> `rightPanelText.cancer_dcis`: "MRI is useful for visualising DCIS **in very dense breasts**."
> `rightPanelText.density_1`: "MRIs are **not commonly needed** to visualize low density breast tissue."

**主线：组织越致密 → 乳腺X光越受遮挡 → 越需要 MRI → 病变才能被发现。**

当前导航 `Density | Benign | Cancer` 是平行分类目录，把这条因果链拍平了。本应用握有同一批病例的多模态影像，可以直接演示"为何 D 级致密乳腺需加做 MRI"——这是其最稀缺的教学资产，目前价值未被释放。

### 4.2 两轴 IA

**横轴（看什么）= 病例。** 保留现有分组，仅将 BI-RADS 命名统一为 A–D 以消除 C15。

**纵轴（怎么看）= 模态步进。** 序列由资产真相驱动生成，不足则不显示条目。

### 4.3 模态映射表

| 病例 slug | 分组 | 模态序列 | 资产 |
|---|---|---|---|
| `the-breast` | overview | Anatomy → Mammogram → MRI | 借用 density-1 全套，标注 `referenceDensity: 'A'` |
| `density-a` | density | Anatomy → Mammogram → MRI | `density-1/{left/density25.glb, middle/m3d.nrrd, right/mri.nrrd}` |
| `density-b` | density | Anatomy → Mammogram → MRI | `density-2/...density50.glb` |
| `density-c` | density | Anatomy → Mammogram → MRI | `density-3/...density75.glb` |
| `density-d` | density | Anatomy → Mammogram → MRI | `density-4/...density100.glb` |
| `benign-cyst` | benign | Mammogram → **Ultrasound** → MRI | `benign-cyst/{middle/m3d.nrrd, middle/u2d.nrrd, right/mri.nrrd}` |
| `benign-fibroadenoma` | benign | Mammogram → MRI | `benign-fib/{middle/m3d.nrrd, right/mri.nrrd}` |
| `cancer-dcis` | cancer | Mammogram → MRI | `cancer-dcis/...` |
| `cancer-lobular` | cancer | Mammogram → MRI | `cancer-lobular/...` |
| `cancer-ductal` | cancer | Mammogram → MRI | `cancer-ductal/...` |

**benign/cancer 不提供 Anatomy 模态。** 与其用密度模型冒充病变解剖（C3），不如不显示；改在病例头部显示 `参考密度背景：C 级` 的明示标注，把复用从隐藏的错误转为显式的上下文。

病变病例仅两个模态恰好契合叙事：一次纯粹的「X光看不见 / MRI 看得见」对比。

### 4.4 已知缺口（记录，不在本 spec 内解决）

- `benign_calcifications`：`plugins/data.js` 中三段文案与病灶索引 `0` 齐备，但无任何影像资产。保留文案于 `content/cases.ts` 并标记 `disabled: true`，不生成路由与导航入口。待补充资产后启用。
- `the-breast` 无自有资产，全部借用 density-1。以 `referenceDensity` 明示。

### 4.5 路由

```
/                          → 重定向至 /case/the-breast
/case/:slug                → 病例页，默认首个模态
/case/:slug/:modality      → 指定模态（可分享、可深链）
/about                     → 关于页
```

模态进入 URL，使得任一模态可被直接分享与书签，也让浏览器前进/后退在模态步进上工作。

**旧 URL 重定向。** 现有站点的路由形如 `/density-1`、`/model-breast`（见 `nuxt.config.js` 的 `generate.routes`），可能已被外部链接或书签引用。新应用必须提供 301 重定向：

| 旧 | 新 |
|---|---|
| `/model-breast` | `/case/the-breast` |
| `/density-1` … `/density-4` | `/case/density-a` … `/case/density-d` |
| `/benign-cyst` | `/case/benign-cyst` |
| `/benign-fibroadenoma` | `/case/benign-fibroadenoma` |
| `/cancer-dcis` / `-lobular` / `-ductal` | `/case/cancer-dcis` / `-lobular` / `-ductal` |

静态部署（GitHub Pages）无服务端重定向能力，改为生成对应路径的 `index.html` 存根，内含 `<meta http-equiv="refresh">` 与 `<link rel="canonical">`。

---

## 5. 视觉设计系统

### 5.1 配色

方向：**浅色医疗底 + 粉作品牌**，遵循审计建议的 70% 中性 / 20% 白卡 / 10% 品牌色配比。基底自现有 `#f8cdd6` / `#fb7185` / `#7d1e7d` 降彩度发散而来。

```css
/* 中性层（70%） */
--bg:              #FBF7F8;
--surface-sunken:  #F4EEF0;
--border:          #E8DCE0;
--border-strong:   #D4C0C7;

/* 卡片层（20%） */
--surface:         #FFFFFF;

/* 文字 */
--text:            #241319;   /* 对 --surface 16.0:1 */
--text-muted:      #6E5A62;   /* 对 --surface  6.4:1 */
--text-subtle:     #93818A;   /* 仅用于 ≥18.66px 或图形 */

/* 品牌层（10%） */
--brand:           #D81B60;   /* 对 --surface  5.0:1 — 正文可用 */
--brand-hover:     #AD1457;
--brand-subtle:    #FCE7EE;
--accent-plum:     #7D1E7D;   /* 对 --surface  8.9:1 — 沿用原 secondary */
--accent-hot:      #EB3175;   /* 对 --surface  4.0:1 — 仅大字/图形，见下 */

/* 阅片灯箱 */
--film-bg:         #0E0A0C;
--film-bg-2:       #171012;
--film-border:     #2A1F24;
```

**对比度实测结论**：原 `subSuccess` `#EB3175` 对白底仅 **4.02:1**，未达正文 AA（4.5:1），仅满足大字/图形的 3:1。因此正文与链接改用 `#D81B60`（5.03:1），`#EB3175` 降级为强调图形色。

### 5.2 模态语义色

每个模态一组 `ink`（文字，已验证 AA）/ `fill`（色块）：

| 模态 | `--modality-*-ink` | 对白底 | `--modality-*-fill` | ink 对 fill |
|---|---|---:|---|---:|
| Anatomy | `#C2185B` | 5.9:1 | `#FCE7EE` | 4.98:1 |
| Mammogram | `#7D1E7D` | 8.9:1 | `#F3E5F5` | 7.4:1 |
| Ultrasound | `#0E7490` | 5.4:1 | `#E0F2F1` | 4.70:1 |
| MRI | `#1D4ED8` | 6.7:1 | `#E8EEFC` | 5.7:1 |

**ink 对 fill 这一列必须一并达标**：模态步进器的选中态是 ink-on-fill，不是 ink-on-white。Anatomy 的 ink 因此比 `--brand`（`#D81B60`）深一档 —— `#D81B60` 在 `#FCE7EE` 上仅 4.27:1，达不到正文 AA。

色彩不作为唯一区分手段：模态步进器同时使用序号、图标与文字标签（WCAG 1.4.1）。

### 5.3 明暗分工

页面主体为浅色。**当前模态为影像类（Mammogram / Ultrasound / MRI）时，舞台切换为深色阅片灯箱**（`--film-bg`）；Anatomy 模态时舞台维持浅色（GLB 模型在浅底上表现更好）。

模态切换时舞台背景色与相机飞行同步过渡（§7.3）。明暗差由此成为叙事语言而非视觉割裂——影像是「放在浅色桌面上的一台仪器」。

copper3d 三个 renderer 现已是 `alpha: true`，画布透明，背景完全由 CSS 控制，无需改动渲染层即可实现。

### 5.4 排版

沿用现有 Inria Sans（300/400/700），已通过 `head.link` 加载，无需变更。

| 角色 | 尺寸/行高 | 字重 | 用途 |
|---|---|---|---|
| Display | 40 / 44 | 700 | 病例大标题（≥1280px） |
| H1 | 28 / 34 | 700 | 病例标题（<1280px） |
| H2 | 20 / 28 | 700 | 模态标题、分组标题 |
| H3 | 16 / 24 | 700 | 卡片标题 |
| Body | 16 / 27 | 400 | 医学正文（行高 1.7） |
| Body-sm | 14 / 22 | 400 | 辅助说明 |
| Caption | 12 / 16 | 400 | 标签、计数 |
| Numeric | 14 / 20 | 400 `tabular-nums` | 切片索引等跳动数字 |

**正文最大宽度 65ch**（审计建议 60–80 字符）。

### 5.5 间距 / 圆角 / 阴影

```
间距：4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
圆角：4 (chip) · 8 (按钮/输入) · 12 (卡片) · 9999 (胶囊)
阴影：
  --shadow-sm: 0 1px 2px rgb(36 19 25 / .06)
  --shadow-md: 0 2px 8px rgb(36 19 25 / .08)
  --shadow-lg: 0 8px 24px rgb(36 19 25 / .10)
```

阴影带轻微品牌色偏（基于 `--text` 的 RGB 而非纯黑），保持整体色温一致。

---

## 6. 内容层

### 6.1 文案约束（硬约束）

**`plugins/data.js` 中 `leftPanelText` / `middlePanelText` / `rightPanelText` 的英文原文一字不改**，包括其中的 `<b>` 标签与原有的排版空白。医学文本改写涉及临床准确性风险，超出前端职责。

审计报告与 PRD 中「将长段落改为 bullet / Key Facts / Learning Objectives」的建议**本次不采纳**，改以纯样式手段降低认知负荷：

- 正文限宽 65ch，行高 1.7
- 段落间距 16px
- 首句作为引言样式放大至 20/30，字重 400（不改动文字，仅样式）
- 超过 3 段时折叠，提供「阅读完整描述」展开
- 关键术语以 `<mark>` 包裹高亮（仅添加标记，不改动字符）

### 6.2 数据结构

`web/content/cases.ts` 成为唯一内容真相源，取代：`assets/data/topics.json`、`plugins/data.js`、`plugins/topics.js`、`plugins/current-content.js`，以及 `Model.vue` / `LeftModel.vue` / `PanelControls.vue` 中三份重复的 `modelUrlsArray`（消除 C5，进而消除 C2 的成因）。

```ts
export type ModalityId = 'anatomy' | 'mammogram' | 'ultrasound' | 'mri'
export type CaseGroup  = 'overview' | 'density' | 'benign' | 'cancer'
export type BiRads     = 'A' | 'B' | 'C' | 'D'

export interface Modality {
  id: ModalityId
  /** UI 标签，如 "3D Mammogram"。非医学原文，可调整。 */
  label: string
  /** 相对 assetBase 的路径，如 "density-1/middle/m3d.nrrd" */
  asset: string
  /** copper3d 视角预设 JSON，如 "density-1/middle/m_view.json" */
  viewPreset: string
  /** 该模态对应的医学原文。一字不改。 */
  text: string
  /** 架构预留。当前一律为 []，组件 v-if 判空不渲染。 */
  keyFacts: string[]
}

export interface Case {
  slug: string
  group: CaseGroup
  /** 导航短标签，如 "A" */
  title: string
  /** 病例标题，如 "Almost entirely fat" */
  heading: string
  biRads?: BiRads
  /** 借用其他病例解剖模型时的明示标注 */
  referenceDensity?: BiRads
  /** 病灶所在切片索引，原 rightBoundingBoxIndex。0 表示无特定病灶。 */
  lesionSliceIndex?: number
  /** 由资产真相驱动；无资产则无条目 */
  modalities: Modality[]
  /** 有文案但无影像资产的病例（benign-calcifications） */
  disabled?: boolean
}

export const cases: Case[]
```

`lesionSliceIndex` 自 `plugins/data.js` 的 `rightBoundingBoxIndex` 迁移：Cyst 58 / Fibroadenoma 68 / DCIS 90 / Lobular 80 / Ductal 27，density 系列均为 0。

---

## 7. 相机编排

动画预算全部投向 3D 相机，装饰性动效不做。全部动画受 `prefers-reduced-motion: reduce` 控制：该媒体查询命中时，所有相机运动改为瞬时跳变，交叉溶解改为直接切换。

### 7.1 密度形变（Density Morph）

density A–D 的四个 GLB 是同一乳房的四个密度版本。**当且仅当**用户处于 Anatomy 模态、且在 density 分组内切换等级（含 `the-breast` ↔ `density-a`，二者共用 `density25.glb`，此时无形变）时触发：**相机完全不动**，两个模型交叉淡入淡出 800ms，用户直接观察到腺体组织"长满"的过程。

跨分组切换（如 `density-d` → `cancer-dcis`）或处于影像模态时不触发本动画，走 §7.3 的常规模态飞行。

零新增资产，教学价值最高。

**实现**：两个模型同时在场景中，通过材质 `opacity` 插值。切换完成后卸载旧模型。

### 7.2 定位病灶（Locate Lesion）

`lesionSliceIndex` 目前仅用于设置初始切片。改为驱动一个 `⌖ 定位病灶` 按钮：点击后相机推近至病灶所在区域，切片索引以缓动动画滑至目标值，到达后短暂高亮轮廓 600ms。

仅在 `lesionSliceIndex > 0` 时显示该按钮（即 5 个病变病例）。

### 7.3 模态切换飞行

取代当前的场景硬切 + `setTimeout(300)` 手动恢复 `camera.position`（C10）。

使用 copper3d 3.7.3 的 `orbitFraming`：

1. `computeFraming(box, fovDeg)` → 由包围盒得出 `pivot` / `size` / `dist`
2. `resolveViewPose(preset, pivot, dist)` → 目标位姿（含 Gram-Schmidt 正交化的 up 向量）
3. `resolveFarPlane(presetFar, maxDistance, dist)` → 远裁剪面
4. 相机自当前位姿沿弧线插值至目标位姿，1200ms，`easeInOutCubic`
5. 同步进行：旧场景淡出、新场景淡入、舞台背景色过渡（§5.3）

### 7.4 入场环绕

模型加载完成后自动慢速环绕约 0.6 圈，3000ms，停在正视图。兼作"已就绪"信号与体积感展示。用户在环绕期间的任何输入立即中断动画并交还控制权。

### 7.5 切片拖拽缓动

当前 `plugins/copper.js:raycaster` 的拖拽是逐帧 ±1 spacing 的生硬跳变。改为对目标索引做缓动跟随，并以 `tabular-nums` 显示当前/总切片数。

### 7.6 按需渲染与动画的协作

基础状态使用 `copperRendererOnDemond`（静止不出帧）。任一相机动画启动时提升为连续渲染，动画结束后落回按需模式。

---

## 8. 技术架构

### 8.1 目录结构

```
breast-educational-resource/
├─ web/                          ← 新 Nuxt 4 应用
│  ├─ app/
│  │  ├─ components/
│  │  │  ├─ stage/               CopperStage, ModalityStepper, StageControls
│  │  │  ├─ nav/                 CaseSidebar, AppHeader, MobileNav
│  │  │  ├─ content/             ModalityText, CaseHeader, ReferenceBadge
│  │  │  └─ ui/                  Button, Chip, Panel, Disclosure, ProgressRing
│  │  ├─ composables/            见 §8.2
│  │  ├─ layouts/
│  │  ├─ pages/
│  │  ├─ assets/css/tokens.css   §5 的 CSS 变量
│  │  └─ app.vue
│  ├─ content/cases.ts           §6.2 唯一内容真相源
│  ├─ public/
│  ├─ nuxt.config.ts
│  └─ package.json
├─ assets-src/                   NRRD/GLB 原始文件（不入库）
├─ scripts/optimize-assets.mjs   §9.1 压缩流水线
├─ docs/superpowers/specs/       本文档
└─ frontend/                     旧应用，达到对等后删除
```

`frontend/` 在整个开发期保留，便于逐病例对照验证；对等后于最后一步删除。

### 8.2 3D 层

当前 `plugins/copper.js` 在模块加载时即构造 3 个 renderer 并全部 `animate()`（C4）。重建为单 renderer + composables：

| Composable | 职责 |
|---|---|
| `useCopperStage()` | 唯一 `copperRendererOnDemond` 实例的生命周期，绑定到 `onMounted` / `onScopeDispose` |
| `useModalityScene()` | 按模态 id 创建/获取 scene，调用 `loadNrrd` / `loadGltf` |
| `useCameraChoreography()` | §7 的全部相机动画，基于 `orbitFraming` |
| `useSliceControl()` | 切片拖拽、缓动、索引显示（取代 `raycaster` 闭包） |
| `useAssetUrl()` | 由 runtime config 的 `assetBase` 拼接资产 URL |

**关键决策：三个模态共用一个 renderer，切换的是 scene 而非 renderer。** 直接消除 2/3 的 WebGL context 与 2/3 的常驻 rAF 循环。

`loadNrrd` 在 3.7.3 中签名未变（`commonSceneMethod.d.ts:44`），迁移为机械替换。

### 8.3 状态

Pinia，仅存 UI 状态：当前病例 slug、当前模态 id、侧边栏/内容面板收起状态、每个 (病例, 模态) 的相机位姿快照。

取代模块级可变对象 `previoursCameras` 与 `modelToScenes`。

### 8.4 移除清单

| 移除项 | 理由 |
|---|---|
| `$nuxt.$emit` 事件总线 | Nuxt 3/4 无此 API；改用 composable 共享状态（C8） |
| `plugins/breakpoint.js` | Tailwind 断点 + CSS 媒体查询已足够 |
| `assets/sass/**` 全部 SCSS | Tailwind 4 + CSS 变量取代 |
| `marked` + `raw-loader` + `assets/data/markdown/**` | 空文件 + 心脏应用遗留（C11） |
| `assets/data/videos.json`、`VideoPlayer.vue`、`pages/video/` | 全部心脏应用内容（C12） |
| `Panel.vue` 中 `/electricity-healthy` 跳转 | 心脏应用路由（C13） |
| `@nuxtjs/axios` | 无任何后端调用 |
| `theme-colors.js` | 由 `tokens.css` 的 CSS 变量取代 |
| 两处 `THREE.BoxHelper` | 调试残留进入生产画面（C6） |
| `PanelControls.loadModel()` | 死代码（C7） |
| `store/index.js` Vuex | 由 Pinia 取代 |

### 8.5 构建与部署

- 开发：`nuxi dev`
- 本地 Docker：沿用现有 `docker-compose.yml` 思路，容器内 `nuxi build` + Nitro node server
- Vercel：Nitro 的 `vercel` preset
- GitHub Pages：`nuxi generate` + `NUXT_APP_BASE_URL` 配置子路径

`assetBase` 通过 `runtimeConfig.public.assetBase` 暴露，默认同源 `/modelView/`。

---

## 9. 资产策略

### 9.1 压缩

| 手段 | 实测 | 说明 |
|---|---|---|
| NRRD 启用 gzip 编码 | 399.5MB → 346.2MB | three 的 `NRRDLoader` 原生支持 gzip 编码的 NRRD；`fflate` 已是 copper3d 依赖。零渲染代码改动 |
| GLB 走 Draco / Meshopt | 53.5MB → 3.2MB（−94%） | `gltf-transform optimize --compress draco --texture-compress webp --simplify false` |
| 弃用 m2d / u2d 占位副本 | −12 个文件 | §3.1，主要收益是内容诚实性而非体积 |

**总计 451.7MB → 349.4MB。**

> **实测修正（2026-07-29）**：本节初稿预计压缩到 ~190MB，该估算是错的——它假设全部 NRRD 都是 `encoding: raw`。实际上 18 个非占位 NRRD 中有 17 个**本来就是 gzip**，唯一的 raw 文件是 `cancer-dcis/right/mri.nrrd`（67.4MB → 15.5MB，−77%）。因此 NRRD 侧只有约 52MB 可压，其余降幅全部来自 GLB。
>
> 决策：**接受 349MB，不再进一步压缩**。继续压缩需要裁剪或降采样体数据，属有损操作，而本 app 教的恰恰是「致密组织如何遮蔽病灶」——降采样会直接削弱它的教学论点。§9.3 表明 349MB 距离 GitHub Pages 的各项限制仍有充裕余量。

`scripts/optimize-assets.mjs` 读取 `assets-src/`，输出到 `web/public/modelView/`，幂等可重跑。它是 `web/` 的一个 script（`cd web && yarn assets`）——本仓库只有 `web/` 一个 Node 工程，根目录不设 `package.json`。

**验收前提**：压缩后必须逐文件验证 copper3d 能正确加载，且渲染结果与压缩前一致。若某文件 gzip 后加载失败，该文件保留未压缩版本并记录（`optimize-assets.mjs` 的 `SKIP_GZIP` 数组）。

### 9.2 加载策略

| 策略 | 效果 |
|---|---|
| 仅加载当前模态 | 当前三个组件同时挂载 → 三个模态并发下载 |
| 停留 >1500ms 后预取下一模态 | 步进器已明示下一步，预取命中率高 |
| `the-breast` 首屏仅加载 `density25.glb` | Draco 后约 2MB，零 NRRD |

**人均实际下载量预计从 ~450MB 降至 20–40MB**（少有用户遍历全部 10 个病例 × 全部模态）。

### 9.3 GitHub Pages 可行性

| 限制 | 现状 | 处理后（实测） | 余量 |
|---|---|---|---|
| 单文件 100MB 硬限制 | 最大 70.6MB | 最大 50.8MB（`cancer-lobular/right/mri.nrrd`，源文件本就是 gzip） | 约 2× |
| 站点大小 1GB | 454MB | 349.4MB | 约 2.9× |
| 带宽 ~100GB/月（软） | ~450MB/人 → 约 220 人打满 | 20–40MB/人 → 约 2500–5000 人 | — |

带宽这一行的收益来自**按模态懒加载**，而非总体积——单个访客本来就不会拉取全部 349MB。总体积只决定站点大小与仓库负担，这两项余量都很充裕。

压缩与懒加载对公开部署是**可行性前提**，而非优化项。

**部署前提（Task 12 必须处理）**：`web/public/modelView/` 目前在 `.gitignore` 中，而旧资产提交在 `frontend/static/modelView/`。Task 12 删除 `frontend/` 后，若不同时把压缩产物纳入版本控制，GitHub Pages 部署将没有任何模型可服务。两件事必须同一次完成，并与 §13.2 的历史清理一并执行。

---

## 10. 布局与响应式

### 10.1 桌面（≥1280px）三栏

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⬤ Te Uma                                                   About   │  56px
├───────────────┬─────────────────────────────────────┬───────────────┤
│               │  Extremely dense          BI-RADS D │  MRI          │
│  The Breast   │                                     │  ───────────  │
│               │  ①Anatomy ── ②Mammogram ── ③MRI    │  正文（原文）   │
│  DENSITY      │  ●━━━━━━━━━━━━●━━━━━━━━━━━━○        │  65ch / 1.7   │
│   A B C D     │                                     │               │
│               │  ┌───────────────────────────────┐  │               │
│  BENIGN       │  │                               │  │               │
│   Cyst        │  │   舞台（单 renderer）           │  │               │
│   Fibroaden.  │  │   影像模态时为深色阅片灯箱       │  │               │
│               │  │                               │  │               │
│  CANCER       │  └───────────────────────────────┘  │               │
│   DCIS        │  ⟲重置 ⛶全屏 ⌖定位病灶  ▁▂▃ 62/104 │  ‹上一步 下一步›│
│   Lobular     │                                     │        ⟨收起⟩  │
│   Ductal      │                                     │               │
└───────────────┴─────────────────────────────────────┴───────────────┘
   240px 可收              主舞台（自适应）              400px 可收
```

两侧面板均可收起。全部收起时舞台接近全屏，适用于课堂投影与沉浸观察。这同时消化审计指出的「40–50% 空间闲置」。

### 10.2 平板（768–1279px）

侧边栏改为抽屉（默认收起，汉堡按钮唤出）；舞台占主区；内容面板改为底部 sheet，可上拉展开至半屏。

### 10.3 手机（<768px）

单列纵向流：`病例标题 → 模态步进器（横向可滚动）→ 舞台（1:1 方形）→ 控制条 → 正文 → 上下步`。病例导航移入顶部抽屉。

### 10.4 断点

采用 Tailwind 默认断点（`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`），取代当前沿用的 Vuetify 值（600/960/1264/1904）。布局分档仅使用 `md`(768) 与 `xl`(1280) 两个断点。

**所有响应式分档在 CSS 中决定**，不经 JS，避免首屏渲染时的布局抖动。

---

## 11. 无障碍

目标 **WCAG 2.2 AA**。

| 项 | 措施 |
|---|---|
| 对比度 | §5.1 全部前景/背景组合已实测；`#EB3175` 因仅 4.02:1 降级为图形色 |
| 色彩非唯一手段 | 模态步进器同时用序号 + 图标 + 文字（1.4.1） |
| 键盘导航 | 全部交互元素可 Tab 到达；模态步进器支持方向键；舞台可聚焦并以方向键旋转、`+/-` 缩放、`[`/`]` 翻切片 |
| 焦点可见 | 统一 `:focus-visible` 轮廓，2px `--brand`，2px 偏移 |
| 屏幕阅读器 | 3D 画布提供 `role="img"` 与描述性 `aria-label`；切片索引变化通过 `aria-live="polite"` 播报 |
| 动效 | `prefers-reduced-motion: reduce` 时全部相机动画降为瞬时（§7） |
| 文字缩放 | 布局在 200% 缩放下不裁切内容（1.4.4） |
| 触控目标 | 最小 44×44px（2.5.8） |
| 语言 | `<html lang="en">`（内容为英文） |

---

## 12. 验收标准

1. 10 个启用的病例全部可达，模态序列与 §4.3 表格完全一致
2. 无任何 404 资产请求（消除 C2）
3. 无 `m2d.nrrd` / 非 Cyst 的 `u2d.nrrd` 被请求（§3.1）
4. 生产画面中无 `BoxHelper` 线框（C6）
5. 页面同时存在的 WebGL context 数量为 **1**（C4）
6. 静止 3 秒后 rAF 停止出帧（按需渲染生效）
7. `the-breast` 首屏传输量 < 3MB
8. 切换病例/模态无 `setTimeout` 竞态导致的相机跳变（C10）
9. `plugins/data.js` 三组文案的字符内容与新 `content/cases.ts` 逐字符相等（可脚本校验）
10. Lighthouse 无障碍评分 ≥ 95；axe-core 零 serious/critical
11. 三档响应式在 375 / 834 / 1440 / 1920 宽度下无横向滚动
12. `prefers-reduced-motion` 开启时无任何相机运动
13. 仓库内不再存在 Vue 2 / Vuetify / SCSS / marked / axios 依赖
14. 站点构建产物 < 400MB（实测 349.4MB；原定 200MB 的依据见 §9.1 的实测修正）
15. §4.5 表中全部 10 条旧 URL 均能到达对应新页面

---

## 13. 风险与后续动作

### 13.1 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| NRRD gzip 后 copper3d 加载失败 | 压缩收益归零 | §9.1 要求逐文件验证；失败者保留未压缩版 |
| `copperRendererOnDemond` 与相机动画协作不佳 | 动画掉帧 | §7.6 定义了升/降级策略；若不可行，回退至常规 `copperRenderer` 并接受常驻渲染 |
| GLB Draco 压缩改变模型外观 | 教学准确性受损 | 压缩前后并排目视比对，由领域负责人确认 |
| 单个 MRI 体数据即使压缩后仍偏大 | 该病例加载慢 | 接受；以进度环 + 预取缓解。降采样属内容决策，超出本 spec。实测最大者为 `cancer-lobular/right/mri.nrrd` 50.8MB（源文件本就是 gzip，无可压空间）；`cancer-dcis` 已由 67.4MB 降至 15.5MB |
| 三个 renderer 合一后 scene 间状态串扰 | 渲染异常 | scene 按 `${caseSlug}-${modalityId}` 命名隔离；切换时显式 `setCurrentScene` |

### 13.2 后续动作（明确不在本 spec 内）

1. **git 历史清理**：压缩落地后，历史中仍保留 454MB 未压缩版本，`.git`（当前已 750MB）将增长至约 1.1GB。届时执行一次 `git filter-repo` 移除历史中 `frontend/static/modelView/` 下的 `*.nrrd` / `*.glb`，`.git` 可降至约 350MB。**破坏性操作**：需先 `git clone --mirror` 完整备份、通知全部协作者、强推后所有人重新 clone。与 §9.3 末尾的部署前提是同一件事的两半——把压缩产物纳入版本控制、把未压缩历史移出去——应一并规划。
2. **补齐 benign/cancer 的解剖模型**：6 个病变病例目前无自有 GLB，Anatomy 模态因此缺失。
3. **补齐 `benign_calcifications` 影像资产**：文案已就绪。
4. **补齐真实的 2D 乳腺X光与各病例超声**：现有均为占位副本。
5. 子项目 B–E（§1.1）。
