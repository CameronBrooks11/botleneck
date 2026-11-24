// A fake support widget laid out like real ones: avatar initials, a meta
// line with sender and time, a "Thinking" bubble that turns into a streamed
// reply, and a sources block. Enter sends.
// The page sets window.BOT = { name, replies: [fn(question) => string] }.
const log = document.getElementById('log');
const input = document.getElementById('input');
const initials = BOT.name.split(' ').map((w) => w[0]).join('');
let turn = 0;

function row(who, text) {
  const mine = who === 'user';
  const el = document.createElement('div');
  el.className = `row ${who}`;
  el.innerHTML = `${mine ? '' : '<span class="avatar"></span>'}<div class="msg msg-${who}"></div><div class="meta"></div>`;
  if (!mine) el.querySelector('.avatar').textContent = initials;
  el.querySelector('.msg').textContent = text;
  el.querySelector('.meta').textContent = `${mine ? 'Sent' : BOT.name} • 1:${String(20 + turn).padStart(2, '0')} PM`;
  log.append(el);
  return el.querySelector('.msg');
}

row('bot', 'Hi! How can I help you today?');

input.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !input.value.trim()) return;
  e.preventDefault();
  const q = input.value.trim();
  input.value = '';
  row('user', q);
  const reply = BOT.replies[turn++ % BOT.replies.length](q);
  const bubble = row('bot', 'Thinking');
  setTimeout(() => {
    const words = reply.split(' ');
    let n = 0;
    const tick = setInterval(() => {
      n = Math.min(words.length, n + Math.ceil(words.length / 3));
      bubble.textContent = words.slice(0, n).join(' ');
      if (n < words.length) return;
      clearInterval(tick);
      const src = document.createElement('div');
      src.className = 'sources';
      src.textContent = 'Learn More: 1. Our menu';
      log.append(src);
    }, 150);
  }, 400);
});
