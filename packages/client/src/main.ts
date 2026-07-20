import { generateZone, PROTOCOL_VERSION } from "@game/shared";
import type { ChatChannel, EntityId, EntityView, Zone } from "@game/shared";
import { DomGridRenderer } from "./render/grid.js";
import { MessageLog } from "./render/log.js";
import { keyToMove } from "./input/keys.js";
import { GameSocket } from "./net/socket.js";

// ── DOM ──────────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

const grid = new DomGridRenderer(el("grid"));
const log = new MessageLog(el("log"));
const statusEl = el("status");
const overlay = el("overlay");
const overlayError = el("overlay-error");
const joinForm = el<HTMLFormElement>("join-form");
const handleInput = el<HTMLInputElement>("handle");
const chatbar = el("chatbar");
const chatPrompt = el("chat-prompt");
const chatField = el<HTMLInputElement>("chat-field");

// ── state (display data only — no game rules) ────────────────────────────────

interface ClientState {
  /** Handle chosen on the join form; re-sent as `hello` on every (re)connect. */
  handle: string;
  youId: EntityId | undefined;
  zone: Zone | undefined;
  entities: EntityView[];
  roster: string[];
  chatChannel: ChatChannel;
  chatOpen: boolean;
  seq: number;
}

const state: ClientState = {
  handle: "",
  youId: undefined,
  zone: undefined,
  entities: [],
  roster: [],
  chatChannel: "zone",
  chatOpen: false,
  seq: 0,
};

// ── networking ───────────────────────────────────────────────────────────────

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

const socket = new GameSocket(wsUrl, {
  onOpen() {
    if (state.handle) {
      socket.send({ t: "hello", handle: state.handle, protocolVersion: PROTOCOL_VERSION });
    }
  },
  onClose() {
    const wasInSession = state.youId !== undefined;
    // Drop session state so a rejected re-hello routes back to the join form
    // instead of the log (welcome/snapshot repopulate everything on success).
    state.youId = undefined;
    state.entities = [];
    state.roster = [];
    if (wasInSession) log.append("connection lost — reconnecting…", "error");
  },
  onMessage(msg) {
    switch (msg.t) {
      case "welcome": {
        state.youId = msg.entityId;
        state.zone = generateZone(msg.zoneId, msg.zoneWidth, msg.zoneHeight, msg.zoneSeed);
        state.roster = msg.roster;
        overlay.classList.add("hidden");
        log.append(`welcome, ${state.handle} — you are @`, "game");
        render();
        break;
      }
      case "snapshot":
        state.entities = msg.entities;
        render();
        break;
      case "events":
        for (const ev of msg.events) {
          if (ev.kind === "joined") {
            state.roster.push(ev.handle);
            log.append(`${ev.handle} joined the game`, "game");
          } else if (ev.kind === "left") {
            state.roster = state.roster.filter((h) => h !== ev.handle);
            log.append(`${ev.handle} left the game`, "game");
          }
        }
        render();
        break;
      case "chat":
        log.append(
          `<${msg.from}> ${msg.text}`,
          msg.channel === "zone" ? "chat-zone" : "chat-global",
        );
        break;
      case "reject":
        if (state.youId === undefined) {
          // Pre-session reject (taken/invalid handle, protocol mismatch): re-prompt.
          overlay.classList.remove("hidden");
          overlayError.textContent = msg.reason;
        } else {
          log.append(msg.reason, "error");
        }
        break;
      case "pong":
      case "delta":
        break; // deltas arrive with the bandwidth work in a later phase
    }
  },
});

// ── input ────────────────────────────────────────────────────────────────────

function openChat(): void {
  state.chatOpen = true;
  chatbar.classList.add("open");
  chatPrompt.textContent = `[${state.chatChannel}] >`;
  chatField.focus();
}

function closeChat(): void {
  state.chatOpen = false;
  chatbar.classList.remove("open");
  chatField.value = "";
  chatField.blur();
}

window.addEventListener("keydown", (e) => {
  if (state.youId === undefined) return;

  if (state.chatOpen) {
    if (e.key === "Escape") closeChat();
    else if (e.key === "Tab") {
      e.preventDefault();
      state.chatChannel = state.chatChannel === "zone" ? "global" : "zone";
      chatPrompt.textContent = `[${state.chatChannel}] >`;
    } else if (e.key === "Enter") {
      const text = chatField.value.trim();
      if (text) socket.send({ t: "chat", channel: state.chatChannel, text });
      closeChat();
    }
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    openChat();
    return;
  }
  const cmd = keyToMove(e.key);
  if (cmd) {
    e.preventDefault();
    socket.send({ t: "cmd", seq: state.seq++, cmd });
  }
});

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.handle = handleInput.value.trim();
  overlayError.textContent = "";
  socket.connect();
});

// ── render ───────────────────────────────────────────────────────────────────

function render(): void {
  if (state.zone) {
    grid.render({ zone: state.zone, entities: state.entities, youId: state.youId });
  }
  const you = state.entities.find((e) => e.id === state.youId);
  statusEl.textContent = [
    `you: ${you?.handle ?? "…"} (@)`,
    `online (${state.roster.length}): ${state.roster.join(", ")}`,
  ].join("\n");
}
