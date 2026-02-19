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

  /* ── Diagnostics v5 ─────────────────────────────────────────────── */

  console.log("[Clear Theme] guard.js v5-deep loaded");

  function checkTheme(label) {
    const marker = getComputedStyle(document.documentElement)
      .getPropertyValue("--clear-ext-loaded")
      .trim();
    const spiceText = getComputedStyle(document.documentElement)
      .getPropertyValue("--spice-text")
      .trim();
    console.log(
      `[Clear Theme] ${label}: marker=${marker} --spice-text=${spiceText} sheets=${document.styleSheets.length}`,
    );

    // Find OUR stylesheet in document.styleSheets
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      try {
        const rules = sheet.cssRules;
        if (!rules) continue;
        for (let j = 0; j < Math.min(rules.length, 10); j++) {
          if (
            rules[j].cssText &&
            rules[j].cssText.includes("--clear-ext-loaded")
          ) {
            console.log(
              `[Clear Theme]   OUR SHEET: index=${i} rules=${rules.length} href=${sheet.href} ownerNode=${sheet.ownerNode?.tagName || "none"} disabled=${sheet.disabled}`,
            );
            for (let k = 0; k < Math.min(rules.length, 5); k++) {
              console.log(
                `[Clear Theme]     rule[${k}]: ${rules[k].cssText.substring(0, 120)}`,
              );
            }
            break;
          }
        }
      } catch (e) {
        /* cross-origin */
      }
    }

    // Check computed styles on key elements
    const navBar = document.getElementById("global-nav-bar");
    if (navBar) {
      const cs = getComputedStyle(navBar);
      console.log(
        `[Clear Theme]   #global-nav-bar: opacity=${cs.opacity} position=${cs.position} display=${cs.display}`,
      );
    } else {
      console.log(`[Clear Theme]   #global-nav-bar: NOT IN DOM`);
    }

    const mainView = document.querySelector(".Root__main-view");
    if (mainView) {
      const cs = getComputedStyle(mainView);
      console.log(
        `[Clear Theme]   .Root__main-view: borderRadius=${cs.borderRadius} border=${cs.border.substring(0, 60)}`,
      );
    } else {
      console.log(`[Clear Theme]   .Root__main-view: NOT IN DOM`);
    }

    const navBarEl = document.querySelector(".Root__nav-bar");
    if (navBarEl) {
      const cs = getComputedStyle(navBarEl);
      console.log(
        `[Clear Theme]   .Root__nav-bar: gridArea=${cs.gridArea}`,
      );
    }

    if (document.body) {
      const cs = getComputedStyle(document.body);
      console.log(
        `[Clear Theme]   body: color=${cs.color} classList=${document.body.className.substring(0, 80)}`,
      );
    }
  }

  setTimeout(() => checkTheme("AT 3s"), 3000);
  setTimeout(() => checkTheme("AT 10s"), 10000);

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
