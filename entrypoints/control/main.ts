import { browser, type Browser } from 'wxt/browser';
import type { AskResponse, FromRelay, ToRelay } from '../../src/lib/messages';
import { Session, type Line, type Participant } from '../../src/lib/session';

interface Bot extends Participant {
  tabId: number;
  frameId: number;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tabsEl = $<HTMLUListElement>('tabs');
const participantsEl = $<HTMLUListElement>('participants');
const transcriptEl = $<HTMLUListElement>('transcript');
const statusEl = $('status');
const startBtn = $<HTMLButtonElement>('start');
const stopBtn = $<HTMLButtonElement>('stop');

let bots: Bot[] = [];
let session: Session | null = null;

function li(...children: (Node | string)[]): HTMLLIElement {
  const el = document.createElement('li');
  el.append(...children);
  return el;
}

function span(text: string, cls = 'grow'): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button');
  el.textContent = text;
  el.onclick = onClick;
  return el;
}

const send = (tabId: number, msg: ToRelay, frameId?: number) =>
  browser.tabs.sendMessage(tabId, msg, frameId == null ? undefined : { frameId });

async function renderTabs() {
  const tabs = (await browser.tabs.query({})).filter((t) => t.id != null && /^https?:|^file:/.test(t.url ?? ''));
  tabsEl.replaceChildren(
    ...(tabs.length
      ? tabs.map((t) => {
          const added = bots.some((b) => b.tabId === t.id);
          const btn = button(added ? 'Re-pick' : 'Add', () => addTab(t));
          return li(span(t.title || t.url || ''), btn);
        })
      : [li(span('No web pages open.', 'empty'))]),
  );
}

function renderBots() {
  participantsEl.replaceChildren(
    ...(bots.length
      ? bots.map((b, i) =>
          li(
            span(`${i + 1}. ${b.name}`),
            button('Remove', () => {
              bots = bots.filter((x) => x !== b);
              renderBots();
              void renderTabs();
            }),
          ),
        )
      : [li(span('Add a tab above, then click its chat input and its reply area.', 'empty'))]),
  );
  startBtn.disabled = !!session || bots.length === 0;
}

async function addTab(tab: Browser.tabs.Tab) {
  const tabId = tab.id!;
  try {
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['/relay.js'] });
  } catch (e) {
    statusEl.textContent = `Could not attach to that tab: ${e instanceof Error ? e.message : e}`;
    return;
  }
  await browser.tabs.update(tabId, { active: true });
  if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
  statusEl.textContent = `Picking in “${tab.title}”…`;
  await send(tabId, { type: 'pick' }).catch(() => {});
}

browser.runtime.onMessage.addListener((raw, sender) => {
  const msg = raw as FromRelay;
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  if (msg.type === 'pickStarted') void send(tabId, { type: 'cancelPick', keep: msg.token }).catch(() => {});
  if (msg.type === 'picked') {
    const frameId = sender.frameId ?? 0;
    const others = bots.filter((b) => b.tabId !== tabId);
    const taken = new Set(others.map((b) => b.name));
    let name = msg.host || msg.title || `tab ${tabId}`;
    for (let n = 2; taken.has(name); n++) name = `${msg.host} #${n}`;
    bots = [...others, { id: `${tabId}:${frameId}`, name, tabId, frameId }];
    statusEl.textContent = `Added ${name}.`;
    renderBots();
    void renderTabs();
    // Come back to the control room once picking is done.
    void browser.tabs.getCurrent().then((me) => {
      if (me?.id != null) void browser.tabs.update(me.id, { active: true });
    });
  }
});

function showLine(line: Line) {
  if (transcriptEl.querySelector('.empty')) transcriptEl.replaceChildren();
  const who = document.createElement('b');
  who.textContent = `${line.speaker}:`;
  transcriptEl.append(li(who, ' ', line.text));
}

startBtn.onclick = async () => {
  const bySpeaker = new Map(bots.map((b) => [b.id, b]));
  transcriptEl.replaceChildren();
  session = new Session({
    participants: bots.map(({ id, name }) => ({ id, name })),
    seed: $<HTMLTextAreaElement>('seed').value,
    maxTurns: Number($<HTMLInputElement>('turns').value),
    delayMs: Number($<HTMLInputElement>('delay').value) * 1000,
    onLine: showLine,
    ask: async (p, text) => {
      const b = bySpeaker.get(p.id)!;
      statusEl.textContent = `Waiting for ${b.name}…`;
      const res = (await send(b.tabId, { type: 'ask', text }, b.frameId)) as AskResponse | undefined;
      if (!res) throw new Error('no answer from the tab; re-add it');
      if ('error' in res) throw new Error(res.error);
      return res.reply;
    },
  });
  startBtn.disabled = true;
  stopBtn.disabled = false;
  const { reason } = await session.run();
  statusEl.textContent = `Ended: ${reason}.`;
  session = null;
  stopBtn.disabled = true;
  renderBots();
};

stopBtn.onclick = () => {
  session?.stop();
  statusEl.textContent = 'Stopping after the current turn…';
};

browser.tabs.onRemoved.addListener((tabId) => {
  bots = bots.filter((b) => b.tabId !== tabId);
  renderBots();
  void renderTabs();
});
browser.tabs.onUpdated.addListener((_id, info) => {
  if (info.title || info.status === 'complete') void renderTabs();
});

renderBots();
void renderTabs();
