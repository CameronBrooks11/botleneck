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

export function typeInto(el: Editable, text: string): void {
  el.focus();
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
  let scope: Element | null = el.parentElement;
  for (let depth = 0; scope && depth < 5; depth++, scope = scope.parentElement) {
    for (const b of scope.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]')) {
      const label = `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''} ${b.textContent ?? ''} ${(b as HTMLInputElement).value ?? ''}`;
      if (b.getAttribute('type') === 'submit' || /send|submit/i.test(label)) return b;
    }
  }
  return null;
}

/** Submit what is in `el`: Enter first, then the form, then a send button. */
export async function submit(el: Editable, settle = 300): Promise<void> {
  const typed = valueOf(el);
  const sent = () => valueOf(el) !== typed || !valueOf(el).trim();
  const wait = () => new Promise((r) => setTimeout(r, settle));
  pressEnter(el);
  await wait();
  if (sent()) return;
  const form = el.closest('form');
  if (form) {
    form.requestSubmit();
    await wait();
    if (sent()) return;
  }
  findSendButton(el)?.click();
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
  await submit(input);
  return reply;
}
