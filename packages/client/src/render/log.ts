export type LogKind = "game" | "chat-zone" | "chat-global" | "error";

const MAX_LINES = 200;

/** Scrolling message log. Chat is always written via textContent — never innerHTML. */
export class MessageLog {
  constructor(private readonly el: HTMLElement) {}

  append(text: string, kind: LogKind = "game"): void {
    const line = document.createElement("div");
    line.className = kind;
    line.textContent = text;
    this.el.appendChild(line);
    while (this.el.childElementCount > MAX_LINES) this.el.firstElementChild?.remove();
    this.el.scrollTop = this.el.scrollHeight;
  }
}
