// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  ask,
  botMessages,
  chatScope,
  cleanText,
  findSendButton,
  isEcho,
  newMessages,
  resolveEditable,
  signatureOf,
  submit,
  typeInto,
  waitForReply,
} from '../src/lib/dom';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * A widget laid out like the real ones: avatar initials, a meta line with
 * the sender and time, a "Thinking" bubble, and a sources block, all next to
 * the actual message text.
 */
function widget(replies: string[]) {
  document.body.innerHTML = `
    <div id="w">
      <div id="log">
        <div class="row agent"><span class="avatar">VA</span>
          <div class="msg msg-agent"><span id="hello">Thanks for reaching out. How can I help?</span></div>
          <div class="meta">Virtual Assistant • 1:19 PM</div>
        </div>
      </div>
      <textarea id="in"></textarea>
    </div>`;
  const log = document.getElementById('log')!;
  const input = document.getElementById('in') as HTMLTextAreaElement;
  let turn = 0;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = input.value;
    input.value = '';
    log.insertAdjacentHTML(
      'beforeend',
      `<div class="row user"><div class="msg msg-user">${q}</div><div class="meta">Sent • 1:20 PM</div></div>`,
    );
    log.insertAdjacentHTML(
      'beforeend',
      '<div class="row agent"><span class="avatar">VA</span><div class="msg msg-agent">Thinking</div></div>',
    );
    const bubble = log.lastElementChild!.querySelector('.msg')!;
    const reply = replies[turn++ % replies.length]!;
    setTimeout(() => (bubble.textContent = reply.slice(0, 10)), 10);
    setTimeout(() => {
      bubble.textContent = reply;
      log.insertAdjacentHTML('beforeend', '<div class="sources">Learn More:<br>1. Some page</div>');
    }, 25);
  });
  const hello = document.getElementById('hello')!;
  return { input, hello, scope: chatScope(input, hello), sig: signatureOf(hello) };
}

describe('reading replies', () => {
  const fast = { settleMs: 40, timeoutMs: 1000 };

  it('returns only the bot message, without labels, times, echo or sources', async () => {
    const { input, scope, sig } = widget(['For a family of four, try the Equinox.']);
    expect(await ask(input, scope, sig, 'Hi! What do you recommend?', fast)).toBe(
      'For a family of four, try the Equinox.',
    );
  });

  it('does not take the Thinking bubble for the reply', async () => {
    const { input, scope, sig } = widget(['Done thinking now, here is a long answer.']);
    expect(await ask(input, scope, sig, 'q?', fast)).toBe('Done thinking now, here is a long answer.');
  });

  it('notices a bot repeating itself word for word', async () => {
    const same = 'What do you need help with on your Rogers services today?';
    const { input, scope, sig } = widget([same]);
    expect(await ask(input, scope, sig, 'first', fast)).toBe(same);
    expect(await ask(input, scope, sig, 'second', fast)).toBe(same);
  });

  it('learns the bubble from a click on the text inside it', () => {
    const { hello, sig } = widget([]);
    expect(sig).toEqual({ tag: 'DIV', classes: ['msg', 'msg-agent'] });
    expect(hello.tagName).toBe('SPAN');
  });

  it('tells bot bubbles from user bubbles', () => {
    const { scope, sig } = widget([]);
    document
      .getElementById('log')!
      .insertAdjacentHTML('beforeend', '<div class="msg msg-user">mine</div><div class="msg msg-agent welcome">hi again</div>');
    expect(botMessages(scope, sig)).toEqual(['Thanks for reaching out. How can I help?', 'hi again']);
  });

  it('resolves empty when no reply comes', async () => {
    const { scope, sig } = widget([]);
    const read = () => botMessages(scope, sig).slice(1).join(' ');
    expect(await waitForReply(scope, read, { settleMs: 10, timeoutMs: 30 })).toBe('');
  });
});

describe('reading replies when both sides look the same', () => {
  it('leaves out our own message', async () => {
    document.body.innerHTML = '<div id="log"><p id="hi">Bot: hello</p></div><input id="in">';
    const log = document.getElementById('log')!;
    const input = document.getElementById('in') as HTMLInputElement;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      log.insertAdjacentHTML('beforeend', `<p>You: ${input.value}</p>`);
      input.value = '';
      setTimeout(() => log.insertAdjacentHTML('beforeend', '<p>Bot: sure</p>'), 10);
    });
    const hi = document.getElementById('hi')!;
    const reply = await ask(input, chatScope(input, hi), signatureOf(hi), 'any gaskets?', { settleMs: 30, timeoutMs: 1000 });
    expect(reply).toBe('Bot: sure');
  });
});

describe('cleanText', () => {
  it('drops widget chrome lines', () => {
    const raw = 'VA\nVirtual Assistant joined • 1:19 PM\nHello there.\nSent • 1:21 PM\nThinking\nAttach file\nToday • 1:19 PM\n10:42 am';
    expect(cleanText(raw)).toBe('Hello there.');
  });
  it('keeps real content that mentions times', () => {
    expect(cleanText('We open at 9:00 AM and close at 5:00 PM.')).toBe('We open at 9:00 AM and close at 5:00 PM.');
  });
});

describe('newMessages', () => {
  it('counts duplicates', () => {
    expect(newMessages(['a', 'b'], ['a', 'b', 'b'])).toEqual(['b']);
    expect(newMessages(['a'], ['a'])).toEqual([]);
  });
});

describe('isEcho', () => {
  it('matches our message with or without a label', () => {
    expect(isEcho('Hello there', 'hello there')).toBe(true);
    expect(isEcho('You: Hello there', 'Hello there')).toBe(true);
    expect(isEcho('Hello there! Welcome to a long answer about gaskets and seals.', 'Hello there')).toBe(false);
  });
});

describe('chatScope', () => {
  it('widens a picked message to the area that also holds the input', () => {
    const { scope } = widget([]);
    expect(scope.id).toBe('w');
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

describe('resolveEditable', () => {
  it('finds the text box inside a clicked wrapper', () => {
    document.body.innerHTML = '<div id="wrap"><span>icon</span><textarea id="t"></textarea></div>';
    expect(resolveEditable(document.getElementById('wrap')!)?.id).toBe('t');
  });

  it('looks inside open shadow roots', () => {
    const host = document.createElement('chat-box');
    host.attachShadow({ mode: 'open' }).innerHTML = '<div><input id="deep"></div>';
    document.body.append(host);
    expect(resolveEditable(host)?.id).toBe('deep');
  });

  it('rejects something with no text box', () => {
    document.body.innerHTML = '<p id="p">hello</p><input type="hidden">';
    expect(resolveEditable(document.getElementById('p')!)).toBeNull();
  });
});

describe('ask when the chat will not send', () => {
  it('fails fast instead of waiting for a reply', async () => {
    const { scope, sig } = widget([]);
    const dead = document.createElement('input');
    document.body.append(dead);
    await expect(ask(dead, scope, sig, 'hi', { settleMs: 10, timeoutMs: 5000 })).rejects.toThrow('did not send');
  });
});
