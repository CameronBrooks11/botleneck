// A fake support widget: Enter sends, the bot "types", then streams a reply.
// The page sets window.BOT = { name, replies: [fn(question) => string] }.
const log = document.getElementById('log');
const input = document.getElementById('input');
let turn = 0;

function line(who, text) {
  const p = document.createElement('p');
  p.innerHTML = '<b></b> <span></span>';
  p.querySelector('b').textContent = who + ':';
  p.querySelector('span').textContent = text;
  log.append(p);
  return p.querySelector('span');
}

line(BOT.name, 'Hi! How can I help you today?');

input.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !input.value.trim()) return;
  e.preventDefault();
  const q = input.value.trim();
  input.value = '';
  line('You', q);
  const reply = BOT.replies[turn++ % BOT.replies.length](q);
  const typing = line(BOT.name, 'typing…');
  setTimeout(() => {
    const words = reply.split(' ');
    let n = 0;
    typing.textContent = '';
    const tick = setInterval(() => {
      n = Math.min(words.length, n + Math.ceil(words.length / 3));
      typing.textContent = words.slice(0, n).join(' ');
      if (n >= words.length) clearInterval(tick);
    }, 150);
  }, 400);
});
