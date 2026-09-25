(function () {
  "use strict";

  const STORAGE_KEY = "seedf-ppge-dashboard:reading-preferences:v1";
  const DEFAULTS = Object.freeze({
    appearance: "light",
    readingMode: false,
    textScale: "normal",
    reduceMotion: false,
  });
  const APPEARANCES = new Set(["system", "light", "dark", "sepia"]);
  const TEXT_SCALES = new Set(["small", "normal", "large"]);
  const THEME_COLORS = {
    dark: "#0b1620",
    sepia: "#f3ede2",
    light: "#f4f8fa",
    system: "#f4f8fa",
  };
  let memoryPreferences = { ...DEFAULTS };

  function normalize(value) {
    const candidate = value && typeof value === "object" ? value : {};
    return {
      appearance: APPEARANCES.has(candidate.appearance) ? candidate.appearance : DEFAULTS.appearance,
      readingMode: candidate.readingMode === true,
      textScale: TEXT_SCALES.has(candidate.textScale) ? candidate.textScale : DEFAULTS.textScale,
      reduceMotion: candidate.reduceMotion === true,
    };
  }

  function read() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const next = normalize(raw ? JSON.parse(raw) : DEFAULTS);
      memoryPreferences = next;
      return { ...next };
    } catch {
      return { ...memoryPreferences };
    }
  }

  function resolvedAppearance(appearance) {
    if (appearance !== "system") return appearance;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  }

  function updateThemeColor(appearance) {
    const resolved = resolvedAppearance(appearance);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLORS[resolved] || THEME_COLORS.light);
    document.documentElement.style.colorScheme = appearance === "system"
      ? "light dark"
      : resolved === "dark"
      ? "dark"
        : "light";
  }

  function apply(value) {
    const next = normalize(value);
    const root = document.documentElement;
    root.dataset.appearance = next.appearance;
    root.dataset.colorMode = resolvedAppearance(next.appearance);
    root.dataset.readingMode = String(next.readingMode);
    root.dataset.textScale = next.textScale;
    root.dataset.reduceMotion = String(next.reduceMotion);
    updateThemeColor(next.appearance);
    return next;
  }

  function write(value) {
    const next = apply(value);
    memoryPreferences = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing can deny storage; the current session still keeps the setting.
    }
    window.dispatchEvent(new CustomEvent("seedf-reading-preferences-change", { detail: next }));
    return next;
  }

  function settingMarkup(id) {
    return `<button type="button" class="reading-settings-trigger" aria-expanded="false" aria-controls="${id}" title="Abrir configurações de conforto"><span class="reading-settings-trigger-icon" aria-hidden="true">Aa</span><span class="reading-settings-trigger-text">Conforto</span></button>
      <div class="reading-settings-panel" id="${id}" hidden>
        <div class="reading-settings-heading"><strong>Conforto de leitura</strong><small>Salvo neste aparelho</small></div>
        <label class="reading-settings-field"><span>Aparência</span><select data-reading-appearance aria-label="Escolher aparência"><option value="system">Sistema</option><option value="light">Clara</option><option value="dark">Escura</option><option value="sepia">Conforto (sépia)</option></select></label>
        <label class="reading-settings-field"><span>Tamanho do texto</span><select data-reading-scale aria-label="Escolher tamanho do texto"><option value="small">Menor</option><option value="normal">Normal</option><option value="large">Maior</option></select></label>
        <label class="reading-settings-check"><input type="checkbox" data-reading-mode><span>Modo leitura <small>menos distrações</small></span></label>
        <label class="reading-settings-check"><input type="checkbox" data-reading-motion><span>Reduzir animações <small>mais estabilidade visual</small></span></label>
        <button type="button" class="reading-settings-reset" data-reading-reset>Restaurar padrão</button>
      </div>`;
  }

  function syncHost(host, preferences) {
    const appearance = host.querySelector("[data-reading-appearance]");
    const scale = host.querySelector("[data-reading-scale]");
    const mode = host.querySelector("[data-reading-mode]");
    const motion = host.querySelector("[data-reading-motion]");
    if (appearance) appearance.value = preferences.appearance;
    if (scale) scale.value = preferences.textScale;
    if (mode) mode.checked = preferences.readingMode;
    if (motion) motion.checked = preferences.reduceMotion;
  }

  function syncHosts(preferences = read()) {
    document.querySelectorAll("[data-reading-settings]").forEach((host) => syncHost(host, preferences));
  }

  function closeOtherPanels(currentHost) {
    document.querySelectorAll("[data-reading-settings]").forEach((host) => {
      if (host === currentHost) return;
      const trigger = host.querySelector(".reading-settings-trigger");
      const panel = host.querySelector(".reading-settings-panel");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (panel) panel.hidden = true;
    });
  }

  function bindHost(host, index) {
    if (host.dataset.readingSettingsReady === "true") return;
    host.dataset.readingSettingsReady = "true";
    host.classList.add("reading-settings-host");
    const panelId = `seedf-reading-settings-${index + 1}`;
    host.innerHTML = settingMarkup(panelId);
    const trigger = host.querySelector(".reading-settings-trigger");
    const panel = host.querySelector(".reading-settings-panel");
    const appearance = host.querySelector("[data-reading-appearance]");
    const scale = host.querySelector("[data-reading-scale]");
    const mode = host.querySelector("[data-reading-mode]");
    const motion = host.querySelector("[data-reading-motion]");
    const reset = host.querySelector("[data-reading-reset]");
    const update = (patch) => write({ ...read(), ...patch });

    trigger?.addEventListener("click", () => {
      if (!panel) return;
      const willOpen = panel.hidden;
      closeOtherPanels(host);
      panel.hidden = !willOpen;
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
    appearance?.addEventListener("change", (event) => update({ appearance: event.target.value }));
    scale?.addEventListener("change", (event) => update({ textScale: event.target.value }));
    mode?.addEventListener("change", (event) => update({ readingMode: event.target.checked }));
    motion?.addEventListener("change", (event) => update({ reduceMotion: event.target.checked }));
    reset?.addEventListener("click", () => update(DEFAULTS));
    syncHost(host, read());
  }

  function bindHosts() {
    document.querySelectorAll("[data-reading-settings]").forEach((host, index) => bindHost(host, index));
    syncHosts(read());
  }

  window.SEEDFReadingPreferences = { key: STORAGE_KEY, defaults: { ...DEFAULTS }, read, write, apply };
  apply(read());

  window.addEventListener("seedf-reading-preferences-change", (event) => {
    syncHosts(normalize(event.detail));
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = read();
    apply(next);
    syncHosts(next);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll("[data-reading-settings]").forEach((host) => {
      const trigger = host.querySelector(".reading-settings-trigger");
      const panel = host.querySelector(".reading-settings-panel");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (panel) panel.hidden = true;
    });
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-reading-settings]")) return;
    closeOtherPanels(null);
  });

  const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)");
  colorScheme?.addEventListener?.("change", () => {
    const current = read();
    if (current.appearance === "system") apply(current);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindHosts, { once: true });
  else bindHosts();
})();
