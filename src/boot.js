/**
 * Script clásico (no módulo) que corre antes del primer pintado:
 * marca el modo escritorio y avisa si se abrió como archivo local.
 */
(function () {
  if (window.notchNative && window.notchNative.isNative) {
    document.documentElement.dataset.native = "true";
    return;
  }

  if (location.protocol === "file:") {
    document.addEventListener("DOMContentLoaded", function () {
      var pill = document.getElementById("pill-text");
      if (pill) pill.innerHTML = "<strong>Necesita un servidor</strong> · doble clic en start.bat";
      var meta = document.getElementById("pill-meta");
      if (meta) meta.textContent = "file://";
    });
  }
})();
