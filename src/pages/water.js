/** Página Agua: registro diario, vasos y gráfico de los últimos 7 días. */

import { state, save, on as subscribe, dateKey, dayOffset } from "../store.js";
import { clamp, icon } from "../ui.js";
import { showOSD } from "../osd.js";

const MAX = 12;

const todayCount = () => state.water.log[dateKey()] || 0;

function setCount(n) {
  const value = clamp(Math.round(n), 0, MAX);
  state.water.log[dateKey()] = value;
  save();
  return value;
}

function streak() {
  let n = 0;
  let i = todayCount() >= state.water.goal ? 0 : 1;
  for (; i < 60; i++) {
    if ((state.water.log[dateKey(dayOffset(-i))] || 0) >= state.water.goal) n++;
    else break;
  }
  return n;
}

export function createWaterPage() {
  let els;
  let unsubscribe = null;
  let ro = null;

  function markup() {
    return `
      <div class="page water">
        <div class="water__hero">
          <div>
            <div class="water__count"><span data-count>0</span><small> / ${state.water.goal} vasos</small></div>
            <div class="water__label" data-msg></div>
          </div>
          <div class="water__actions">
            <button class="round" data-act="minus" aria-label="Quitar un vaso">${icon("i-minus")}</button>
            <button class="round round--add" data-act="plus" aria-label="Añadir un vaso">${icon("i-plus")}</button>
          </div>
        </div>

        <div class="glasses" data-glasses>
          ${Array.from({ length: state.water.goal }, (_, i) => `<button class="glass" data-glass="${i}" aria-label="Vaso ${i + 1}"></button>`).join("")}
        </div>

        <div class="water__chart">
          <div class="water__chart-head">
            <span>Últimos 7 días</span>
            <span class="streak">${icon("i-flame")}<span data-streak>0 días</span></span>
          </div>
          <canvas data-canvas></canvas>
        </div>
      </div>`;
  }

  function mount(el) {
    el.innerHTML = markup();
    els = {
      count: el.querySelector("[data-count]"),
      msg: el.querySelector("[data-msg]"),
      glasses: [...el.querySelectorAll(".glass")],
      streak: el.querySelector("[data-streak]"),
      canvas: el.querySelector("[data-canvas]"),
    };

    el.querySelector('[data-act="plus"]').addEventListener("click", () => bump(1));
    el.querySelector('[data-act="minus"]').addEventListener("click", () => bump(-1));
    els.glasses.forEach((g) =>
      g.addEventListener("click", () => {
        const i = Number(g.dataset.glass);
        setCount(todayCount() === i + 1 ? i : i + 1);
        render();
      }),
    );

    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => drawChart());
      ro.observe(els.canvas.parentElement);
    }

    unsubscribe = subscribe("water", render);
    render();
  }

  function bump(delta) {
    const next = setCount(todayCount() + delta);
    render();
    if (delta > 0 && next === state.water.goal) {
      showOSD({ icon: "i-droplet", label: "Meta de hoy completada", value: `${next} vasos`, percent: 100, tone: "water" });
    }
  }

  function message(count) {
    const goal = state.water.goal;
    if (count === 0) return "Empieza el día con un vaso";
    if (count >= goal) return "Meta cumplida. Bien hecho.";
    if (count >= goal * 0.75) return "Ya casi llegas";
    if (count >= goal * 0.4) return "Buen ritmo, sigue así";
    return "Vas bien, mantén el paso";
  }

  function drawChart() {
    const canvas = els?.canvas;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const days = Array.from({ length: 7 }, (_, i) => dayOffset(i - 6));
    const values = days.map((d) => state.water.log[dateKey(d)] || 0);
    const max = Math.max(state.water.goal, ...values, 1);
    const labelH = 13;
    const chartH = h - labelH;
    const n = days.length;
    const gap = 7;
    const bw = Math.max(4, (w - gap * (n - 1)) / n);

    // Línea de meta
    const goalY = chartH - (state.water.goal / max) * (chartH - 6);
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, goalY);
    ctx.lineTo(w, goalY);
    ctx.stroke();
    ctx.setLineDash([]);

    days.forEach((d, i) => {
      const x = i * (bw + gap);
      const ratio = values[i] / max;
      const bh = Math.max(values[i] > 0 ? 3 : 0, ratio * (chartH - 6));
      const y = chartH - bh;

      const grad = ctx.createLinearGradient(0, y, 0, chartH);
      const isToday = i === n - 1;
      grad.addColorStop(0, isToday ? "#7dd3fc" : "rgba(56,189,248,.72)");
      grad.addColorStop(1, isToday ? "#38bdf8" : "rgba(56,189,248,.22)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      const r = Math.min(4, bw / 2);
      ctx.roundRect(x, y, bw, bh, [r, r, 2, 2]);
      ctx.fill();

      if (values[i] === 0) {
        ctx.fillStyle = "rgba(255,255,255,.06)";
        ctx.beginPath();
        ctx.roundRect(x, chartH - 3, bw, 3, 2);
        ctx.fill();
      }

      ctx.fillStyle = isToday ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.32)";
      ctx.font = `${isToday ? 600 : 400} 9px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = "center";
      const label = d.toLocaleDateString("es-ES", { weekday: "narrow" });
      ctx.fillText(label.toUpperCase(), x + bw / 2, h - 2);
    });
  }

  function render() {
    if (!els) return;
    const count = todayCount();
    els.count.textContent = String(count);
    els.msg.textContent = message(count);
    els.glasses.forEach((g, i) => g.setAttribute("data-filled", String(i < count)));
    const s = streak();
    els.streak.textContent = `${s} ${s === 1 ? "día" : "días"}`;
    requestAnimationFrame(drawChart);
  }

  return {
    mount,
    render,
    destroy() {
      unsubscribe?.();
      unsubscribe = null;
      ro?.disconnect();
      ro = null;
    },
  };
}
