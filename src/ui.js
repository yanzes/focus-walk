/** Helpers de UI compartidos: formato, iconos, toasts y delegación de eventos. */

import { isNative } from "./native.js";
import { showOSD } from "./osd.js";

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

export const fmt = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const mmss = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const esc = (str) =>
  String(str).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export const icon = (name, extra = "") =>
  `<svg${extra ? ` class="${extra}"` : ""} aria-hidden="true"><use href="#${name}"/></svg>`;

export function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Delegación: on(root, '.sel', 'click', handler) */
export function on(root, selector, event, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

/* --- Toasts -------------------------------------------------------------- */

const toastWrap = document.getElementById("toasts");

export function toast(message, ms = 2400) {
  // En la app de escritorio el aviso sale como OSD bajo el notch.
  if (isNative) {
    showOSD({ icon: "i-sparkle", label: message });
    return;
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toastWrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 300);
  }, ms);
}
