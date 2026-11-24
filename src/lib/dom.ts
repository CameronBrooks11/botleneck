// Generic chat adapter: drive any chat widget given two elements the user
// picked — the text box, and one of the bot's messages. No site knowledge.

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function textOf(el: Element): string {
  return ((el as HTMLElement).innerText ?? el.textContent ?? '').trim();
}

// Lines inside a message that are widget chrome, not something the bot said.
const JUNK_LINES = [
  /^\W*$/,
  /[•·|]\s*\d{1,2}:\d{2}\s*([ap]\.?m\.?)?$/i, // "Virtual Assistant • 1:21 PM"
  /^(today|yesterday|just now|now)?\s*[•·]?\s*\d{1,2}:\d{2}\s*([ap]\.?m\.?)?$/i,
  /^(sent|delivered|read|seen|thinking|typing|attach file|send|copy|like|dislike|learn more:?|edited)[.…!\s]*$/i,
  /\bis typing\b/i,
  /^[A-Z]{1,3}$/, // avatar initials
];

/** Message text with timestamps, status words and avatar initials removed. */
export function cleanText(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !JUNK_LINES.some((re) => re.test(l)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What a bot message looks like on this page. */
export interface Signature {
  tag: string;
  classes: string[];
}

// Classes that come and go with state, and so say nothing about the role.
const STATEFUL = /(^|[-_])(hover|focus|active|selected|visible|hidden|animat\w*|fade\w*|enter\w*|leave\w*|appear\w*|new|last|first|odd|even)($|[-_])/i;
const stable = (el: Element) => [...el.classList].filter((c) => !STATEFUL.test(c));

/**
 * The signature of the bot message the user clicked. A click often lands on
 * a bare <span> or <p> inside the bubble, so prefer the nearest element that
 * has classes, a few levels up at most.
 */
export function signatureOf(el: Element): Signature {
  let target = el;
  for (let e: Element | null = el, i = 0; e && i < 4; e = e.parentElement, i++) {
    if (stable(e).length) {
      target = e;
      break;
    }
  }
  return { tag: target.tagName, classes: stable(target) };
}

/** Same tag, and at least half the classes in common (a "welcome" extra is fine). */
export function matchesSignature(el: Element, sig: Signature): boolean {
  if (el.tagName !== sig.tag) return false;
  const mine = stable(el);
  if (!sig.classes.length) return mine.length === 0;
  const shared = sig.classes.filter((c) => mine.includes(c)).length;
  return shared / new Set([...sig.classes, ...mine]).size >= 0.5;
}

/** Text of every bot message under `scope`, in order. */
export function botMessages(scope: Element, sig: Signature): string[] {
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const child of el.children) {
      if (matchesSignature(child, sig)) {
        const t = cleanText(textOf(child));
        if (t) out.push(t);
      } else walk(child);
    }
  };
  walk(scope);
  return out;
}

/** Messages in `after` that were not in `before`, counting duplicates. */
export function newMessages(before: string[], after: string[]): string[] {
  const seen = new Map<string, number>();
  for (const t of before) seen.set(t, (seen.get(t) ?? 0) + 1);
  return after.filter((t) => {
    const n = seen.get(t) ?? 0;
    if (n > 0) seen.set(t, n - 1);
    return n === 0;
  });
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/** Our own message coming back, possibly with a "You:" style label. */
export function isEcho(text: string, sent: string): boolean {
  const t = norm(text);
  const s = norm(sent);
  return t === s || (s.length >= 4 && t.includes(s) && t.length <= s.length + 30);
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
 * Resolve with `read()` once it is non-empty and has stayed unchanged for
 * `settleMs`, which absorbs streamed replies. Resolves '' on timeout.
 */
export function waitForReply(
  scope: Element,
  read: () => string,
  { settleMs = 2000, timeoutMs = 60_000 }: WaitOptions = {},
): Promise<string> {
  return new Promise((resolve) => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    let last = '';
    const finish = (reply: string) => {
      observer.disconnect();
      clearTimeout(settle);
      clearTimeout(timeout);
      resolve(reply);
    };
    const check = () => {
      const reply = read();
      if (reply === last) return;
      last = reply;
      clearTimeout(settle);
      if (reply) settle = setTimeout(() => finish(read()), settleMs);
    };
    const observer = new MutationObserver(check);
    observer.observe(scope, { childList: true, subtree: true, characterData: true });
    const timeout = setTimeout(() => finish(''), timeoutMs);
    check();
  });
}

/** Reads the bot's new messages since the moment it was created. */
export function replyReader(scope: Element, sig: Signature, sent: string): () => string {
  const before = botMessages(scope, sig);
  return () =>
    newMessages(before, botMessages(scope, sig))
      .filter((t) => !isEcho(t, sent))
      .join(' ');
}

/** Type `text`, send it, and wait for the bot's answer. */
export async function ask(
  input: Editable,
  scope: Element,
  sig: Signature,
  text: string,
  opts?: WaitOptions,
): Promise<string> {
  const reply = waitForReply(scope, replyReader(scope, sig, text), opts);
  typeInto(input, text);
  if (!(await submit(input))) throw new Error('typed the message but the chat did not send it');
  return reply;
}

/**
 * Where to watch for replies: the nearest element holding both the input and
 * the picked bot message.
 */
export function chatScope(input: Element, picked: Element): Element {
  let el: Element | null = picked;
  while (el && !el.contains(input)) el = el.parentElement;
  return el ?? picked;
}
