const DEBUG_PREFIX = "[Shopify Helper][Admin]";

/** Set to `true` to print `[Shopify Helper][Admin]` logs in DevTools; `false` silences them. */
const ADMIN_DEBUG_ENABLED = false;

function debugLog(...args) {
  if (!ADMIN_DEBUG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.log(DEBUG_PREFIX, ...args);
}

function debugGroup(title, payload) {
  if (!ADMIN_DEBUG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.groupCollapsed(`${DEBUG_PREFIX} ${title}`);
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console.log(payload);
  }
}

function debugGroupEnd() {
  if (!ADMIN_DEBUG_ENABLED) return;
  // eslint-disable-next-line no-console
  console.groupEnd();
}

function isThemesPage() {
  try {
    const host = location.hostname;
    const path = location.pathname || "";
    if (host === "admin.shopify.com") {
      return /\/themes(\/|$|[?#])/i.test(path);
    }
    if (host === "online-store-web.shopifyapps.com") {
      return /\/themes/i.test(path);
    }
    return false;
  } catch {
    return false;
  }
}

/** 含 open Shadow Root 的查询（Polaris / iframe 内常见） */
function collectQueryRoots(root, depth = 0, maxDepth = 14) {
  const roots = [];
  if (!root || typeof root.querySelectorAll !== "function") return roots;
  roots.push(root);
  if (depth >= maxDepth) return roots;
  root.querySelectorAll("*").forEach((node) => {
    const sr = node.shadowRoot;
    if (sr) roots.push(...collectQueryRoots(sr, depth + 1, maxDepth));
  });
  return roots;
}

function querySelectorAllDeep(selector) {
  const seen = new Set();
  const out = [];
  for (const r of collectQueryRoots(document.documentElement)) {
    r.querySelectorAll(selector).forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
    });
  }
  return out;
}

/**
 * 从主题编辑器链接解析店铺 handle 与主题数字 id。
 * 例：https://admin.shopify.com/store/keihen-store/themes/159925043419/editor
 */
function parseStoreAndThemeIdFromEditorHref(href) {
  if (!href) return null;
  const s = String(href).trim();
  const m = s.match(/\/store\/([^/]+)\/themes\/([^/?#]+)/i);
  if (!m) return null;
  const storeHandle = m[1];
  const themeId = m[2];
  if (!storeHandle || !themeId) return null;
  return { storeHandle, themeId };
}

function buildPreviewThemeUrl(storeHandle, themeId) {
  return `https://${storeHandle}.myshopify.com/?preview_theme_id=${encodeURIComponent(themeId)}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      return document.execCommand("copy");
    } finally {
      ta.remove();
    }
  }
}

const TOAST_EL_ID = "shopify-helper-admin-toast-el";
const TOAST_MS = 2800;
let adminToastHideTimer = null;

function removeAdminToastEl() {
  document.getElementById(TOAST_EL_ID)?.remove();
}

/**
 * 页面内 Toast：默认紧贴「当前复制按钮」上方；空间不足时改到按钮下方。
 * 背景固定为黑色（成功 / 失败一致）。
 */
function showAdminToast(message, anchorEl) {
  if (!message) return;
  removeAdminToastEl();

  const el = document.createElement("div");
  el.id = TOAST_EL_ID;
  el.setAttribute("data-shopify-helper", "admin-toast");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = message;

  const pad = 10;
  const gap = 8;
  const estHeight = 40;

  el.style.cssText = [
    "position:fixed",
    "z-index:2147483646",
    "max-width:min(360px,calc(100vw - 16px))",
    "padding:8px 14px",
    "border-radius:8px",
    "font-size:12px",
    "font-weight:600",
    "line-height:1.35",
    "color:#f5f5f5",
    "background:#000",
    "box-shadow:0 4px 16px rgba(0,0,0,.35)",
    "opacity:0",
    "text-align:center",
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    "pointer-events:none"
  ].join(";");

  (document.body || document.documentElement).appendChild(el);

  const rect = anchorEl?.getBoundingClientRect?.();
  const vw = window.innerWidth;

  if (rect && (rect.width > 0 || rect.height > 0)) {
    let cx = rect.left + rect.width / 2;
    cx = Math.min(vw - pad, Math.max(pad, cx));
    el.style.left = `${cx}px`;

    const roomAbove = rect.top;
    const above = roomAbove >= estHeight + gap;
    if (above) {
      el.style.top = `${rect.top}px`;
      el.style.bottom = "auto";
      el.style.transform = `translate(-50%,calc(-100% - ${gap}px))`;
    } else {
      el.style.top = `${rect.bottom}px`;
      el.style.bottom = "auto";
      el.style.transform = `translate(-50%,${gap}px)`;
    }
  } else {
    el.style.left = "50%";
    el.style.bottom = "16px";
    el.style.top = "auto";
    el.style.transform = "translateX(-50%)";
  }

  if (adminToastHideTimer != null) clearTimeout(adminToastHideTimer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = "opacity .2s ease";
      el.style.opacity = "1";
    });
  });

  adminToastHideTimer = setTimeout(() => {
    el.style.opacity = "0";
    const done = () => {
      el.remove();
      adminToastHideTimer = null;
    };
    el.addEventListener("transitionend", done, { once: true });
    setTimeout(done, 320);
  }, TOAST_MS);
}

const CLONE_MARK = "data-shopify-helper";
const CLONE_MARK_VALUE = "polaris-copy-clone";

function listButtonGroupDirectItems(group) {
  const fromClass = Array.from(group.children).filter((ch) => ch.classList?.contains("Polaris-ButtonGroup__Item"));
  if (fromClass.length) return fromClass;
  return Array.from(group.querySelectorAll(':scope > [class*="Polaris-ButtonGroup__Item"]'));
}

/** 最后一项为「原版」操作区：排除我们已插入的克隆行 */
function getTargetItemEl(group) {
  const items = listButtonGroupDirectItems(group).filter((el) => el.getAttribute(CLONE_MARK) !== CLONE_MARK_VALUE);
  if (!items.length) return null;
  return items[items.length - 1];
}

function groupAlreadyHasClone(group) {
  return Boolean(group.querySelector(`[${CLONE_MARK}="${CLONE_MARK_VALUE}"]`));
}

/**
 * 将 a 下 span 文案改为 Copy link（优先改叶子 span，避免嵌套 span 叠出两行字）
 */
function setAnchorSpansToCopyLink(anchorEl) {
  const leaves = Array.from(anchorEl.querySelectorAll("span")).filter((s) => !s.querySelector("span"));
  if (leaves.length === 1) {
    leaves[0].textContent = "Copy link";
    return;
  }
  if (leaves.length > 1) {
    leaves.forEach((s) => {
      s.textContent = "Copy link";
    });
    return;
  }
  anchorEl.textContent = "Copy link";
}

function wireCopyClone(copyEl, previewUrl) {
  const a = copyEl.querySelector("a");
  if (!a) return;

  a.removeAttribute("href");
  a.removeAttribute("target");
  a.setAttribute("role", "button");
  if (!a.hasAttribute("tabindex")) a.setAttribute("tabindex", "0");
  a.style.cursor = "pointer";

  const onActivate = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const anchor = /** @type {HTMLElement} */ (e.currentTarget);
    const ok = await copyToClipboard(previewUrl);
    if (ok) {
      showAdminToast("Preview link copied.", anchor);
    } else {
      showAdminToast("Copy failed. Please try again.", anchor);
      if (ADMIN_DEBUG_ENABLED) {
        // eslint-disable-next-line no-console
        console.warn(DEBUG_PREFIX, "Clipboard copy failed.");
      }
    }
  };

  a.addEventListener("click", onActivate);
  a.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(e);
    }
  });
}

function injectCopyLinkForButtonGroup(group) {
  if (groupAlreadyHasClone(group)) return;

  const targetEl = getTargetItemEl(group);
  if (!targetEl) return;

  const sourceAnchor = targetEl.querySelector("a[href]");
  if (!sourceAnchor) return;

  const parsed = parseStoreAndThemeIdFromEditorHref(sourceAnchor.getAttribute("href") || sourceAnchor.href);
  if (!parsed) return;

  const previewUrl = buildPreviewThemeUrl(parsed.storeHandle, parsed.themeId);

  const copyEl = targetEl.cloneNode(true);
  copyEl.setAttribute(CLONE_MARK, CLONE_MARK_VALUE);

  const copyAnchor = copyEl.querySelector("a");
  if (!copyAnchor) return;

  setAnchorSpansToCopyLink(copyAnchor);
  wireCopyClone(copyEl, previewUrl);

  group.appendChild(copyEl);
  debugLog("已注入 Copy link 克隆项。", {
    storeHandle: parsed.storeHandle,
    themeId: parsed.themeId,
    previewUrl
  });
}

function scanAndInject() {
  if (!isThemesPage()) return;
  debugGroup("Polaris-ButtonGroup 扫描并注入 Copy link", { 页面: location.href });

  const groups = querySelectorAllDeep(".Polaris-ButtonGroup");
  let injected = 0;
  for (const group of groups) {
    try {
      const before = groupAlreadyHasClone(group);
      injectCopyLinkForButtonGroup(group);
      if (!before && groupAlreadyHasClone(group)) injected += 1;
    } catch (err) {
      if (ADMIN_DEBUG_ENABLED) {
        // eslint-disable-next-line no-console
        console.warn(DEBUG_PREFIX, "注入失败：", err);
      }
    }
  }

  debugLog("扫描摘要：", { ButtonGroup数量: groups.length, 本次新注入数: injected });
  debugGroupEnd();
}

let scanDebounceTimer = null;
function scheduleScanAndInject() {
  if (scanDebounceTimer != null) clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    scanDebounceTimer = null;
    scanAndInject();
  }, 120);
}

function startObserver() {
  const obs = new MutationObserver(() => scheduleScanAndInject());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  scheduleScanAndInject();
}

if (isThemesPage()) {
  debugLog("检测到 Themes 页面，开始监听 DOM（Polaris-ButtonGroup 方案）。");
  startObserver();
}
