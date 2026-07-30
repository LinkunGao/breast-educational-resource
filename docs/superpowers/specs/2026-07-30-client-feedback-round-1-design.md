# 甲方反馈第一轮 — 设计文档

**项目**：Breast Educational Resource (Te Uma)
**子项目**：A2 — 甲方反馈第一轮修正
**日期**：2026-07-30
**状态**：已评审通过
**前置**：[2026-07-28-foundation-rebuild-design.md](./2026-07-28-foundation-rebuild-design.md)（下称「地基文档」）

---

## 1. 背景

地基重铸交付后，甲方给出了 9 条反馈。评审过程中另外发现 1 条确定性缺陷（About 按钮在 xl 以下错位），合并为 10 条。

本文档定义这 10 条中的 9 条的设计。第 4 条（MRI 图像过暗）经甲方进一步确认后另行处理，见 §11。

### 1.1 反馈原文与编号

| # | 甲方原文 / 来源 | 本文档章节 |
|---|---|---|
| 1 | 旧 app 有 PWA，新版没有了，连 icon 都消失了 | §9 |
| 2 | The anatomy section is missing from a few of the sections | §4 |
| 3 | BIRADs missing from some titles etc (I think we can remove BIRADS) | §8.1 |
| 4 | The camera for threejs for the MRI might need to be repositioned as all the images a very dark (at least on iPad) | §11（本轮不做） |
| 5 | The 3d views (images and models) no longer cache and reload each time (slows interaction) | §7 |
| 6 | 宽屏同时显示 anatomy / mammogram / MRI 三个面板，窄屏回落到当前的逐个切换 | §5、§6 |
| 7 | The image and model views could take up more of the space available — they start of very small | §6.3 |
| 8 | 左上角 The breast 是个 bullet 项，但它应该是自成一节 | §8.2 |
| 9 | 左侧导航加图标 | §8.3 |
| 10 | （评审发现）About 按钮在 iPad 下贴在 wordmark 旁边 | §8.4 |

---

## 2. 目标与非目标

### 2.1 目标

1. 宽屏三联并排、窄屏单联，由 CSS 容器宽度决定，折叠侧栏可主动提升到三联
2. 五个 lesion 病例补回 anatomy 面板，复用 `density-3/left/density75.glb`
3. 3D 视图跨病例导航不再丢失已加载的场景
4. 视图内容填满可用画布
5. 恢复 PWA 可安装能力与图标
6. 移除 BI-RADS，统一导航与标题的一致性

### 2.2 非目标

- **不修改任何医学文案原文**（继承地基文档 §6.1 的约束）
- 不实现影像资产的离线缓存（见 §9.3）
- 不修改 MRI 的窗宽窗位与默认亮度（见 §11）
- 不新增病例、不重新采集影像
- 不实现 `benign_calcifications`（仍无影像资产）

---

## 3. 现状审计

### 3.1 缓存的真实行为（第 5 条）

甲方的判断是对的。当前有两处会真的重新下载：

1. **跨病例导航销毁整个 renderer。** [`app/utils/pageKey.ts`](../../../web/app/utils/pageKey.ts) 只让 `the-breast` + `density-a..d` 共享一个页面实例，其余每个病例各自一个 key。离开 `benign-cyst` 去 `benign-fibroadenoma`，`CopperStage` 卸载，`useCopperStage` 的 `onScopeDispose` 销毁 renderer，该病例所有已解码体数据全部丢失。返回时 10.3MB + 27.9MB 重新下载并重新解码。

2. **`MAX_CACHED_SCENES = 3` 对 density 家族太小。** 该家族 5 个病例 × 3 个模态 = 15 个可能场景共用这一个上限。讲课时 A→B→C→D 走一遍，几乎每步都在驱逐。

旧版在 `frontend/plugins/copper.js` 的模块作用域建 3 个常驻 renderer 且从不销毁，所以整场课加载过的都还在内存里。这就是甲方所说的 "no longer cache"。

### 3.2 取景（第 7 条）

MRI 预设 `eyePosition` 为 `[0, 0, 400..650]`。以 45° fov、距离 650 计，可视高度约 538mm，而体数据只有约 200mm —— 内容仅占画面高度的三分之一左右。iPad Air (1180×820) 的实测截图证实：包围盒仅占画面高度约四分之一，四周全是空白。

另发现 up 向量不一致：density 系列 MRI 为 `[0, 1, 0]`，lesion 系列为 `[0, -1, 0]`，图像上下相反。

### 3.3 anatomy 文案已经存在（第 2 条）

[`web/content/copy.generated.ts`](../../../web/content/copy.generated.ts) 的 `anatomyText` 已含 `benign_cyst`、`benign_fibroadenoma`、`cancer_dcis`、`cancer_lobular`、`cancer_ductal` 五条 —— 旧版左面板本来就显示它们。补 anatomy 面板不需要新写任何文案。

`lesionCase` 中已写有 `referenceDensity: 'C'`，正对应甲方指定的 density-3。

### 3.4 资产目录本身就是槽位结构（第 6 条）

`public/modelView/<case>/{left,middle,right}/` 三层目录，与旧版 `leftPanelText` / `middlePanelText` / `rightPanelText`（见 [`legacy/data.js`](../../../legacy/data.js)）一一对应。`middle/` 同时放 `m3d.nrrd` 与 `u2d.nrrd`，正是甲方所说「2D 和 3D 的 mammogram 不展开、需要切换」的原始结构。

### 3.5 About 按钮错位（第 10 条）

[`AppHeader.vue`](../../../web/app/components/nav/AppHeader.vue) 把 `ml-auto` 放在内容面板折叠按钮上，而该按钮是 `hidden ... xl:flex`。低于 xl (1280px) 时按钮 `display:none`，`ml-auto` 随之消失，About 链接失去右推，紧贴 wordmark。桌面端不可见。

---

## 4. 内容模型：槽位

### 4.1 类型

`web/content/types.ts` 引入槽位层：

```ts
export type PanelId = 'anatomy' | 'mammogram' | 'mri'

export interface Panel {
  id: PanelId
  /** 槽标签，导航文案，可改 */
  label: string
  /** 1..2 个；[0] 是默认变体（3D 优先） */
  modalities: Modality[]
}
```

`Case.panels: Panel[]` 成为真相来源。`Case.modalities` **保留为真实字段**，由 `densityCase()` / `lesionCase()` / `the-breast` 字面量在构造时从 `panels` 摊平写入（`panels.flatMap(p => p.modalities)`），而不是改成需要调用的 helper。这样以下三处**无需改动**：

- [`nuxt.config.ts`](../../../web/nuxt.config.ts) 的预渲染种子 `c.modalities.map(m => m.id)`
- `/:slug/:modality` 路由与 `[[modality]].vue` 的 `validate` 守卫
- [`content/legacyRoutes.ts`](../../../web/content/legacyRoutes.ts) 的 301 重定向表

两者必须一致，因此加一条单测断言：对每个病例，`c.modalities` 恰好等于 `c.panels.flatMap(p => p.modalities)`。

### 4.2 各病例的槽位

| 病例 | anatomy | mammogram | mri |
|---|---|---|---|
| `the-breast` | `density-1/left/density25.glb` | `m3d.nrrd` | `mri.nrrd` |
| `density-a..d` | 各自 `left/*.glb` | 各自 `m3d.nrrd` | 各自 `mri.nrrd` |
| `benign-cyst` | **`density-3/left/density75.glb`（新增）** | `m3d.nrrd` + `u2d.nrrd` | `mri.nrrd` |
| `benign-fibroadenoma` | **`density-3/left/density75.glb`（新增）** | `m3d.nrrd` | `mri.nrrd` |
| `cancer-dcis` | **`density-3/left/density75.glb`（新增）** | `m3d.nrrd` | `mri.nrrd` |
| `cancer-lobular` | **`density-3/left/density75.glb`（新增）** | `m3d.nrrd` | `mri.nrrd` |
| `cancer-ductal` | **`density-3/left/density75.glb`（新增）** | `m3d.nrrd` | `mri.nrrd` |

新增 anatomy 面板的 `viewPreset` 一律为 `left_breast_view.json`（现有 anatomy 面板已在用同一个），`text` 取 `anatomyText[legacyKey]`（§3.3 已存在的原文）。

[`cases.ts`](../../../web/content/cases.ts) 顶部注释中「GLBs exist only for density-1..4 -> benign/cancer have no anatomy」一句同步删除，否则它会与代码矛盾。

### 4.3 槽位变体的选中状态

**变体选中是面板的本地响应式状态**，不是 URL 状态。

- 初值：URL 中的 modality 若属于该槽，取它；否则取该槽的 `modalities[0]`（3D）。
- 用户在 mammogram 槽点 "2D Ultrasound"：设置本地变体，**并**导航到 `/benign-cyst/ultrasound`（焦点随之移到该槽）。
- 之后用户聚焦 MRI 槽：URL 变为 `/benign-cyst/mri`，mammogram 槽的本地变体**保持在 2D**。

这满足讲课场景「MRI 聚焦、中槽停在超声」。

**已知取舍**：该组合刷新页面会丢失（URL 只承载一个 modality）。用 query param 承载第二维状态会污染预渲染与 legacy 重定向表，不值得。

### 4.4 焦点

「焦点槽」= URL 中 modality 所属的槽。三联时焦点决定右侧文字栏显示哪一段、以及哪一格加高亮边框；单联时焦点决定哪一格可见。

---

## 5. 三个渲染实例

### 5.1 决策

三个槽各自一个独立 `CopperStage` 实例，各自持有独立的 `useCopperStage` / `useModalityScene` / `useSliceControl`。三个 WebGL context。

**理由**：这正是旧版的做法（3 个模块作用域的常驻 renderer），已在 iPad 上验证可行。现有 composable 原样复用，改动面最小。

**被否决的方案**：单 canvas + `setViewport`/`setScissor` 分屏。只占 1 个 GPU context，对 iPad 更友好，但需要绕过 copper3d 的 `render()` 只画 `currentScene` 的封装，自行接管渲染循环、拾取与 resize —— 改动大且脆弱。若后续 iPad 出现 context 数量问题，这是备选路线。

**被否决的方案**：按断点动态挂载/卸载额外面板。断点跨越时要重建 renderer、重下模型，正好复现第 5 条抱怨的缺陷。

### 5.2 三个实例始终挂载

单联时用 CSS 隐藏非焦点的格子，**不卸载**。卸载即销毁 renderer 与场景缓存，就是第 5 条本身。

### 5.3 按需加载：由宿主尺寸决定

`CopperStage` 只在自己的 host 元素具备非零尺寸时才发起资产加载；加载完成后一直保留。

- 单联：只有焦点格子非零 → 只下载一个资产。切 tab 使下一格非零 → 下载 → 此后常驻。
- 三联：三格都非零 → 三个都下载。

这个门天然由 CSS 决定，JS 中无需出现任何断点像素字面量（遵循地基文档确立的「CSS 决定布局」约束）。实现上复用 [`useCopperStage.ts`](../../../web/app/composables/useCopperStage.ts) 已有的 `ResizeObserver`（它已经有 `width === 0 || height === 0` 的 bail 分支）。

隐藏用 `display: none`（而非 `visibility: hidden`），因为只有前者会让 `ResizeObserver` 报告 0×0，也就是这个门赖以工作的信号。

**并发代价**：首次进入三联会同时发起三个下载，anatomy 很小但两个 NRRD 可能各 10–50MB。这是「三格同时可见」的必然代价，不做串行化 —— 串行会让最后一格空白到令人以为坏了。三格各自的加载遮罩已由现有实现提供。

---

## 6. 布局

### 6.1 触发条件：容器查询，不是视口断点

在舞台列上开 `@container`，列宽 ≥ **1000px** 时三联，否则单联（1000 / 3 ≈ 333px 每格，是可用的下限）。

选容器查询而非视口断点的理由：折叠左侧导航与右侧内容栏可以**主动把布局提升到三联**，接上地基文档 §10.1 已有的 "collapse both panels for projection" 能力。1440px 的笔记本折起两侧即可三联投影。视口断点做不到，且会把像素字面量写进 JS 或多处 CSS。

iPad Air 横屏 1180px（减去侧栏与内容栏后远小于 1000px）落在单联，符合甲方「if the width is too small then it switches to the current approach」的要求。

### 6.2 两种形态

**三联**（容器 ≥ 1000px）：

```
┌──────┬────────────────────────────────┬─────────┐
│ NAV  │ Anatomy   Mammogram*   MRI     │ TEXT    │
│      │ ┌─────┐   ┏━━━━━┓    ┌─────┐  │         │
│      │ │     │   ┃     ┃    │     │  │ Mammo-  │
│      │ └─────┘   ┗━━━━━┛    └─────┘  │ gram    │
│      │ ↺ ⛶      ↺ ⛶ 42▸    ↺ ⛶ 18▸  │ 段落…   │
└──────┴────────────────────────────────┴─────────┘
```

- 三格等宽 grid
- 每格：槽标签（mammogram 槽标签旁带 3D|2D 分段控件）、画布、自己的精简控件条
- 精简控件条：reset、全屏、切片读数（anatomy 槽无切片，不显示读数）
- 焦点格子加高亮边框；点击任一格即聚焦
- 右侧文字栏只显示焦点槽的文字

**单联**（容器 < 1000px）：维持现状。差别只有两处：

- 模态条改为列**槽位**三个 tab（Anatomy / Mammogram / MRI），而不是列 modality
- mammogram 槽激活时，其下出现 3D|2D 分段控件

对 `benign-cyst` 而言，tab 从现在的「3D Mammogram / 2D Ultrasound / 3D MRI」变为「Anatomy / Mammogram(3D|2D) / MRI」。

### 6.3 取景：自动 fit-to-view（第 7 条）

保留预设 JSON 的视线**方向**与 **up 向量**，把**距离**改为按实际包围盒与当前 canvas 宽高比算出，留约 8% 边距：

- NRRD：`volume.RASDimensions`
- GLB：`THREE.Box3.setFromObject(group)`

Reset 按钮回到这个取景（而不是预设里的原始 `eyePosition`）。

三联时每格变窄，固定距离必然再次失控，只有自动取景能跨形态都正确。canvas 尺寸变化时（面板折叠、形态切换、窗口 resize）重新计算距离 —— 挂在 `useCopperStage` 已有的 `ResizeObserver` 上，但**仅当该场景尚未被用户摆过**时才重算，否则会把用户的观察位置抢走。

「被用户摆过」的定义：该 stage 上发生过任何 `pointerdown` 或 `wheel`（`CopperStage` 已经监听这两个事件用于 `onUserInput`），即置该场景的 `userPosed = true`；按下 Reset 清回 `false`。

**up 向量不一致的处理**：density 系列 MRI 为 `[0, 1, 0]`、lesion 系列为 `[0, -1, 0]`，两者图像上下相反。这是旧版就存在的差异（预设 JSON 是从旧版原样搬来的），甲方**没有**报告过，且把医学影像翻错方向比不一致更糟。因此本轮**只记录、不擅自统一**：实现时先分别截图两组 MRI 与旧版线上版本比对，确认哪一侧是正确解剖方位后，再改另一侧的预设 JSON；若无法确认，保持现状并在交付说明中向甲方提出这个问题。

### 6.4 控件条

每格底部一条自己的精简控件（甲方场景是直接操作，不应先点聚焦再去底部找按钮）。

「Locate lesion」只出现在 MRI 槽 —— `lesionSliceIndexFor` 已经限定该动作只对 MRI 有意义（见 [`cases.ts`](../../../web/content/cases.ts) 中该函数的文档）。

现有的 `provideStageControls` / `useStageControls`（页面级单例 provide/inject）需要改为**每面板一份**。最直接的做法是控件条移入 `CopperStage` 内部渲染，从而彻底去掉这套 provide/inject 桥接 —— 它当初存在的唯一理由是控件条位于 layout 的兄弟 slot 里。这同时简化了 [`[[modality]].vue`](../../../web/app/pages/[slug]/[[modality]].vue) 与 [`default.vue`](../../../web/app/layouts/default.vue) 的 `#controls` slot。

---

## 7. 缓存与内存预算（第 5 条）

### 7.1 页面 key

[`pageKey.ts`](../../../web/app/utils/pageKey.ts) 的 `casePageKey` 改为对所有病例返回同一个常量，使三个 stage 实例跨全部病例导航存活。

404 行为仍由 `definePageMeta({ validate })` 保证：validate 守卫在每次导航都运行，与组件实例是否复用无关（该文件现有注释已论证这一点，需更新措辞但结论不变）。

`isMorphFamilyGroup` 保留原义，继续只用于门控 density 交叉淡入。

### 7.2 按字节的共享预算

新增一个全局场景记账 composable（跨三个面板共享）：

- 每个已建成的场景登记其解码字节数：NRRD 取 `volume.data.byteLength`；GLB 按文件大小估（本目录内 GLB 均 ≤ 1.05MB，精度无关紧要）
- 预算由 `navigator.deviceMemory` 推算：≥ 8GB 用 500MB，< 8GB 或该 API 不可用时用 250MB
- LRU 驱逐，**任何面板当前正在显示的场景永不驱逐**（pinned）
- `MAX_CACHED_SCENES = 3` 常量删除

`useModalityScene` 现有的 `residentScenes` / `recentScenes` / `evictOverflow` / `pickEvictionVictim` 改为委托给这个共享记账器，其余（`evictScene` 的 GPU 释放、`adoptSceneName` 的改名逻辑）保持不变。

### 7.3 已知取舍

五个 lesion 病例的 anatomy 都是同一个 `density75.glb`，但场景按 `${slug}:${modality.id}` 命名，因此会各建一个场景装同一个模型（各约 0.8MB 显存，HTTP 层仍命中浏览器缓存）。按资产 URL 而非 slug 给 anatomy 场景命名可以消除这点，但会与 `adoptSceneName`（density 形变后改名的机制）产生冲突，不值得。记录在此。

---

## 8. 内容与导航

### 8.1 移除 BI-RADS（第 3 条）

- 删除 [`CaseHeader.vue`](../../../web/app/components/content/CaseHeader.vue) 的 BI-RADS 徽章
- 删除同文件的 "Reference density background: grade X" 整行（含那个 info 图标）
- 删除 `Case.biRads`、`Case.referenceDensity` 字段与 `BiRads` 类型，以及 `densityCase()` / `lesionCase()` 中对应的参数
- density 四项的 `title` 从 `'A'`/`'B'`/`'C'`/`'D'` 改为 `'Density A'`…`'Density D'`

`title` 是导航标签而非医学文案，[`types.ts`](../../../web/content/types.ts) 已明确标注 "Not medical copy, so it may be adjusted"，可改。`heading`（`Almost entirely fat` 等）保持不变。

### 8.2 The Breast 作为首页行（第 8 条）

`the-breast` 从 [`CaseSidebar.vue`](../../../web/app/components/nav/CaseSidebar.vue) 的分组循环中摘出，作为侧栏顶部独立一行：

```
┌────────────────────────┐
│ ◉  The Breast          │  ← 图标 + 加粗，无圆点
├────────────────────────┤  ← 分隔线
│ BREAST DENSITY         │
│  ·  Density A          │
│  ·  Density B          │
│  ·  Density C          │
│  ·  Density D          │
│ BENIGN CONDITIONS      │
│  ·  Cyst               │
│  ·  Fibroadenoma       │
│ BREAST CANCER          │
│  ·  DCIS               │
│  ·  Lobular            │
│  ·  Ductal             │
└────────────────────────┘
```

`GROUP_LABEL` 中的 `overview: ''` 条目随之删除，`groups` 计算属性的 `order` 数组不再含 `'overview'`。

它已经是 `/` 的 302 目标（[`pages/index.vue`](../../../web/app/pages/index.vue)），此处只是让视觉与之相符。

### 8.3 侧栏图标（第 9 条）

- 首页行一个图标
- Breast Density / Benign Conditions / Breast Cancer 三个**分组标题**各一个图标
- 具体条目保持现有的小圆点

不给 9 个病例各配一个图标：A/B/C/D 四个密度等级、Cyst/Fibroadenoma、DCIS/Lobular/Ductal 很难用 16px 图形区分，会重蹈 [`ModalityStepper.vue`](../../../web/app/components/stage/ModalityStepper.vue) 旧图标那次「完全搞不懂」的覆辙。

图标画法遵循 `ModalityStepper` 已确立的原则：纯描边无填充、16px 可读、画出实际含义而非抽象几何、继承当前颜色。

### 8.4 About 按钮（第 10 条）

`ml-auto` 从内容面板折叠按钮移到 About 链接上（或把两者包进一个 `ml-auto` 容器）。xl+ 的视觉顺序不变。

---

## 9. PWA（第 1 条）

### 9.1 依赖与图标

装 `@vite-pwa/nuxt`（`@nuxtjs/pwa` 是 Nuxt 2 模块，不可用）。

图标从本仓库历史取，无需外部网络：

```
git show main:frontend/static/icon.png
```

由它生成 192×192、512×512、512×512 maskable、apple-touch-icon（180×180），以及替换现有的 `public/favicon.ico`。

**待向甲方提出**：`main:frontend/static/icon.png` 只有 88×88（8-bit RGB，无 alpha）。由它放大出的 512×512 maskable 图标在主屏上明显发虚。仓库与其历史中没有更高分辨率的副本。若甲方能提供矢量图或 ≥512px 的位图，放到 `web/public/icon.png` 后重跑 `yarn icons` 即可，无需改代码。

### 9.2 manifest

沿用旧版字段（[`legacy/nuxt.config.js`](../../../legacy/nuxt.config.js)）：

| 字段 | 值 |
|---|---|
| `name` | `Breast Educational Resource` |
| `short_name` | `Breast Education App` |
| `description` | `An ABI Education App for Breast Cancer.` |
| `theme_color` | `#ffffff` |

### 9.3 缓存范围：仅应用壳

Workbox `globPatterns` 只含 HTML / JS / CSS / 字体 / `logos/` / `team/`，**显式排除 `modelView/**`**。

理由有二：影像资产共约 355MB；且仓库中已有实测记录，Chromium 拒绝在 HTTP 缓存中存放超过数 MB 的响应（见 [`[[modality]].vue`](../../../web/app/pages/[slug]/[[modality]].vue) 中关于 §9.2 prefetch 的实测更正）。影像走网络，不进 Cache Storage。

「离线讲课」若确有需求，作为独立子项目另行评估。

### 9.4 需验证

`nuxi generate` + GitHub Pages 子路径（`NUXT_APP_BASE_URL=/te-uma/`）下 service worker 的 scope 与 `start_url` 必须正确解析，否则安装后打开的是 404。

---

## 10. 测试影响

### 10.1 需修改的现有测试

`cases.test.ts`、`pageKey.test.ts`、`CaseSidebar.test.ts`、`ModalityStepper.test.ts`、`CasePage.test.ts`、`DefaultLayout.test.ts`、`useModalityScene.test.ts`、`CopperStage.test.ts`、`StageControls.test.ts`，以及全部 4 个 playwright spec（`stage.spec.ts`、`a11y.spec.ts`、`acceptance.spec.ts`、`production.spec.ts`）。

### 10.2 需新增的覆盖

| 覆盖点 | 层级 |
|---|---|
| `panels` → `modalities` 派生、槽位查找、变体默认值为 3D | 单测 |
| 字节预算记账与 LRU 驱逐、pinned 场景不被驱逐 | 单测 |
| `c.modalities` 与 `c.panels.flatMap(...)` 完全一致 | 单测 |
| fit-to-view 距离计算（给定包围盒与宽高比） | 单测 |
| 用户摆过相机后 resize 不重算取景；Reset 后恢复重算 | 单测 |
| 五个 lesion 病例各有 anatomy 面板且指向 density75.glb | 单测 |
| BI-RADS 相关字段与 UI 已完全移除 | 单测 |
| 容器 ≥1000px 呈三联、<1000px 呈单联 | 浏览器 |
| 单联时非焦点面板不发起资产请求 | 浏览器 |
| 跨病例导航返回后不重新下载已加载的资产 | 浏览器 |
| PWA manifest 可达、SW 已注册、`modelView/**` 不在预缓存清单中 | 浏览器 |
| About 链接在 xl 以下右对齐 | 单测（类名）+ 浏览器（位置） |

---

## 11. 本轮不做：第 4 条

甲方原话是「The camera for threejs for the MRI might need to be repositioned as all the images a very dark」。

初步判断根因不是相机而是窗宽窗位：[`installFastSliceRepaint.ts`](../../../web/app/composables/installFastSliceRepaint.ts) 的灰度映射为 `(raw - windowLow) * 255 / (windowHigh - windowLow)`，而 `windowLow`/`windowHigh` 由 copper3d 直接取自体数据的 min/max。MRI 中少数极亮体素（脂肪、噪声尖峰）会把窗口拉满，组织灰阶被压到很低。乳腺 X 线的动态范围更均匀，所以只有 MRI 被抱怨。

**该判断未经实测，本文档不据此设计。** §6.3 的 fit-to-view 会让 MRI 画面显著变大，可能部分缓解主观感受，但**不视为对第 4 条的答复**。

待甲方确认后，另起一轮，先用 playwright 实测 canvas 像素直方图确认根因（仓库已有 `pngjs` 依赖与画布像素测量先例），再决定是修改默认窗口、还是在控件条上提供 brightness/contrast 控件（旧版 copper3d GUI 本有这组控件，新版以 `openGui: false` 关闭）。

---

## 12. 交付顺序建议

彼此独立、可并行的小项：§8.4（About）、§9（PWA）、§8.1（BI-RADS）、§8.2 + §8.3（侧栏）。

有依赖链的主干：§4（槽位模型）→ §5（三实例）→ §6（布局与取景）→ §7（缓存预算）。§7 也可先于 §5 单独落地（只改 pageKey 与预算），能独立验证第 5 条。
