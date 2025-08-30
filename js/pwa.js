/* PWA registration and install prompt handler for Piggybanks.app */

(() => {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator && window.navigator.standalone === true);


  // Check if browser supports PWA features
  if ('serviceWorker' in navigator) {
    // Service workers support checked
  } else {
    // Service workers not supported
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then(registration => {
          // Service worker registered successfully
        })
        .catch(err => {
          console.error('[PWA] Service worker registration failed:', err);
        });
    });
  }

  // Check for manifest
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    // Manifest link found
  } else {
    console.error('[PWA] No manifest link found!');
  }

  window.PiggyPWA = window.PiggyPWA || {};
  window.PiggyPWA.isInstallAvailable = () => false; // Using native browser install prompt

  // Check if PWA is installable
  let installable = false;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Install prompt received - app is installable
    installable = true;
    // Let the browser handle the install prompt natively
    try { window.dispatchEvent(new CustomEvent('pwa:can-install')); } catch (_) {}
  });

  // After some time, check if we received the install prompt
  setTimeout(() => {
    if (!installable) {
      console.warn('[PWA] ❌ No install prompt received. Possible issues:');
      console.warn('  - Icon not available at specified path');
      console.warn('  - Manifest not properly served with correct MIME type');
      console.warn('  - Service worker not registered properly');
      console.warn('  - Browser cache needs to be cleared');
      console.warn('  - HTTPS required (localhost is ok)');
    }
  }, 2000);

  window.addEventListener('appinstalled', () => {
    // App installed successfully
  });
})();