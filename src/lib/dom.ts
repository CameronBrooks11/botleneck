// Generic chat adapter: drive any chat widget given two elements the user
// picked — where to type, and where the replies appear. No site knowledge.

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function textOf(el: Element): string {
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
}

/**
 * The text the bot added to the transcript since `before` was captured,
 * minus the echo of what we sent.
 */
export function extractReply(before: string, after: string, sent: string): string {
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  let added = after.slice(i).trim();
  const echo = sent.trim();
  const at = echo ? added.indexOf(echo) : -1;
  // Only strip the echo near the start; the bot quoting us later is content.
  if (at >= 0 && at < 40) added = added.slice(at + echo.length);
  return added.replace(/\s+/g, ' ').trim();
}

function isFormField(el: Element): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function valueOf(el: Editable): string {
  return isFormField(el) ? el.value : (el.textContent ?? '');
}

const EDITABLE = 'textarea, input:not([type=hidden]):not([type=button]):not([type=submit]), [contenteditable=""], [contenteditable="true"]';

function isEditable(el: Element): boolean {
  return isFormField(el) || (el as HTMLElement).isContentEditable === true;
}

/**
 * The text box itself, given what was clicked: the element, or the first
 * text box inside it, looking through open shadow roots (web-component chat
 * widgets put their input there).
 */
export function resolveEditable(el: Element): Editable | null {
  if (isEditable(el)) return el as Editable;
  const roots: ParentNode[] = [el];
  if (el.shadowRoot) roots.push(el.shadowRoot);
  for (let i = 0; i < roots.length; i++) {
    const found = roots[i]!.querySelector(EDITABLE);
    if (found) return found as Editable;
    for (const child of roots[i]!.querySelectorAll('*')) if (child.shadowRoot) roots.push(child.shadowRoot);
  }
  return null;
}

export function typeInto(el: Editable, text: string): void {
  el.focus();
  // insertText goes through the browser's own editing path, so the page sees
  // trusted input events, as with paste or autofill. Widgets that only track
  // real typing ignore anything less.
  if (isFormField(el)) el.select();
  else getSelection()?.selectAllChildren(el);
  try {
    if (document.execCommand?.('insertText', false, text) && valueOf(el).trim() === text.trim()) return;
  } catch {
    // not supported here; fall through
  }
  if (isFormField(el)) {
    // Go through the prototype setter so React-style controlled inputs notice.
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  } else {
    el.textContent = text;
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function pressEnter(el: Element): void {
  const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  el.dispatchEvent(new KeyboardEvent('keypress', init));
  el.dispatchEvent(new KeyboardEvent('keyup', init));
}

/** A send button near the input, if there is one. */
export function findSendButton(el: Element): HTMLElement | null {
  const up = (e: Element) => e.parentElement ?? ((e.getRootNode() as ShadowRoot).host || null);
  let scope: Element | null = up(el);
  for (let depth = 0; scope && depth < 5; depth++, scope = up(scope)) {
    for (const b of scope.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]')) {
      const label = `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.textContent ?? ''} ${(b as HTMLInputElement).value ?? ''}`;
      if (b.getAttribute('type') === 'submit' || /send|submit/i.test(label)) return b;
    }
  }
  return null;
}

/**
 * Submit what is in `el`: Enter first, then the form, then a send button.
 * Resolves whether the box emptied or changed, i.e. the widget took it.
 */
export async function submit(el: Editable, settle = 300): Promise<boolean> {
  const typed = valueOf(el);
  const sent = () => valueOf(el) !== typed || !valueOf(el).trim();
  const wait = () => new Promise((r) => setTimeout(r, settle));
  pressEnter(el);
  await wait();
  if (sent()) return true;
  const form = el.closest('form');
  if (form) {
    form.requestSubmit();
    await wait();
    if (sent()) return true;
  }
  findSendButton(el)?.click();
  await wait();
  return sent();
}

export interface WaitOptions {
  /** Quiet period after the last change before the reply counts as finished. */
  settleMs?: number;
  timeoutMs?: number;
}

/**
 * Resolve with the reply once the transcript has gained new text and then
 * stayed unchanged for `settleMs` (which absorbs streamed replies). Resolves
 * '' on timeout.
 */
export function waitForReply(
  transcript: Element,
  before: string,
  sent: string,
  { settleMs = 2000, timeoutMs = 60_000 }: WaitOptions = {},
): Promise<string> {
  return new Promise((resolve) => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const finish = (reply: string) => {
      observer.disconnect();
      clearTimeout(settle);
      clearTimeout(timeout);
      resolve(reply);
    };
    const check = () => {
      const reply = extractReply(before, textOf(transcript), sent);
      clearTimeout(settle);
      if (reply) settle = setTimeout(() => finish(extractReply(before, textOf(transcript), sent)), settleMs);
    };
    const observer = new MutationObserver(check);
    observer.observe(transcript, { childList: true, subtree: true, characterData: true });
    const timeout = setTimeout(() => finish(''), timeoutMs);
    check();
  });
}

/** Type `text`, send it, and wait for the bot's answer. */
export async function ask(input: Editable, transcript: Element, text: string, opts?: WaitOptions): Promise<string> {
  const before = textOf(transcript);
  const reply = waitForReply(transcript, before, text, opts);
  typeInto(input, text);
  if (!(await submit(input))) throw new Error('typed the message but the chat did not send it');
  return reply;
}

/**
 * Where to watch for replies: the nearest element holding both the input and
 * the picked reply area. Clicking one message bubble, rather than the list,
 * is the easy mistake, and a lone bubble never changes.
 */
export function chatScope(input: Element, picked: Element): Element {
  let el: Element | null = picked;
  while (el && !el.contains(input)) el = el.parentElement;
  return el ?? picked;
}
