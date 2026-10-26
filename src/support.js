/**
 * Apoyo al proyecto: enlace de donación y recordatorio del café.
 *
 * El aviso aparece cada 15 días, cuenta desde la primera vez que se abre la app
 * (o desde la última vez que se mostró). Es un recordatorio, no un muro: se
 * puede aplazar o desactivar para siempre desde el propio aviso o desde Ajustes.
 */

import { state, save, emit } from "./store.js";
import { isNative, reserveOverlay, releaseOverlay, openExternal } from "./native.js";
import { icon } from "./ui.js";

/**
 * Cambia esta línea por tu enlace real de Ko-fi / Buy Me a Coffee / GitHub
 * Sponsors. Es el único sitio donde vive la URL: la usan el aviso y Ajustes.
 */
export const DONATE_URL = "https://ko-fi.com/focuswalk";

export const COFFEE_DAYS = 15;

const DAY = 24 * 60 * 60 * 1000;

/** Hueco que necesita la tarjeta en la ventana nativa (alto de la tarjeta + margen). */
const CARD_SPACE = 158;

const wrap = document.getElementById("nudge");

let shownThisSession = false;

export function isCoffeePaused() {
  return Boolean(state.support.never);
}

export function openDonation() {
  openExternal(DONATE_URL);
}

/** Reinicia la cuenta atrás del aviso. */
export function scheduleCoffee(days = COFFEE_DAYS) {
  state.support.nextAt = Date.now() + days * DAY;
  save();
}

/** Silencia o reactiva el recordatorio. */
export function setCoffeePaused(paused) {
  state.support.never = Boolean(paused);
  if (paused) state.support.nextAt = 0;
  else scheduleCoffee();
  save();
  emit("ui");
}

/** Coloca la tarjeta justo debajo del notch, igual que los OSD. */
export function setNudgeOffset(px) {
  if (wrap) wrap.style.top = `${px}px`;
}

function markup() {
  return `
    <div class="coffee" role="dialog" aria-label="Invítame a un café">
      <div class="coffee__head">
        <span class="coffee__icon">${icon("i-coffee")}</span>
        <strong>¿Me invitas a un café?</strong>
      </div>
      <p class="coffee__text">
        Focus Walk es gratis y sin anuncios. Si te acompaña cada día, un café ayuda a
        mantenerlo.
      </p>
      <div class="coffee__actions">
        <button class="chip chip--accent" data-coffee-donate>Invitar</button>
        <button class="chip" data-coffee-later>Ahora no</button>
        <button class="coffee__never" data-coffee-never>No volver a mostrar</button>
      </div>
    </div>`;
}

function closeCoffee(days) {
  const card = wrap?.querySelector(".coffee");
  card?.classList.remove("is-visible");
  setTimeout(() => {
    if (wrap) wrap.innerHTML = "";
    releaseOverlay("coffee");
  }, 260);
  if (days > 0) scheduleCoffee(days);
}

/** Muestra la tarjeta ya mismo (el arranque la usa cuando toca). */
export function showCoffeeNotice() {
  if (!wrap || wrap.querySelector(".coffee")) return;
  shownThisSession = true;
  state.support.seen = (state.support.seen || 0) + 1;
  save();

  reserveOverlay("coffee", CARD_SPACE);
  wrap.innerHTML = markup();
  const card = wrap.firstElementChild;
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("is-visible")));

  card.querySelector("[data-coffee-donate]").addEventListener("click", () => {
    openDonation();
    // Quien invita no necesita que se le recuerde en un mes.
    closeCoffee(COFFEE_DAYS * 2);
  });
  card.querySelector("[data-coffee-later]").addEventListener("click", () => closeCoffee(COFFEE_DAYS));
  card.querySelector("[data-coffee-never]").addEventListener("click", () => {
    state.support.never = true;
    state.support.nextAt = 0;
    save();
    emit("ui");
    closeCoffee(0);
  });
}

/**
 * Se llama al arrancar. La primera vez solo empieza a contar; después muestra
 * la tarjeta cuando el plazo ha vencido.
 */
export function initCoffeeNudge() {
  if (!state.support.nextAt) {
    scheduleCoffee();
    return;
  }
  if (state.support.never || shownThisSession) return;
  if (Date.now() < state.support.nextAt) return;

  // Deja que el notch termine de arrancar antes de pedir nada.
  setTimeout(() => {
    if (!state.support.never) showCoffeeNotice();
  }, 4200);
}

// En la app de escritorio el enlace nunca debe abrirse dentro del notch.
if (isNative) {
  window.addEventListener("click", (e) => {
    const link = e.target.closest("a[href^='http']");
    if (!link) return;
    e.preventDefault();
    openExternal(link.href);
  });
}
