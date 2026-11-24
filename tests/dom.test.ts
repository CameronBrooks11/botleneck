// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ask, chatScope, extractReply, findSendButton, submit, typeInto, waitForReply } from '../src/lib/dom';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractReply', () => {
  it('returns only the text appended since the snapshot', () => {
    expect(extractReply('Bot: hi', 'Bot: hi\nBot: want sauce?', 'x')).toBe('Bot: want sauce?');
  });

  it('strips the echo of what was sent', () => {
    expect(extractReply('Bot: hi', 'Bot: hi\nYou: gaskets?\nBot: Sauce.', 'gaskets?')).toBe('Bot: Sauce.');
  });

  it('keeps a later quote of the sent text', () => {
    const before = 'start';
    const after = `start ${'filler '.repeat(10)}you said hello`;
    expect(extractReply(before, after, 'hello')).toContain('you said hello');
  });

  it('copes with a transcript that changed above the reply', () => {
    expect(extractReply('a b c', 'a b X c d', 'zzz')).toBe('X c d');
  });

  it('is empty when nothing but the echo arrived', () => {
    expect(extractReply('hi', 'hi\nYou: hello', 'hello')).toBe('');
    expect(extractReply('hi', 'hi\nhello', 'hello')).toBe('');
  });
});

describe('typeInto', () => {
  it('sets a textarea and fires input', () => {
    const ta = document.createElement('textarea');
    document.body.append(ta);
    let seen = '';
    ta.addEventListener('input', () => (seen = ta.value));
    typeInto(ta, 'hello');
    expect(seen).toBe('hello');
  });

  it('fills a contenteditable', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.append(div);
    typeInto(div, 'hello');
    expect(div.textContent).toBe('hello');
  });
});

describe('submit', () => {
  it('stops after Enter when the widget handles it', async () => {
    document.body.innerHTML = '<form><input id="i"><button type="submit">Send</button></form>';
    const input = document.getElementById('i') as HTMLInputElement;
    let submits = 0;
    input.form!.addEventListener('submit', (e) => {
      e.preventDefault();
      submits++;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.value = '';
    });
    typeInto(input, 'hi');
    await submit(input, 5);
    expect(submits).toBe(0);
  });

  it('falls back to the form, then a send button', async () => {
    document.body.innerHTML = '<div><textarea id="t"></textarea><button aria-label="Send message">➤</button></div>';
    const ta = document.getElementById('t') as HTMLTextAreaElement;
    let clicks = 0;
    findSendButton(ta)!.addEventListener('click', () => clicks++);
    typeInto(ta, 'hi');
    await submit(ta, 5);
    expect(clicks).toBe(1);
  });
});

describe('waitForReply', () => {
  it('waits for the transcript to settle, absorbing streamed text', async () => {
    const log = document.createElement('div');
    log.textContent = 'Bot: hello';
    document.body.append(log);
    const before = log.textContent;
    const pending = waitForReply(log, before, 'q', { settleMs: 40, timeoutMs: 1000 });
    const line = document.createElement('p');
    log.append(line);
    for (const chunk of ['Bot: Fire', 'Bot: Fire sauce', 'Bot: Fire sauce is hot.']) {
      line.textContent = chunk;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(await pending).toBe('Bot: Fire sauce is hot.');
  });

  it('resolves empty on timeout', async () => {
    const log = document.createElement('div');
    document.body.append(log);
    expect(await waitForReply(log, '', 'q', { settleMs: 10, timeoutMs: 30 })).toBe('');
  });
});

describe('ask', () => {
  it('round-trips through a fake chat widget', async () => {
    document.body.innerHTML = '<div id="log"></div><input id="in">';
    const log = document.getElementById('log')!;
    const input = document.getElementById('in') as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const q = input.value;
      input.value = '';
      log.insertAdjacentHTML('beforeend', `<p>You: ${q}</p>`);
      setTimeout(() => log.insertAdjacentHTML('beforeend', `<p>Bot: you asked about ${q.length} things</p>`), 20);
    });
    const reply = await ask(input, log, 'gaskets', { settleMs: 30, timeoutMs: 1000 });
    expect(reply).toBe('Bot: you asked about 7 things');
  });
});

describe('chatScope', () => {
  function widget() {
    document.body.innerHTML = '<div id="w"><div id="log"><p id="hello">Bot: hi</p></div><input id="in"></div>';
    const log = document.getElementById('log')!;
    const input = document.getElementById('in') as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      input.value = '';
      setTimeout(() => log.insertAdjacentHTML('beforeend', '<p>Bot: sauce?</p>'), 10);
    });
    return { input, bubble: document.getElementById('hello')! };
  }

  it('widens a picked message bubble to the area that holds the replies', async () => {
    const { input, bubble } = widget();
    expect(chatScope(input, bubble).id).toBe('w');
    expect(await ask(input, chatScope(input, bubble), 'q', { settleMs: 20, timeoutMs: 500 })).toBe('Bot: sauce?');
  });

  it('keeps a pick that already contains the input', () => {
    const { input } = widget();
    const w = document.getElementById('w')!;
    expect(chatScope(input, w)).toBe(w);
  });
});
