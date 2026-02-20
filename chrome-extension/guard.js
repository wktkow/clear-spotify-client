/**
 * Clear Theme – Chrome Extension Guard
 *
 * Runs before theme.js at document_start. Handles:
 *   1. Toggling the theme CSS when disabled (CSS is injected by Chrome
 *      via manifest content_scripts.css, bypassing CSP).
 *   2. Skipping the splash screen in the Chrome extension.
 *   3. Login guard banner for logged-out users.
 *
 * This file is ONLY included in the Chrome extension build.
 */
(function () {
  "use strict";

  const DISABLED_KEY = "clear-extension-disabled";

  /* ── Diagnostics v6 – layout discovery ───────────────────────────── */

  console.log("[Clear Theme] guard.js v6-layout loaded");

  function dumpLayout() {
    console.log("[Clear Theme] === LAYOUT DUMP ===");

    // 1. Check our CSS is active
    const marker = getComputedStyle(document.documentElement)
      .getPropertyValue("--clear-ext-loaded")
      .trim();
    console.log(`[Clear Theme] marker=${marker} sheets=${document.styleSheets.length}`);

    // 2. Root element and its children (1 level)
    const root = document.querySelector('[data-testid="root"]');
    if (root) {
      console.log(
        `[Clear Theme] ROOT: <${root.tagName.toLowerCase()}> class="${root.className}"`,
      );
      for (const child of root.children) {
        const id = child.id ? `#${child.id}` : "";
        const tid = child.dataset.testid
          ? `[testid=${child.dataset.testid}]`
          : "";
        const cls = child.className
          ? ` class="${String(child.className).substring(0, 100)}"`
          : "";
        console.log(
          `[Clear Theme]   child: <${child.tagName.toLowerCase()}${id}${tid}${cls}> children=${child.children.length}`,
        );
        // One more level for layout children
        for (const gc of child.children) {
          const gcId = gc.id ? `#${gc.id}` : "";
          const gcTid = gc.dataset.testid
            ? `[testid=${gc.dataset.testid}]`
            : "";
          const gcCls = gc.className
            ? ` class="${String(gc.className).substring(0, 100)}"`
            : "";
          const gcTag = gc.tagName.toLowerCase();
          console.log(
            `[Clear Theme]     gc: <${gcTag}${gcId}${gcTid}${gcCls}> children=${gc.children.length}`,
          );
        }
      }
    } else {
      console.log("[Clear Theme] ROOT: NOT FOUND");
    }

    // 3. Search for known data-testid layout elements
    const testIds = [
      "root",
      "main-view",
      "main-view-container",
      "left-sidebar",
      "right-sidebar",
      "now-playing-bar",
      "now-playing-widget",
      "global-nav-bar",
      "top-bar",
      "player-controls",
      "footer",
      "buddy-feed",
      "library",
      "your-library",
      "nav-bar",
      "content-spacing",
    ];
    console.log("[Clear Theme] === DATA-TESTID SEARCH ===");
    for (const tid of testIds) {
      const el = document.querySelector(`[data-testid="${tid}"]`);
      if (el) {
        console.log(
          `[Clear Theme]   ${tid}: <${el.tagName.toLowerCase()}> class="${String(el.className).substring(0, 120)}"`,
        );
      }
    }

    // 4. Search for Root__* classes (Spicetify injects these on desktop)
    const rootEls = document.querySelectorAll('[class*="Root__"]');
    console.log(
      `[Clear Theme] === Root__* elements: ${rootEls.length} ===`,
    );
    rootEls.forEach((el) => {
      console.log(
        `[Clear Theme]   <${el.tagName.toLowerCase()}> class="${String(el.className).substring(0, 120)}"`,
      );
    });

    // 5. Search for main-nowPlayingBar (used heavily in our CSS)
    const npBar = document.querySelector(
      '[class*="main-nowPlayingBar"], footer',
    );
    if (npBar) {
      console.log(
        `[Clear Theme]   nowPlayingBar: <${npBar.tagName.toLowerCase()}> class="${String(npBar.className).substring(0, 120)}"`,
      );
    }

    // 6. Find elements with class containing "main-" (Spotify's BEM naming)
    const mainEls = new Set();
    document.querySelectorAll('[class*="main-"]').forEach((el) => {
      String(el.className)
        .split(/\s+/)
        .forEach((c) => {
          if (c.startsWith("main-")) mainEls.add(c);
        });
    });
    console.log(
      `[Clear Theme] === Unique main-* classes (${mainEls.size}): ${[...mainEls].sort().join(", ")} ===`,
    );
  }

  setTimeout(dumpLayout, 5000);

  /* ── CSS toggle ───────────────────────────────────────────────────── */

  /**
   * Toggle our theme CSS. Chrome injects manifest CSS as <style> elements.
   * We find ours by checking for the --clear-ext-loaded marker in the rules,
   * or by checking for a chrome-extension:// href.
   */
  function setThemeSheetsDisabled(disabled) {
    let found = 0;
    for (const sheet of document.styleSheets) {
      try {
        // Check href for chrome-extension://
        if (sheet.href && sheet.href.includes("chrome-extension://")) {
          sheet.disabled = disabled;
          found++;
          continue;
        }
        // Check inline styles for our marker
        if (!sheet.href && sheet.cssRules) {
          for (let i = 0; i < Math.min(sheet.cssRules.length, 5); i++) {
            if (
              sheet.cssRules[i].cssText &&
              sheet.cssRules[i].cssText.includes("--clear-ext-loaded")
            ) {
              sheet.disabled = disabled;
              found++;
              break;
            }
          }
        }
      } catch (e) {
        /* cross-origin sheet, ignore */
      }
    }
    return found;
  }

  /* ── Disabled state ───────────────────────────────────────────────── */

  // If user previously clicked "Disable", turn off the CSS until logged in.
  if (localStorage.getItem(DISABLED_KEY) === "true") {
    window.__clearExtensionDisabled = true;

    // Aggressively disable sheets — they may not be in styleSheets yet
    const tryDisable = () => setThemeSheetsDisabled(true);
    tryDisable();
    const iv = setInterval(() => {
      if (tryDisable() >= 2) clearInterval(iv);
    }, 50);
    setTimeout(() => clearInterval(iv), 5000);

    document.addEventListener("DOMContentLoaded", tryDisable, { once: true });
    window.addEventListener("load", tryDisable, { once: true });

    // Re-enable automatically on login
    const recheck = setInterval(() => {
      tryDisable();
      if (isLoggedIn()) {
        localStorage.removeItem(DISABLED_KEY);
        window.__clearExtensionDisabled = false;
        clearInterval(recheck);
        window.location.reload();
      }
    }, 2000);

    return; // theme.js will also exit early
  }

  /* ── Splash skip ──────────────────────────────────────────────────── */

  // The splash screen is a desktop-only UX feature. Skip it entirely
  // in the Chrome extension so the page is never covered by a black overlay.
  window.__clearExtensionNoSplash = true;
  function applyNoSplash() {
    if (document.body) {
      document.body.classList.add("clear-no-splash");
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => document.body.classList.add("clear-no-splash"),
        { once: true },
      );
    }
  }
  applyNoSplash();

  /* ── Login guard ──────────────────────────────────────────────────── */

  function isLoggedIn() {
    // Logged-in Spotify has a user widget; logged-out pages show login buttons
    if (
      document.querySelector(
        '[data-testid="user-widget-link"], [data-testid="user-widget"]',
      )
    ) {
      return true;
    }
    // Login/signup page
    if (
      window.location.pathname.startsWith("/login") ||
      window.location.pathname.startsWith("/signup")
    ) {
      return false;
    }
    // If there's a login button visible, user is not logged in
    if (
      document.querySelector(
        '[data-testid="login-button"], [data-testid="signup-button"]',
      )
    ) {
      return false;
    }
    // Default: assume logged in (don't block on unknown pages)
    return true;
  }

  function showBanner() {
    // Don't double-create
    if (document.getElementById("clear-guard-banner")) return;

    const banner = document.createElement("div");
    banner.id = "clear-guard-banner";
    banner.style.cssText = [
      "position: fixed",
      "bottom: 1rem",
      "left: 50%",
      "transform: translateX(-50%)",
      "z-index: 999999",
      "background: #181818",
      "color: #fff",
      "border: 1px solid #333",
      "border-radius: 0.5rem",
      "padding: 0.875rem 1.25rem",
      "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "font-size: 0.8125rem",
      "line-height: 1.5",
      "max-width: 28rem",
      "text-align: center",
      "box-shadow: 0 4px 24px rgba(0,0,0,0.5)",
    ].join(";");

    const message = document.createElement("p");
    message.style.cssText = "margin: 0 0 0.625rem 0";
    message.textContent =
      "Clear Theme is active but you're not logged in. If you're having trouble logging in or see visual bugs, you can disable the theme until you sign in.";

    const btn = document.createElement("button");
    btn.textContent = "Disable until login";
    btn.style.cssText = [
      "background: #fff",
      "color: #000",
      "border: none",
      "border-radius: 9999px",
      "padding: 0.5rem 1.25rem",
      "font-size: 0.8125rem",
      "font-weight: 600",
      "cursor: pointer",
    ].join(";");
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#e0e0e0";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#fff";
    });
    btn.addEventListener("click", () => {
      localStorage.setItem(DISABLED_KEY, "true");
      window.location.reload();
    });

    banner.appendChild(message);
    banner.appendChild(btn);
    document.body.appendChild(banner);
  }

  function removeBanner() {
    const el = document.getElementById("clear-guard-banner");
    if (el) el.remove();
  }

  // Wait for the page to have enough DOM to check login state
  function init() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", init, { once: true });
      return;
    }

    // Initial check after a short delay for Spotify's SPA to hydrate
    setTimeout(() => {
      if (!isLoggedIn()) {
        showBanner();
      }

      // Keep watching – Spotify is a SPA so login state can change
      new MutationObserver(() => {
        if (isLoggedIn()) {
          removeBanner();
          localStorage.removeItem(DISABLED_KEY);
        } else if (!document.getElementById("clear-guard-banner")) {
          showBanner();
        }
      }).observe(document.body, { childList: true, subtree: true });
    }, 1500);
  }

  init();
})();
