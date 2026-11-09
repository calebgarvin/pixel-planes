/** Gentle toast messages at the bottom of the screen. */

let container: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'good' | 'warn' = 'info'): void {
  container ??= document.getElementById('toasts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  container.appendChild(el);
  // Keep at most 4 on screen.
  while (container.children.length > 4) container.firstElementChild?.remove();
  setTimeout(() => el.classList.add('toast-out'), 2600);
  setTimeout(() => el.remove(), 3100);
}
