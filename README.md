# Shopify Preview Link Helper

Chrome 扩展（Manifest V3），用于 Shopify 后台主题页一键复制预览链接，以及在前台弹窗中查看店铺 / 主题信息，并打开后台资源或 **主题编辑器（Customize）**。

---

## 功能

### 后台 · 主题（Themes）页

- 在 **在线商店 → 主题** 相关页面（含 Admin 内嵌的 `online-store-web.shopifyapps.com` iframe）识别每个主题操作区的 **Polaris 按钮组**。
- 在每组按钮末尾增加 **Copy link**：点击后复制  
  `https://{店铺handle}.myshopify.com/?preview_theme_id={主题ID}`  
  （handle 与主题 ID 从「编辑主题」等链接中解析，不写死。）

### 前台 · 扩展弹窗

在 **店铺前台** 打开任意页面后，点击浏览器工具栏中的扩展图标：

- 自动判断是否 Shopify 环境，展示 **shop**、**theme.id**、**theme.name**、**schema_name**、**schema_version**；每行可点击复制。
- **Copy preview link**：复制当前页的预览主题链接（含 `preview_theme_id`）。
- **Open admin link**：按当前页类型打开后台对应资源（支持 **page / product / collection / blog / article** 等，`article` 为 `…/content/articles/{id}` 形式）。
- **Open customize link**：在新标签打开 **主题编辑器**（`admin.shopify.com/store/{handle}/themes/{themeId}/editor…`）。解析顺序如下：
  1. **预览条 iframe（优先）**：若页面存在同域可读的 `<iframe id="PBarNextFrame">`，则取其文档中 **最后一个** `.Polaris-Box` 内的 **`a`** 的 `href`（须为 Admin 上的 `…/themes/…/editor` 链接，可带或不带 `previewPath`）。与主站 **跨域** 的 iframe 无法读内部 DOM，会自动走下一步。若本步成功，**直接使用该 URL**，不要求与 Open admin link 相同的 `resourceId` 判定。
  2. **拼接 `previewPath`（回退）**：须能拿到 **shop** 与 **theme.id**。**首页**（如 `pageType` 为 `home` / `index`，或路径为 `/`、常见单段语言根路径等）仅打开 **`…/themes/{themeId}/editor`**，**不带任何查询参数**。**非首页**还须满足与 **Open admin link** 相同的判定（`ShopifyAnalytics.meta` 的 `pageType` + `resourceId` 等），再按下述规则拼 `previewPath`：
     - **商品页**：`previewPath` 使用 **`/products/{handle}`**，其中 **handle** 来自 **`ShopifyAnalytics.meta.product.handle`**（不用地址栏 path，避免与 canonical 不一致）。
     - **其它模板**（page / collection / blog / article 等）：`previewPath` 使用当前页的 **`location.pathname`**（可做去尾斜杠）；若店铺使用自定义路由或语言前缀，可能与编辑器期望路径不完全一致。
     - **任意页（非首页）**：若当前 URL 带有 **`?view=…`**，会一并写入 `previewPath`（例如商品：`/products/{handle}?view=xxx`，经编码后出现在 `editor?previewPath=` 中）。
- **商品页** 额外展示（顺序）：**handle**、**product.id**、**variant.id**、**variant.sku**（数据来自 `ShopifyAnalytics.meta`）；切换变体或 `?variant=` 变化时会自动刷新。

### 在后台（非前台）打开弹窗

- 若当前标签为 Shopify Admin 等已识别上下文，弹窗会显示 **store**、**shop** 域名等简要信息，避免误报「非 Shopify 页」。

---

## 使用方法

1. **从 GitHub Releases 安装并在 Chrome 中加载**  
   - 在 GitHub 仓库页面右侧点击 **Releases**，下载最新版本（若为压缩包请先解压）。  
   - 打开 `chrome://extensions/` → 开启「开发者模式」→ 点击「加载未打包的扩展程」，选择解压后目录中的 **`dist`** 文件夹（不要选仓库根目录）。

2. **安装依赖并构建**（需已安装 Node.js）  
   - 在项目根目录执行：`npm install`  
   - 执行：`npm run build`  
   - 构建产物在 **`dist`** 目录；加载方式与第 1 步相同，「加载未打包的扩展程」时选择 **`dist`** 文件夹。

3. **更新代码后**  
   - 重新执行 `npm run build`（或使用 `npm run dev` 监听构建）  
   - 在 `chrome://extensions/` 中对该扩展点击「重新加载」。

4. **日常使用**  
   - **主题页**：进入后台主题列表，使用主题行上的 **Copy link**。  
   - **前台**：打开店铺页面 → 点击扩展图标 → 查看信息、复制字段，或使用 **Copy preview link** / **Open admin link** / **Open customize link**。

---

## 作者

- 邮箱：**k465534312@gmail.com**
