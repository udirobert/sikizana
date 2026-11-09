/** Minimal DOM helpers — no framework, keyboard-complete by default. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string | boolean>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === undefined) continue;
    if (k === "class") node.className = String(v);
    else if (k === "text") node.textContent = String(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(c));
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Buttons that ignore clicks while a phase is advancing (anti double-fire). */
export function choiceButton(label: string, detail: string, onPick: () => void): HTMLButtonElement {
  const b = el("button", { class: "lm-choice", type: "button" });
  b.append(el("span", { class: "lm-choice-label", text: label }), el("span", { class: "lm-choice-detail", text: detail }));
  let armed = true;
  b.addEventListener("click", () => {
    if (!armed) return;
    armed = false;
    onPick();
  });
  return b;
}
