/* PWA registration and install prompt handler for Piggybanks.app */

(() => {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator && window.navigator.standalone === true);

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .catch(err => {
          console.warn('[PWA] Service worker registration failed:', err);
        });
    });
  }

  let deferredPrompt = null;
  const INSTALL_BANNER_ID = 'pwa-install-banner';

  // Expose minimal API and wire optional header buttons
  function updateInstallButtons() {
    const available = !!deferredPrompt && !isStandalone;
    const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) <= 768;
    const buttons = document.querySelectorAll('[data-install-app]');
    buttons.forEach(btn => {
      const show = available && !isSmallScreen; // Only show header button on desktop; mobile uses the banner
      btn.style.display = show ? '' : 'none';
      if (!btn.__pwaBound) {
        btn.addEventListener('click', async () => {
          try {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
          } catch (_) {
            // ignore
          } finally {
            deferredPrompt = null;
            updateInstallButtons();
          }
        });
        btn.__pwaBound = true;
      }
    });
  }

  window.PiggyPWA = window.PiggyPWA || {};
  window.PiggyPWA.isInstallAvailable = () => !!deferredPrompt && !isStandalone;
  window.PiggyPWA.requestInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (_) {}
      deferredPrompt = null;
      updateInstallButtons();
    }
  };

  function createBanner() {
    if (document.getElementById(INSTALL_BANNER_ID)) return;
    const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) <= 768;
    if (!isSmallScreen) return;
    const banner = document.createElement('div');
    banner.id = INSTALL_BANNER_ID;
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;background:#0ea5e9;color:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(2,6,23,.25);padding:12px 14px;display:flex;align-items:center;gap:10px;z-index:2147483646;';
    banner.innerHTML = `
      <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em">Install Piggybanks.app</div>
      <div style="flex:1"></div>
      <button id="pwaInstallBtn" style="background:#fff;color:#0ea5e9;border:none;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer">Install</button>
      <button id="pwaDismissBtn" title="Dismiss" aria-label="Dismiss install" style="background:transparent;color:#fff;border:none;font-size:18px;padding:6px 8px;cursor:pointer">✕</button>
    `;
    document.body.appendChild(banner);

    const installBtn = document.getElementById('pwaInstallBtn');
    const dismissBtn = document.getElementById('pwaDismissBtn');

    installBtn && installBtn.addEventListener('click', async () => {
      try {
        if (!deferredPrompt) {
          hideBanner();
          return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        hideBanner();
        if (outcome !== 'accepted') {
          localStorage.setItem('pwaInstallDismissed', '1');
        }
      } catch (e) {
        hideBanner();
      }
    });

    dismissBtn && dismissBtn.addEventListener('click', () => {
      hideBanner();
      localStorage.setItem('pwaInstallDismissed', '1');
    });
  }

  function hideBanner() {
    const el = document.getElementById(INSTALL_BANNER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    updateInstallButtons();
    if (!isStandalone && localStorage.getItem('pwaInstallDismissed') !== '1') {
      const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) <= 768;
      if (isSmallScreen) createBanner();
    }
    try { window.dispatchEvent(new CustomEvent('pwa:can-install')); } catch (_) {}
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideBanner();
    localStorage.removeItem('pwaInstallDismissed');
    updateInstallButtons();
    try { window.dispatchEvent(new CustomEvent('pwa:installed')); } catch (_) {}
  });

  document.addEventListener('DOMContentLoaded', updateInstallButtons);
  window.addEventListener('resize', updateInstallButtons);
})();