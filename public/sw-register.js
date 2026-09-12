(() => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    const currentScript = document.currentScript;
    const scriptUrl = currentScript?.src
      ? new URL(currentScript.src)
      : new URL("./sw-register.js", document.baseURI);
    const workerUrl = new URL("sw.js", scriptUrl);
    const scope = new URL("./", workerUrl).pathname;
    navigator.serviceWorker.register(workerUrl.href, { scope }).catch(() => {
      // Offline enhancement is optional; the online study flow remains available.
    });
  });
})();
