"use strict";

/**
 * Carátula a partir de los metadatos de la pista.
 *
 * SMTC expone un thumbnail, pero en PowerShell llega como COM sin proyección de
 * interfaz y no se puede leer (los streams WinRT no son accesibles desde PS 5.1).
 * Así que se busca la portada por artista + título en el catálogo público de
 * iTunes, con coincidencia estricta: si no hay seguridad, no se muestra nada y
 * la interfaz usa su degradado.
 */

const SEARCH = "https://itunes.apple.com/search";
const MAX_BYTES = 3 * 1024 * 1024;

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "you", "your",
  "los", "las", "del", "una", "uno", "por", "con", "para", "que",
  "feat", "ft", "official", "video", "audio", "lyrics", "letra", "hd",
  "remaster", "remastered", "version", "edit", "live", "en", "el", "la",
]);

const cache = new Map();

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(official|video|audio|lyric|lyrics|hd|4k)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (value) =>
  normalize(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP.has(word));

function titleScore(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const word of left) if (right.has(word)) hits += 1;
  return hits / Math.max(left.size, right.size);
}

function artistMatches(resultArtist, trackArtist) {
  const a = normalize(resultArtist);
  const b = normalize(trackArtist);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  const mime = response.headers.get("content-type") || "image/jpeg";
  return `data:${mime.split(";")[0]};base64,${buffer.toString("base64")}`;
}

/**
 * @param {{title:string, artist:string, album?:string}} track
 * @returns {Promise<string|null>} data URL de la portada
 */
async function get(track) {
  if (!track || !track.title || !track.artist) return null;

  const key = `${track.title}|${track.artist}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result = null;
  try {
    const query = encodeURIComponent(`${track.artist} ${track.title}`);
    const response = await fetch(`${SEARCH}?term=${query}&entity=song&limit=8`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (response.ok) {
      const data = await response.json();
      result = (data.results || []).find(
        (item) =>
          item.artworkUrl100 &&
          item.trackName &&
          artistMatches(item.artistName, track.artist) &&
          titleScore(item.trackName, track.title) >= 0.5,
      );
    }
  } catch {
    result = null;
  }

  let url = null;
  if (result) {
    try {
      url = await download(String(result.artworkUrl100).replace("100x100bb", "600x600bb"));
    } catch {
      url = null;
    }
  }

  cache.set(key, url);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return url;
}

module.exports = { get };
