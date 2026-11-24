// Injected on demand, into every frame of a tab the user adds. The frame the
// user picks in becomes the participant; the rest stay idle.
import { browser } from 'wxt/browser';
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { ask, chatScope, type Editable } from '../src/lib/dom';
import type { AskResponse, FromRelay, ToRelay } from '../src/lib/messages';
import { flash, pickElement } from '../src/lib/picker';

declare global {
  interface Window {
    __botleneck?: boolean;
  }
}

export default defineUnlistedScript(() => {
  if (window.__botleneck) return;
  window.__botleneck = true;

  const token = crypto.randomUUID();
  const isTop = window === window.top;
  let input: Editable | null = null;
  let transcript: Element | null = null;
  let picking: AbortController | null = null;
  const tell = (msg: FromRelay) => browser.runtime.sendMessage(msg).catch(() => {});

  async function pick() {
    picking?.abort();
    const ctl = (picking = new AbortController());
    try {
      const i = await pickElement('1/2 — click the chat input box', ctl.signal, isTop);
      flash(i);
      await tell({ type: 'pickStarted', token });
      const t = await pickElement('2/2 — click the area where replies appear (↑ to widen)', ctl.signal, true);
      flash(t);
      input = i as Editable;
      transcript = chatScope(i, t);
      await tell({ type: 'picked', host: location.hostname.replace(/^www\./, ''), title: document.title });
    } catch {
      // cancelled, or another frame was picked
    }
  }

  browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = raw as ToRelay;
    if (msg.type === 'pick') void pick();
    else if (msg.type === 'cancelPick' && msg.keep !== token) picking?.abort();
    else if (msg.type === 'ask') {
      if (!input?.isConnected || !transcript?.isConnected) {
        sendResponse({ error: 'chat elements are gone; re-add this tab' } satisfies AskResponse);
        return;
      }
      ask(input, transcript, msg.text).then(
        (reply) => sendResponse({ reply } satisfies AskResponse),
        (e) => sendResponse({ error: String(e) } satisfies AskResponse),
      );
      return true;
    }
  });
});
