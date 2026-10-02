import {
  ManifestProxy,
  injectSubtitleProxy,
  injectP2PTracker,
} from "../../core/manifest-proxy.js";
import { createDefaultEngine } from "../../core/sel-engine.js";
import { createDefaultDeduplicator } from "../../core/deduplicator.js";
import { SubtitleTranslator } from "../../subtitle/translator.js";
import { SwarmManager } from "../../p2p/swarm-manager.js";

class ToxicWindApp {
  constructor() {
    this.proxy = null;
    this.sel = createDefaultEngine();
    this.dedup = createDefaultDeduplicator();
    this.subtitle = new SubtitleTranslator();
    this.swarm = new SwarmManager();
    this.manifest = null;
    this.catalogs = [];
    this.currentSection = "home";
  }

  async init() {
    const manifestUrl = localStorage.getItem("tw_manifest_url") || "";
    const subProxy =
      localStorage.getItem("tw_subtitle_proxy") || "http://arch-ip:8080";
    const p2pTracker =
      localStorage.getItem("tw_p2p_tracker") || "wss://tracker.toxicwind.is";

    if (manifestUrl) {
      this.proxy = new ManifestProxy(
        manifestUrl,
        localStorage.getItem("tw_secret") || "",
      );
      this.proxy.addHook((m) => injectSubtitleProxy(m, subProxy));
      this.proxy.addHook((m) => injectP2PTracker(m, p2pTracker));
      await this.loadManifest();
    }

    this.bindEvents();
    this.swarm.connect(p2pTracker);
    this.updateHUD();
  }

  async loadManifest() {
    try {
      this.manifest = await this.proxy.fetchManifest();
      this.catalogs = this.manifest.catalogs || [];
      this.renderHome();
    } catch (e) {
      console.error("Manifest load failed:", e);
      this.showError("Failed to load manifest. Check settings.");
    }
  }

  renderHome() {
    const grid = document.getElementById("home-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const cat of this.catalogs.slice(0, 12)) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h3>${cat.name}</h3><span class="meta">${cat.type}</span>`;
      card.addEventListener("click", () => this.loadCatalog(cat));
      grid.appendChild(card);
    }
  }

  async loadCatalog(cat) {
    // Fetch catalog items via proxy
    console.log("Loading catalog:", cat.id);
  }

  bindEvents() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.switchSection(btn.dataset.section),
      );
    });

    const saveBtn = document.getElementById("save-settings");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveSettings());
    }

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.performSearch(searchInput.value);
      });
    }
  }

  switchSection(section) {
    document
      .querySelectorAll(".section")
      .forEach((s) => s.classList.remove("active"));
    document
      .querySelectorAll(".nav-item")
      .forEach((n) => n.classList.remove("active"));
    const target = document.getElementById(section);
    if (target) target.classList.add("active");
    const nav = document.querySelector(`[data-section="${section}"]`);
    if (nav) nav.classList.add("active");
    this.currentSection = section;
  }

  saveSettings() {
    const manifestUrl = document.getElementById("manifest-url")?.value || "";
    const subProxy = document.getElementById("subtitle-proxy")?.value || "";
    const p2pTracker = document.getElementById("p2p-tracker")?.value || "";
    localStorage.setItem("tw_manifest_url", manifestUrl);
    localStorage.setItem("tw_subtitle_proxy", subProxy);
    localStorage.setItem("tw_p2p_tracker", p2pTracker);
    this.init();
  }

  async performSearch(query) {
    if (!query.trim() || !this.proxy) return;
    const results = await this.proxy.search(query);
    const filtered = this.sel.filter(results);
    const deduped = this.dedup.deduplicate(filtered);
    this.renderSearchResults(deduped);
  }

  renderSearchResults(results) {
    const grid = document.getElementById("search-results");
    if (!grid) return;
    grid.innerHTML = "";
    for (const item of results.slice(0, 20)) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h3>${item.name}</h3><span class="meta">${item.type} · ${item.year || ""}</span>`;
      grid.appendChild(card);
    }
  }

  showError(msg) {
    const content = document.getElementById("content");
    if (content) {
      const err = document.createElement("div");
      err.className = "error-banner";
      err.textContent = msg;
      content.prepend(err);
    }
  }

  updateHUD() {
    const torbox = document.getElementById("torbox-hud");
    const p2p = document.getElementById("p2p-hud");
    const sel = document.getElementById("sel-hud");
    if (torbox) torbox.textContent = "⚡ TorBox: -- / 1TB";
    if (p2p) p2p.textContent = `⇄ P2P: ${this.swarm.peerCount || 0} peers`;
    if (sel) sel.textContent = "SEL: active";
  }
}

const app = new ToxicWindApp();
app.init();
