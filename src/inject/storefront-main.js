(function () {
  function safeGet(obj, path) {
    try {
      return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
    } catch {
      return undefined;
    }
  }

  function isProbablyShopify() {
    const shop = safeGet(window, "Shopify.shop");
    const pageType = safeGet(window, "ShopifyAnalytics.meta.page.pageType");
    if (shop) return true;
    if (pageType) return true;

    const hasShopifyMeta =
      document.querySelector('meta[name="shopify-checkout-api-token"]') ||
      document.querySelector('meta[name="shopify-digital-wallet"]') ||
      document.querySelector('meta[name="shopify-api-key"]');
    return Boolean(hasShopifyMeta);
  }

  function shopDomainToHandle(shop) {
    if (!shop || typeof shop !== "string") return null;
    return shop.replace(/\.myshopify\.com$/i, "");
  }

  function computePreviewUrl(shop, themeId) {
    if (!themeId || !shop) return null;
    const current = new URL(location.href);
    const hasPreviewKey = current.searchParams.has("preview_key");

    if (hasPreviewKey) {
      current.host = shop;
      current.protocol = "https:";
    }

    current.searchParams.set("preview_theme_id", String(themeId));
    return current.toString();
  }

  function computeAdminUrl(shop, analyticsMeta) {
    const pageType = safeGet(analyticsMeta, "page.pageType");
    const resourceId = safeGet(analyticsMeta, "page.resourceId");
    if (!pageType || !resourceId || !shop) return null;

    const storeHandle = shopDomainToHandle(shop);
    if (!storeHandle) return null;

    if (pageType === "page") return `https://admin.shopify.com/store/${storeHandle}/pages/${resourceId}`;
    if (pageType === "product") return `https://admin.shopify.com/store/${storeHandle}/products/${resourceId}`;
    if (pageType === "collection") return `https://admin.shopify.com/store/${storeHandle}/collections/${resourceId}`;
    if (pageType === "blog") return `https://admin.shopify.com/store/${storeHandle}/blogs/${resourceId}`;
    if (pageType === "article") {
      return `https://admin.shopify.com/store/${storeHandle}/content/articles/${resourceId}`;
    }
    return null;
  }

  /** Theme editor on admin: …/themes/{id}/editor with optional ?previewPath= */
  function isValidThemeEditorAdminUrl(href) {
    if (!href || typeof href !== "string") return false;
    try {
      const u = new URL(href, location.href);
      if (u.hostname !== "admin.shopify.com") return false;
      if (!/\/themes\//i.test(u.pathname) || !/\/editor\b/i.test(u.pathname)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function tryExtractCustomizeUrlFromPreviewBarIframe() {
    try {
      const iframe = document.getElementById("PBarNextFrame");
      if (!iframe || iframe.tagName !== "IFRAME") return null;
      const doc = iframe.contentDocument;
      if (!doc) return null;
      const boxes = doc.querySelectorAll(".Polaris-Box");
      if (!boxes.length) return null;
      const last = boxes[boxes.length - 1];
      const a = last && last.querySelector && last.querySelector("a");
      const href = a && (a.href || a.getAttribute("href"));
      if (!href || !isValidThemeEditorAdminUrl(href)) return null;
      return new URL(href, location.href).href;
    } catch {
      return null;
    }
  }

  function normalizePathnameForPreviewPath() {
    try {
      let p = location.pathname || "/";
      if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
      return p.startsWith("/") ? p : `/${p}`;
    } catch {
      return "/";
    }
  }

  /** Appends `?view=` from the current storefront URL when present (any page type). */
  function appendViewQueryParamIfPresent(path) {
    if (!path || typeof path !== "string") return path;
    try {
      const view = new URL(location.href).searchParams.get("view");
      if (view != null && String(view).trim() !== "") {
        return `${path}?view=${encodeURIComponent(String(view).trim())}`;
      }
    } catch {
      /* ignore */
    }
    return path;
  }

  /** Storefront index: theme editor opens with no query (e.g. …/themes/123/editor). */
  function isStorefrontHome(analyticsMeta) {
    const pt = String(safeGet(analyticsMeta, "page.pageType") || "").toLowerCase();
    if (pt === "home" || pt === "index") return true;
    try {
      let p = location.pathname || "/";
      if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
      if (p === "" || p === "/") return true;
      if (/^\/[a-z]{2}(-[a-z]{2})?$/i.test(p)) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function buildBareThemeEditorUrl(shop, themeId) {
    const storeHandle = shopDomainToHandle(shop);
    if (!storeHandle || !themeId || !shop) return null;
    return `https://admin.shopify.com/store/${storeHandle}/themes/${themeId}/editor`;
  }

  /**
   * Product preview path: canonical `/products/{handle}` plus optional `?view=` from URL.
   */
  function productPreviewPathForCustomize(analyticsMeta) {
    const h = computeProductHandle(analyticsMeta);
    if (!h) return null;
    return appendViewQueryParamIfPresent(`/products/${h}`);
  }

  /**
   * Fallback when preview bar iframe is unavailable:
   * - Home: …/themes/{id}/editor (no params).
   * - Else: same gate as admin link + theme; product uses meta handle; other types use pathname;
   *   for any type, current URL `?view=` is appended to previewPath when present.
   */
  function computeCustomizeUrlFallback(shop, themeId, analyticsMeta) {
    if (!themeId || !shop) return null;

    if (isStorefrontHome(analyticsMeta)) {
      return buildBareThemeEditorUrl(shop, themeId);
    }

    if (!computeAdminUrl(shop, analyticsMeta)) return null;
    const storeHandle = shopDomainToHandle(shop);
    if (!storeHandle) return null;

    const pageType = safeGet(analyticsMeta, "page.pageType");
    let previewPath = null;
    if (pageType === "product") {
      previewPath = productPreviewPathForCustomize(analyticsMeta);
    } else {
      previewPath = appendViewQueryParamIfPresent(normalizePathnameForPreviewPath());
    }

    if (!previewPath) return null;
    const encoded = encodeURIComponent(previewPath);
    return `https://admin.shopify.com/store/${storeHandle}/themes/${themeId}/editor?previewPath=${encoded}`;
  }

  function computeCustomizeUrl(shop, themeId, analyticsMeta) {
    const fromIframe = tryExtractCustomizeUrlFromPreviewBarIframe();
    if (fromIframe) return fromIframe;
    return computeCustomizeUrlFallback(shop, themeId, analyticsMeta);
  }

  /** `?variant=` 与主题切换时 URL 往往最先更新，优先于 meta.selectedVariantId */
  function variantIdFromUrl() {
    try {
      const v = new URL(location.href).searchParams.get("variant");
      return v && String(v).trim() ? String(v).trim() : null;
    } catch {
      return null;
    }
  }

  function effectiveSelectedVariantId(meta) {
    if (!meta || typeof meta !== "object") return null;
    const fromUrl = variantIdFromUrl();
    if (fromUrl) return fromUrl;
    const sid = meta.selectedVariantId;
    if (sid == null || sid === "") return null;
    return String(sid);
  }

  function computeCurrentVariantSku(meta) {
    if (!meta || meta.page?.pageType !== "product") return null;
    const variants = meta.product?.variants;
    if (!Array.isArray(variants)) return null;
    const sel = effectiveSelectedVariantId(meta);
    if (!sel) return null;
    const v = variants.find((x) => x != null && String(x.id) === sel);
    if (!v || v.sku == null || String(v.sku).trim() === "") return null;
    return String(v.sku);
  }

  function computeProductHandle(meta) {
    if (!meta || meta.page?.pageType !== "product") return null;
    const h = meta.product?.handle;
    if (h == null || String(h).trim() === "") return null;
    return String(h);
  }

  function computeProductId(meta) {
    if (!meta || meta.page?.pageType !== "product") return null;
    const id = meta.product?.id;
    if (id == null || id === "") return null;
    return String(id);
  }

  function safeJsonSnapshot(value) {
    const seen = new WeakSet();
    try {
      return JSON.parse(
        JSON.stringify(value, (_k, v) => {
          if (typeof v === "function") return undefined;
          if (typeof v === "bigint") return String(v);
          if (typeof v === "object" && v !== null) {
            if (seen.has(v)) return "[Circular]";
            seen.add(v);
          }
          return v;
        })
      );
    } catch {
      return null;
    }
  }

  const requestId = (() => {
    try {
      const fromUrl = new URL(import.meta.url).searchParams.get("shopifyHelperRid");
      if (fromUrl) return fromUrl;
    } catch {
      /* ignore */
    }
    return document.currentScript?.getAttribute("data-shopify-helper-request-id") || null;
  })();

  const detected = isProbablyShopify();
  if (!detected) {
    window.postMessage(
      { source: "shopify-helper", requestId, payload: { isShopify: false } },
      "*"
    );
    return;
  }

  const shopify = window.Shopify || {};
  const analyticsMeta = safeGet(window, "ShopifyAnalytics.meta") || null;

  const shop = shopify.shop || null;
  const theme = shopify.theme || {};
  const themeId = theme.id ?? null;

  const payload = {
    isShopify: true,
    shopify: {
      shop: shopify.shop ?? null,
      locale: shopify.locale ?? null,
      currency: shopify.currency ?? null,
      country: shopify.country ?? null,
      theme: {
        name: theme.name ?? null,
        id: theme.id ?? null,
        schema_name: theme.schema_name ?? null,
        schema_version: theme.schema_version ?? null,
        role: theme.role ?? null,
        handle: theme.handle ?? null
      },
      previewMode: shopify.previewMode ?? null
    },
    analytics: { meta: analyticsMeta },
    computed: {
      previewUrl: computePreviewUrl(shop, themeId),
      adminUrl: computeAdminUrl(shop, analyticsMeta),
      customizeUrl: computeCustomizeUrl(shop, themeId, analyticsMeta),
      isProductPage: safeGet(analyticsMeta, "page.pageType") === "product",
      productHandle: computeProductHandle(analyticsMeta),
      productId: computeProductId(analyticsMeta),
      currentVariantId:
        safeGet(analyticsMeta, "page.pageType") === "product" ? effectiveSelectedVariantId(analyticsMeta) : null,
      currentVariantSku: computeCurrentVariantSku(analyticsMeta)
    },
    raw: {
      Shopify: safeJsonSnapshot(window.Shopify || null),
      ShopifyAnalyticsMeta: safeJsonSnapshot(analyticsMeta)
    }
  };

  window.postMessage({ source: "shopify-helper", requestId, payload }, "*");
})();

