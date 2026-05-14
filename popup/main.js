/// <reference types="@crxjs/vite-plugin/client" />

import storefrontInjectPath from "../src/inject/storefront-main.js?script&module";
import "./popup.css";

const $ = (id) => document.getElementById(id);

const STOREFRONT_INJECT_URL = chrome.runtime.getURL(
  storefrontInjectPath.startsWith("/") ? storefrontInjectPath.slice(1) : storefrontInjectPath
);

const TOAST_MS = 2800;
let toastHideTimer = null;

/** 产品页轮询当前 tab，变体或 ?variant= 变化时刷新 SKU */
const PRODUCT_POLL_MS = 700;
let productPollTimer = null;
let productPollTabId = null;

function clearProductPoll() {
  if (productPollTimer != null) {
    clearInterval(productPollTimer);
    productPollTimer = null;
  }
  productPollTabId = null;
}

function setStatus(text) {
  $("status").textContent = text;
}

/** @param {"info"|"success"|"error"} variant */
function showToast(message, variant = "info") {
  if (!message) return;
  const root = document.getElementById("toastRoot");
  if (!root) return;

  root.innerHTML = "";
  const el = document.createElement("div");
  el.className = `toast toast--${variant}`;
  el.textContent = message;
  root.appendChild(el);

  clearTimeout(toastHideTimer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("toast--visible"));
  });

  toastHideTimer = setTimeout(() => {
    el.classList.remove("toast--visible");
    const cleanup = () => {
      el.remove();
      toastHideTimer = null;
    };
    el.addEventListener("transitionend", cleanup, { once: true });
    window.setTimeout(cleanup, 320);
  }, TOAST_MS);
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function runStorefrontExtract(tabId, injectPageScriptUrl) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [injectPageScriptUrl],
    func: async (src) => {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const existing = document.querySelector(`script[data-shopify-helper-request-id="${requestId}"]`);
      if (existing) existing.remove();

      const result = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("message", onMessage);
          resolve({ isShopify: false, error: "timeout" });
        }, 1500);

        function onMessage(event) {
          const data = event?.data;
          if (!data || data.source !== "shopify-helper") return;
          if (data.requestId !== requestId) return;
          clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          resolve(data.payload);
        }

        window.addEventListener("message", onMessage);

        const scriptUrl = new URL(src);
        scriptUrl.searchParams.set("shopifyHelperRid", requestId);

        const s = document.createElement("script");
        s.type = "module";
        s.src = scriptUrl.toString();
        s.async = true;
        s.setAttribute("data-shopify-helper-request-id", requestId);
        (document.head || document.documentElement).appendChild(s);
        s.onload = () => s.remove();
      });

      return result;
    }
  });
  return result || null;
}

/**
 * 从后台 Admin URL 或 Online Store 内嵌页 URL 解析店铺标识。
 * @returns {{ handle: string, shopDomain: string } | null}
 */
function parseShopContextFromTabUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "admin.shopify.com") {
      const m = u.pathname.match(/^\/store\/([^/]+)/);
      if (m && m[1]) {
        const handle = m[1];
        return { handle, shopDomain: `${handle}.myshopify.com` };
      }
    }
    if (u.hostname === "online-store-web.shopifyapps.com") {
      const shop = u.searchParams.get("shop");
      if (shop) {
        if (/\.myshopify\.com$/i.test(shop)) {
          return { handle: shop.replace(/\.myshopify\.com$/i, ""), shopDomain: shop };
        }
        return { handle: shop, shopDomain: `${shop}.myshopify.com` };
      }
      const hostB64 = u.searchParams.get("host");
      if (hostB64) {
        try {
          const decoded = atob(hostB64);
          const m = decoded.match(/\/store\/([^/]+)/);
          if (m && m[1]) {
            const handle = m[1];
            return { handle, shopDomain: `${handle}.myshopify.com` };
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function renderNotShopify() {
  clearProductPoll();
  $("adminContextPanel").classList.add("hidden");
  $("notShopify").classList.remove("hidden");
  $("shopifyPanel").classList.add("hidden");
  setStatus("Not Shopify");
}

function renderAdminShop(ctx) {
  clearProductPoll();
  $("notShopify").classList.add("hidden");
  $("shopifyPanel").classList.add("hidden");
  $("adminContextPanel").classList.remove("hidden");
  setStatus("Shopify admin");

  $("adminStoreHandle").textContent = ctx.handle;
  $("adminShopDomain").textContent = ctx.shopDomain;

  bindInfoRowCopy();
}

function bindInfoRowCopy() {
  document.querySelectorAll("[data-copy-row]").forEach((row) => {
    if (row.dataset.copyBound === "1") return;
    row.dataset.copyBound = "1";
    row.addEventListener("click", async () => {
      const valEl = row.querySelector(".info-value");
      const text = (valEl?.textContent ?? "").trim();
      const label = (row.querySelector(".info-label")?.textContent ?? "value").trim();
      try {
        await copyText(text || "");
        showToast(`Copied ${label}`, "success");
      } catch (e) {
        showToast(`Copy failed: ${String(e?.message || e)}`, "error");
      }
    });
  });
}

/**
 * @param {unknown} data
 * @param {{ silent?: boolean; tabId?: number }} [options]
 */
function renderShopify(data, options = {}) {
  const silent = options.silent === true;
  const tabId = options.tabId;

  clearProductPoll();

  $("notShopify").classList.add("hidden");
  $("adminContextPanel").classList.add("hidden");
  $("shopifyPanel").classList.remove("hidden");
  setStatus("Shopify detected");

  const shop = data?.shopify?.shop || "N/A";
  const themeId = data?.shopify?.theme?.id ?? "N/A";
  const themeName = data?.shopify?.theme?.name ?? "N/A";
  const schemaName = data?.shopify?.theme?.schema_name ?? "N/A";
  const schemaVersion = data?.shopify?.theme?.schema_version ?? "N/A";

  $("shop").textContent = shop;
  $("themeId").textContent = String(themeId);
  $("themeName").textContent = String(themeName);
  $("schemaName").textContent = String(schemaName);
  $("schemaVersion").textContent = String(schemaVersion);

  const productSkuSection = $("productSkuSection");
  const productHandleEl = $("productHandle");
  const productIdEl = $("productId");
  const variantIdEl = $("variantId");
  const variantSkuEl = $("variantSku");
  const isProductPage = Boolean(data?.computed?.isProductPage);
  const handleVal = data?.computed?.productHandle;
  const productIdVal = data?.computed?.productId;
  const variantId = data?.computed?.currentVariantId;
  const sku = data?.computed?.currentVariantSku;

  if (productSkuSection && variantSkuEl) {
    if (isProductPage) {
      productSkuSection.classList.remove("hidden");
      if (productHandleEl) {
        productHandleEl.textContent = handleVal != null && handleVal !== "" ? String(handleVal) : "—";
      }
      if (productIdEl) {
        productIdEl.textContent = productIdVal != null && productIdVal !== "" ? String(productIdVal) : "—";
      }
      if (variantIdEl) {
        variantIdEl.textContent = variantId != null && variantId !== "" ? String(variantId) : "—";
      }
      variantSkuEl.textContent = sku != null && sku !== "" ? String(sku) : "—";
    } else {
      productSkuSection.classList.add("hidden");
      if (productHandleEl) productHandleEl.textContent = "";
      if (productIdEl) productIdEl.textContent = "";
      if (variantIdEl) variantIdEl.textContent = "";
      variantSkuEl.textContent = "";
    }
  }

  const copyBtn = $("copyPreviewLink");
  const openAdminBtn = $("openAdminLink");

  copyBtn.disabled = !data?.computed?.previewUrl;
  openAdminBtn.disabled = !data?.computed?.adminUrl;

  copyBtn.onclick = async () => {
    try {
      if (!data?.computed?.previewUrl) return;
      await copyText(data.computed.previewUrl);
      showToast("Copied preview link.", "success");
    } catch (e) {
      showToast(`Copy failed: ${String(e?.message || e)}`, "error");
    }
  };

  openAdminBtn.onclick = async () => {
    try {
      if (!data?.computed?.adminUrl) return;
      await chrome.tabs.create({ url: data.computed.adminUrl });
      showToast("Opened admin in a new tab.", "success");
    } catch (e) {
      showToast(`Open failed: ${String(e?.message || e)}`, "error");
    }
  };

  if (!silent) {
    if (!data?.computed?.previewUrl) {
      showToast("Preview link unavailable (missing theme id or shop domain).", "info");
    } else if (!data?.computed?.adminUrl) {
      const pageType = data?.analytics?.meta?.page?.pageType;
      showToast(
        pageType ? `Admin link not available for pageType=${pageType}.` : "Admin link unavailable (missing ShopifyAnalytics.meta).",
        "info"
      );
    }
  }

  bindInfoRowCopy();

  if (isProductPage && typeof tabId === "number" && tabId >= 0) {
    productPollTabId = tabId;
    productPollTimer = setInterval(async () => {
      const tid = productPollTabId;
      if (tid == null) return;
      try {
        const r = await runStorefrontExtract(tid, STOREFRONT_INJECT_URL);
        if (r?.isShopify) {
          renderShopify(r, { silent: true, tabId: tid });
        } else {
          clearProductPoll();
        }
      } catch {
        /* ignore */
      }
    }, PRODUCT_POLL_MS);
  }
}

async function main() {
  setStatus("Loading…");
  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab.");

    const adminCtx = parseShopContextFromTabUrl(tab.url || "");
    const result = await runStorefrontExtract(tab.id, STOREFRONT_INJECT_URL);
    if (result?.isShopify) {
      renderShopify(result, { silent: false, tabId: tab.id });
      return;
    }
    if (adminCtx) {
      renderAdminShop(adminCtx);
      return;
    }
    renderNotShopify();
  } catch (e) {
    renderNotShopify();
    showToast(`Error: ${String(e?.message || e)}`, "error");
  }
}

bindInfoRowCopy();
main();
