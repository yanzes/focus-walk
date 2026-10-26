"use strict";

/**
 * Cliente del puente de Windows. Lanza un proceso PowerShell que expone el estado
 * real del sistema (SMTC, volumen WASAPI, Mayús, brillo) por una named pipe y
 * acepta comandos por la misma vía.
 */

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const { EventEmitter } = require("node:events");

const PIPE_PATH = "\\\\.\\pipe\\focuswalk-system";
const SCRIPT = path.join(__dirname, "native", "system-bridge.ps1");

class SystemBridge extends EventEmitter {
  constructor() {
    super();
    this.child = null;
    this.socket = null;
    this.buffer = "";
    this.state = null;
    this.connected = false;
    this.stopping = false;
    this.restartTimer = 0;
    this.connectTimer = 0;
    this.restarts = 0;
  }

  start() {
    this.stopping = false;
    this.spawnHelper();
  }

  spawnHelper() {
    if (this.stopping) return;
    try {
      this.child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          SCRIPT,
          "-PipeName",
          "focuswalk-system",
        ],
        { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
      );

      this.child.stderr.on("data", (data) => {
        const text = String(data).trim();
        if (text) this.emit("log", text.split("\n").slice(-2).join(" "));
      });

      this.child.on("exit", (code) => {
        this.child = null;
        this.setConnected(false);
        if (this.stopping) return;
        // Un fallo aquí no debe tumbar la app: reintentamos con espera creciente.
        this.restarts += 1;
        const delay = Math.min(8000, 500 * this.restarts);
        this.restartTimer = setTimeout(() => this.spawnHelper(), delay);
      });

      this.connect();
    } catch (err) {
      this.emit("log", `no se pudo lanzar el puente: ${err.message}`);
    }
  }

  connect() {
    if (this.stopping) return;
    clearTimeout(this.connectTimer);

    const socket = net.connect(PIPE_PATH);
    socket.setEncoding("utf8");

    socket.on("connect", () => {
      this.socket = socket;
      this.restarts = 0;
      this.setConnected(true);
    });

    socket.on("data", (chunk) => {
      this.buffer += chunk;
      let index = this.buffer.indexOf("\n");
      while (index !== -1) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (line) this.handleLine(line);
        index = this.buffer.indexOf("\n");
      }
    });

    socket.on("error", () => {
      /* la reconexión se encarga */
    });

    socket.on("close", () => {
      if (this.socket === socket) this.socket = null;
      this.setConnected(false);
      if (!this.stopping) this.connectTimer = setTimeout(() => this.connect(), 400);
    });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.type === "state") {
      this.state = message;
      this.emit("state", message);
    } else if (message.type === "art") {
      this.emit("art", message);
    } else if (message.type === "error") {
      this.emit("log", `puente: ${message.reason}${message.cmd ? ` (${message.cmd})` : ""}`);
    }
  }

  setConnected(value) {
    if (this.connected === value) return;
    this.connected = value;
    this.emit("connection", value);
  }

  send(command) {
    if (!this.socket || !this.connected) return false;
    try {
      this.socket.write(`${JSON.stringify(command)}\n`);
      return true;
    } catch {
      return false;
    }
  }

  stop() {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    clearTimeout(this.connectTimer);
    try {
      this.socket?.destroy();
    } catch {
      /* ignorado */
    }
    try {
      this.child?.kill();
    } catch {
      /* ignorado */
    }
    this.socket = null;
    this.child = null;
  }
}

module.exports = { SystemBridge };
