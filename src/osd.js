/** Overlays del sistema: la píldora que sale bajo el notch. */

import { icon, esc } from "./ui.js";
import { isNative, setOverlaySpace } from "./native.js";

const OSD_SPACE = 104;

const wrap = document.getElementById("osd-wrap");
let hideTimer = 0;
let seq = 0;

/** Mueve el OSD justo debajo del notch según su alto actual. */
export function setOsdOffset(px) {
  wrap.style.top = `${px}px`;
}

/**
 * @param {{icon:string,label:string,value?:string,percent?:number,tone?:string}} opts
 */
export function showOSD({ icon: ic, label, value = "", percent = null, tone = "" }) {
  clearTimeout(hideTimer);
  const mine = ++seq;
  wrap.innerHTML = "";

  // En escritorio la ventana crece para que el aviso quepa debajo del notch.
  if (isNative) setOverlaySpace(OSD_SPACE);

  const el = document.createElement("div");
  el.className = "osd";
  el.innerHTML = `
    <div class="osd__icon">${icon(ic)}</div>
    <div class="osd__body">
      <div class="osd__head">
        <span>${esc(label)}</span>
        ${value ? `<span class="osd__value">${esc(value)}</span>` : ""}
      </div>
      ${
        percent === null
          ? ""
          : `<div class="osd__track"><div class="osd__fill" data-tone="${esc(tone)}" style="width:${Math.round(
              percent,
            )}%"></div></div>`
      }
    </div>`;
  wrap.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-visible")));

  hideTimer = setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => {
      el.remove();
      if (isNative && mine === seq) setOverlaySpace(0);
    }, 320);
  }, 1900);
}
