/** Página Música: sesión real del sistema (SMTC) con letras de LRCLIB. */

import { parseLRC } from "../data.js";
import { clamp, esc, fmt, icon, on } from "../ui.js";
import {
  currentTrack,
  lyricsFor,
  next,
  onMedia,
  playPause,
  prev,
  seek,
  toggleMute,
} from "../media.js";
import { sys } from "../system.js";
import { isNative } from "../native.js";

const APP_NAMES = {
  "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic": "Media Player",
  "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify": "Spotify",
  "Chrome": "Chrome",
  "Brave": "Brave",
  "Microsoft.Edge": "Edge",
  "Firefox": "Firefox",
};

const appLabel = (app) => {
  if (!app) return "Sistema";
  return APP_NAMES[app] || app.split("!").pop() || app;
};

function coverFor(track) {
  let h = 0;
  for (let i = 0; i < track.key.length; i++) h = (h * 31 + track.key.charCodeAt(i)) % 360;
  return `linear-gradient(142deg, hsl(${h} 78% 62%) 0%, hsl(${(h + 40) % 360} 64% 34%) 58%, #10131c 100%)`;
}

export function createMusicPage() {
  let root = null;
  let els = null;
  let lyricEls = [];
  let activeIdx = -1;
  let renderedKey = "";
  let renderedEmpty = null;
  let renderedConnecting = null;
  let lyricToken = 0;
  let seeking = false;
  let unsubscribe = null;

  /* --- Markup ----------------------------------------------------------- */

  const idleMarkup = () => `
    <div class="lyrics__idle" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
    </div>`;

  const emptyMarkup = () => {
    const connecting = isNative && !sys.connected;
    return `
    <div class="page">
      <div class="empty" style="flex:1; justify-content:center">
        ${icon(connecting ? "i-sparkle" : "i-music")}
        <span style="color:var(--ink); font-size:13px">${
          connecting ? "Conectando con Windows…" : "Sin reproducción"
        }</span>
        <span>${
          connecting
            ? "Leyendo la sesión multimedia del sistema."
            : "Reproduce algo en cualquier app de tu equipo y aparecerá aquí."
        }</span>
      </div>
    </div>`;
  };

  const playerMarkup = () => `
    <div class="page music">
      <div class="music__head">
        <div class="cover" data-cover></div>
        <div class="music__meta">
          <h2 class="music__title" data-title></h2>
          <p class="music__artist" data-artist></p>
          <span class="music__source"><i></i><span data-source></span></span>
        </div>
      </div>
      <div class="lyrics" data-lyrics aria-label="Letra sincronizada"></div>
      <div class="progress">
        <span data-elapsed>0:00</span>
        <div class="progress__bar" data-bar role="slider" tabindex="0"
             aria-label="Progreso de la canción" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="progress__fill" data-fill></div>
          <div class="progress__knob" data-knob></div>
        </div>
        <span data-total>0:00</span>
      </div>
      <div class="controls">
        <button class="ctrl" data-act="prev" aria-label="Anterior">${icon("i-prev")}</button>
        <button class="ctrl ctrl--play" data-act="play" aria-label="Reproducir">${icon("i-play")}</button>
        <button class="ctrl" data-act="next" aria-label="Siguiente">${icon("i-next")}</button>
        <button class="ctrl" data-act="mute" aria-label="Silenciar">${icon("i-volume")}</button>
      </div>
    </div>`;

  /* --- Ciclo de vida ---------------------------------------------------- */

  function mount(el) {
    root = el;
    // Delegación una sola vez: root sobrevive a los rebuilds.
    on(root, "[data-act]", "click", (_e, btn) => {
      const actions = { play: playPause, next, prev, mute: toggleMute };
      const fn = actions[btn.dataset.act];
      if (fn) fn();
    });
    unsubscribe = onMedia(render);
    rebuild();
  }

  function cache() {
    els = {
      cover: root.querySelector("[data-cover]"),
      title: root.querySelector("[data-title]"),
      artist: root.querySelector("[data-artist]"),
      source: root.querySelector("[data-source]"),
      lyrics: root.querySelector("[data-lyrics]"),
      elapsed: root.querySelector("[data-elapsed]"),
      total: root.querySelector("[data-total]"),
      bar: root.querySelector("[data-bar]"),
      fill: root.querySelector("[data-fill]"),
      knob: root.querySelector("[data-knob]"),
      play: root.querySelector('[data-act="play"]'),
      next: root.querySelector('[data-act="next"]'),
      prev: root.querySelector('[data-act="prev"]'),
      mute: root.querySelector('[data-act="mute"]'),
    };
  }

  function rebuild() {
    if (!root) return;
    const track = currentTrack();
    renderedEmpty = !track;
    renderedConnecting = isNative && !sys.connected;
    renderedKey = "";
    activeIdx = -1;
    lyricEls = [];

    if (!track) {
      root.innerHTML = emptyMarkup();
      els = null;
      return;
    }

    root.innerHTML = playerMarkup();
    cache();
    bind();
    render();
  }

  function bind() {
    els.bar.addEventListener("pointerdown", (e) => {
      if (!els.bar.dataset.enabled) return;
      seeking = true;
      els.bar.setPointerCapture(e.pointerId);
      scrub(e);
    });
    els.bar.addEventListener("pointermove", (e) => {
      if (seeking) scrub(e);
    });
    els.bar.addEventListener("pointerup", (e) => {
      if (!seeking) return;
      seeking = false;
      els.bar.releasePointerCapture(e.pointerId);
      scrub(e);
    });
    els.bar.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const track = currentTrack();
      if (track) seek(track.position + (e.key === "ArrowRight" ? 5 : -5));
    });
  }

  function scrub(e) {
    const track = currentTrack();
    if (!track || !track.canSeek) return;
    const rect = els.bar.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seek(ratio * track.duration);
    paintProgress({ ...track, position: ratio * track.duration });
  }

  /* --- Pintado ---------------------------------------------------------- */

  function renderHead(track) {
    els.cover.style.background = track.artUrl
      ? `#10131c url("${track.artUrl}") center / cover no-repeat`
      : coverFor(track);
    els.title.textContent = track.title;
    els.artist.textContent = [track.artist, track.album].filter(Boolean).join(" — ") || appLabel(track.app);
    els.total.textContent = track.duration > 0 ? fmt(track.duration) : "--:--";
  }

  function paintProgress(track) {
    if (!els) return;
    const duration = track.duration || 0;
    const pct = duration > 0 ? clamp((track.position / duration) * 100, 0, 100) : 0;
    els.fill.style.width = `${pct}%`;
    els.knob.style.left = `${pct}%`;
    els.elapsed.textContent = fmt(track.position);
    els.bar.setAttribute("aria-valuenow", String(Math.round(pct)));
    els.bar.dataset.enabled = track.canSeek ? "1" : "";
    els.bar.style.cursor = track.canSeek ? "pointer" : "default";
  }

  function paintControls(track) {
    els.play.innerHTML = icon(track.playing ? "i-pause" : "i-play");
    els.play.setAttribute("aria-label", track.playing ? "Pausar" : "Reproducir");
    els.next.disabled = !track.canSkip;
    els.prev.disabled = !track.canSkip;

    const muted = Boolean(sys.muted);
    els.mute.innerHTML = icon("i-volume");
    els.mute.setAttribute("aria-label", muted ? "Quitar silencio" : "Silenciar");
    els.mute.setAttribute("aria-pressed", String(muted));

    els.source.innerHTML = `${track.playing ? "" : "En pausa · "}${esc(appLabel(track.app))}`;
  }

  function render() {
    if (!root) return;
    const track = currentTrack();
    if (!track) {
      const connecting = isNative && !sys.connected;
      if (!renderedEmpty || renderedConnecting !== connecting) rebuild();
      return;
    }
    if (renderedEmpty !== false) {
      rebuild();
      return;
    }
    renderHead(track);
    paintProgress(track);
    paintControls(track);

    if (renderedKey !== track.key) {
      renderedKey = track.key;
      loadLyrics(track);
    }
  }

  async function loadLyrics(track) {
    const token = ++lyricToken;
    els.lyrics.innerHTML = idleMarkup();
    lyricEls = [];

    const payload = await lyricsFor(track);
    if (token !== lyricToken || !els) return;

    const lines = payload?.synced
      ? parseLRC(payload.synced)
      : (payload?.plain || "")
          .split("\n")
          .map((text) => ({ time: null, text: text.trim() }))
          .filter((l) => l.text);

    // Sin letra no se avisa de nada: se deja un visualizador discreto.
    if (!lines.length) {
      els.lyrics.innerHTML = idleMarkup();
      return;
    }

    const synced = payload?.synced ? "true" : "false";
    els.lyrics.dataset.synced = synced;
    els.lyrics.innerHTML =
      `<div style="height:34%"></div>` +
      lines
        .map(
          (l, i) =>
            `<p class="lyric" data-i="${i}" data-time="${l.time === null ? "" : l.time}">${esc(l.text)}</p>`,
        )
        .join("") +
      `<div style="height:38%"></div>`;

    lyricEls = [...els.lyrics.querySelectorAll(".lyric")];
    activeIdx = -1;
    syncLyric(true);
  }

  function syncLyric(instant = false) {
    if (!lyricEls.length || els.lyrics.dataset.synced !== "true") return;
    const track = currentTrack();
    if (!track) return;
    const pos = track.position;

    let idx = -1;
    for (let i = 0; i < lyricEls.length; i++) {
      const time = Number(lyricEls[i].dataset.time);
      if (!Number.isFinite(time)) break;
      if (time <= pos) idx = i;
      else break;
    }

    for (let i = 0; i < lyricEls.length; i++) {
      lyricEls[i].dataset.state = i === idx ? "active" : i < idx ? "past" : "next";
    }
    if (idx === activeIdx) return;
    activeIdx = idx;

    const target = idx >= 0 ? lyricEls[idx] : lyricEls[0];
    if (!target) return;
    const top = target.offsetTop - els.lyrics.clientHeight / 2 + target.offsetHeight / 2;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    els.lyrics.scrollTo({ top: Math.max(0, top), behavior: instant || reduced ? "auto" : "smooth" });
  }

  return {
    mount,
    render,
    tick() {
      if (!els) return;
      const track = currentTrack();
      if (!track) return;
      paintProgress(track);
      syncLyric();
    },
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      lyricToken += 1;
      root = null;
      els = null;
    },
  };
}
