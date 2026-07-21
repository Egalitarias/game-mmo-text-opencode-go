import { generateZone, PROTOCOL_VERSION } from "@game/shared";
import type { ChatChannel, EntityId, EntityView, Zone } from "@game/shared";
import { CanvasGridRenderer } from "./render/canvas.js";
import { MessageLog } from "./render/log.js";
import { keyToMove } from "./input/keys.js";
import { GameSocket } from "./net/socket.js";

// ── DOM ──────────────────────────────────────────────────────────────────────

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

const grid = new CanvasGridRenderer(el<HTMLCanvasElement>("grid"), 20);
const log = new MessageLog(el("log"));
const statusEl = el("status");
const overlay = el("overlay");
const overlayError = el("overlay-error");
const joinForm = el<HTMLFormElement>("join-form");
const handleInput = el<HTMLInputElement>("handle");
const spectatorInput = el<HTMLInputElement>("spectator");
const chatbar = el("chatbar");
const chatPrompt = el("chat-prompt");
const chatField = el<HTMLInputElement>("chat-field");

// ── interpolation ────────────────────────────────────────────────────────────

interface InterpolatedEntity {
  id: EntityId;
  glyph: string;
  handle?: string;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  zone: string;
  updateTime: number;
}

const TICK_INTERVAL_MS = 100; // Server tick rate
const INTERPOLATION_DELAY_MS = 150; // Render 1.5 ticks behind

const interpolatedEntities = new Map<EntityId, InterpolatedEntity>();
let animationFrameId: number | null = null;

function updateInterpolation(entities: EntityView[]): void {
  const now = performance.now();
  
  // Update or add entities
  for (const entity of entities) {
    const existing = interpolatedEntities.get(entity.id);
    if (existing) {
      // Move current to previous, update current
      existing.prevX = existing.currX;
      existing.prevY = existing.currY;
      existing.currX = entity.pos.x;
      existing.currY = entity.pos.y;
      existing.updateTime = now;
      if (entity.handle !== undefined) {
        existing.handle = entity.handle;
      }
    } else {
      // New entity - start at current position
      const interpolated: InterpolatedEntity = {
        id: entity.id,
        glyph: entity.glyph,
        prevX: entity.pos.x,
        prevY: entity.pos.y,
        currX: entity.pos.x,
        currY: entity.pos.y,
        zone: entity.pos.zone,
        updateTime: now,
      };
      if (entity.handle !== undefined) {
        interpolated.handle = entity.handle;
      }
      interpolatedEntities.set(entity.id, interpolated);
    }
  }
  
  // Remove entities that are no longer present
  const entityIds = new Set(entities.map(e => e.id));
  for (const id of interpolatedEntities.keys()) {
    if (!entityIds.has(id)) {
      interpolatedEntities.delete(id);
    }
  }
}

function getInterpolatedEntities(): EntityView[] {
  const now = performance.now();
  const renderTime = now - INTERPOLATION_DELAY_MS;
  
  const result: EntityView[] = [];
  
  for (const entity of interpolatedEntities.values()) {
    const timeSinceUpdate = renderTime - entity.updateTime;
    
    // If we're rendering before the update, use previous position
    // If we're rendering after, interpolate towards current
    let t = Math.max(0, Math.min(1, timeSinceUpdate / TICK_INTERVAL_MS));
    
    // If entity hasn't moved recently, snap to current position
    if (entity.prevX === entity.currX && entity.prevY === entity.currY) {
      t = 1;
    }
    
    const x = entity.prevX + (entity.currX - entity.prevX) * t;
    const y = entity.prevY + (entity.currY - entity.prevY) * t;
    
    const view: EntityView = {
      id: entity.id,
      glyph: entity.glyph,
      pos: {
        x,
        y,
        zone: entity.zone,
      },
    };
    
    if (entity.handle !== undefined) {
      view.handle = entity.handle;
    }
    
    result.push(view);
  }
  
  return result;
}

function renderLoop(): void {
  if (state.zone && (state.youId !== undefined || state.spectator)) {
    const interpolated = getInterpolatedEntities();
    // Spectators don't have a youId, so pass undefined
    grid.render({ zone: state.zone, entities: interpolated, youId: state.spectator ? undefined : state.youId });
  }
  
  animationFrameId = requestAnimationFrame(renderLoop);
}

function startRenderLoop(): void {
  if (animationFrameId === null) {
    animationFrameId = requestAnimationFrame(renderLoop);
  }
}

function stopRenderLoop(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

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
  /** Whether this client is in spectator mode */
  spectator: boolean;
  spectatorCount: number;
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
  spectator: false,
  spectatorCount: 0,
};

// ── networking ───────────────────────────────────────────────────────────────

const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

function sendHello(): void {
  if (state.handle) {
    socket.send({ 
      t: "hello", 
      handle: state.handle, 
      protocolVersion: PROTOCOL_VERSION,
      spectator: state.spectator 
    });
  }
}

const socket = new GameSocket(wsUrl, {
  onOpen() {
    sendHello();
  },
  onClose() {
    const wasInSession = state.youId !== undefined;
    // Drop session state so a rejected re-hello routes back to the join form
    // instead of the log (welcome/snapshot repopulate everything on success).
    state.youId = undefined;
    state.entities = [];
    state.roster = [];
    interpolatedEntities.clear();
    stopRenderLoop();
    if (wasInSession) log.append("connection lost — reconnecting…", "error");
  },
  onMessage(msg) {
    switch (msg.t) {
      case "welcome": {
        state.youId = msg.entityId;
        state.zone = generateZone(msg.zoneId, msg.zoneWidth, msg.zoneHeight, msg.zoneSeed);
        state.roster = msg.roster;
        state.spectatorCount = msg.spectatorCount;
        overlay.classList.add("hidden");
        log.append(
          state.spectator
            ? `welcome, ${state.handle} — spectating`
            : `welcome, ${state.handle} — you are @`,
          "game",
        );
        startRenderLoop();
        break;
      }
      case "snapshot":
        state.entities = msg.entities;
        updateInterpolation(msg.entities);
        renderStatus();
        break;
      case "delta": {
        // Apply delta: update changed entities and remove deleted ones
        const entityMap = new Map(state.entities.map(e => [e.id, e]));
        
        // Update or add changed entities
        for (const changed of msg.changed) {
          entityMap.set(changed.id, changed);
        }
        
        // Remove deleted entities
        for (const removedId of msg.removed) {
          entityMap.delete(removedId);
        }
        
        state.entities = Array.from(entityMap.values());
        updateInterpolation(state.entities);
        renderStatus();
        break;
      }
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
        renderStatus();
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
        break;
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
  
  // Spectators cannot send movement commands
  if (state.spectator) return;
  
  const cmd = keyToMove(e.code);
  if (cmd) {
    e.preventDefault();
    socket.send({ t: "cmd", seq: state.seq++, cmd });
  }
});

joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  state.handle = handleInput.value.trim();
  state.spectator = spectatorInput.checked;
  overlayError.textContent = "";
  // Reuse an open sessionless socket (e.g. after a rejected hello) instead of
  // piling up duplicate connections.
  if (socket.isOpen()) sendHello();
  else socket.connect();
});

// ── render ───────────────────────────────────────────────────────────────────

function renderStatus(): void {
  if (state.spectator) {
    statusEl.textContent = [
      `mode: SPECTATING`,
      `online (${state.roster.length}): ${state.roster.join(", ")}`,
      `spectators: ${state.spectatorCount}`,
    ].join("\n");
  } else {
    const you = state.entities.find((e) => e.id === state.youId);
    statusEl.textContent = [
      `you: ${you?.handle ?? "…"} (@)`,
      `online (${state.roster.length}): ${state.roster.join(", ")}`,
      `spectators: ${state.spectatorCount}`,
    ].join("\n");
  }
}
