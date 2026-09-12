(() => {
  if (!("serviceWorker" in navigator)) return;

  const currentScript = document.currentScript;
  const scriptElement =
    currentScript ||
    document.querySelector('script[src$="/sw-register.js"], script[src="sw-register.js"]');
  const scriptUrl = scriptElement?.src
    ? new URL(scriptElement.src, document.baseURI)
    : new URL("./sw-register.js", document.baseURI);

  window.addEventListener("load", () => {
    const workerUrl = new URL("sw.js", scriptUrl);
    const scope = new URL("./", workerUrl).pathname;
    navigator.serviceWorker.register(workerUrl.href, { scope }).catch(() => {
      // Offline enhancement is optional; the online study flow remains available.
    });
  });
})();
