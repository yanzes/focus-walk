"use strict";

/** Letras reales desde LRCLIB, con caché en memoria y en disco. */

const fs = require("node:fs");

const API = "https://lrclib.net/api";
const USER_AGENT = "FocusWalk/0.5 (notch de escritorio para Windows)";

let cacheFile = null;
let cache = new Map();
let saveTimer = 0;

function load(file) {
  cacheFile = file;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    cache = new Map(Object.entries(parsed));
  } catch {
    cache = new Map();
  }
}

function persist() {
  if (!cacheFile) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache)), "utf8");
    } catch {
      /* caché es prescindible */
    }
  }, 600);
}

async function request(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchLyrics({ title, artist, album, duration }) {
  const params = new URLSearchParams();
  params.set("track_name", title);
  if (artist) params.set("artist_name", artist);
  if (album) params.set("album_name", album);
  if (duration) params.set("duration", String(Math.round(duration)));

  try {
    const exact = await request(`${API}/get?${params.toString()}`);
    if (exact && (exact.syncedLyrics || exact.plainLyrics)) {
      return {
        found: true,
        synced: exact.syncedLyrics || null,
        plain: exact.plainLyrics || null,
        instrumental: Boolean(exact.instrumental),
      };
    }
  } catch {
    /* seguimos con la búsqueda */
  }

  try {
    const query = new URLSearchParams({ q: [title, artist].filter(Boolean).join(" ") });
    const results = await request(`${API}/search?${query.toString()}`);
    if (Array.isArray(results)) {
      const best = results.find((r) => r.syncedLyrics) || results.find((r) => r.plainLyrics);
      if (best) {
        return {
          found: true,
          synced: best.syncedLyrics || null,
          plain: best.plainLyrics || null,
          instrumental: Boolean(best.instrumental),
        };
      }
    }
  } catch {
    /* sin conexión */
  }

  return { found: false, synced: null, plain: null, instrumental: false };
}

async function get(track) {
  if (!track || !track.title) return { found: false, synced: null, plain: null };
  const key = [track.artist || "", track.title, Math.round(track.duration || 0)]
    .join("|")
    .toLowerCase();

  if (cache.has(key)) return cache.get(key);

  const result = await fetchLyrics(track);
  cache.set(key, result);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  persist();
  return result;
}

module.exports = { load, get };
