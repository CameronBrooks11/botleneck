# botleneck

Beep bop boop, I talk to you you talk to me. This browser extension bridges
the customer-service chatbots in your open tabs, so the fast-food bot can ask
the industrial-supply bot whatever it wants.

```
Burrito Barn: Can I interest you in extra hot sauce?
Bolt Depot:   What are your operating temperature and pressure requirements?
Burrito Barn: Are you asking about our hot sauce?
Bolt Depot:   I recommend a high-temperature food-grade silicone gasket.
```

No APIs, no backend, no AI of its own. It types into one chat widget, reads
what comes back, and types that into the next.

## Install

```sh
npm ci
npx wxt build              # Chrome  -> .output/chrome-mv3
npx wxt build -b firefox   # Firefox -> .output/firefox-mv2
```

Chrome: `chrome://extensions` → Developer mode → **Load unpacked** →
`.output/chrome-mv3`. Firefox: `about:debugging` → This Firefox → **Load
Temporary Add-on** → `.output/firefox-mv2/manifest.json`.

## Use

1. Open two or more sites with a support chat, and open each chat widget.
2. Click the botleneck toolbar button to open the control room.
3. Next to each tab, click **Add**. The extension switches to that tab: click
   the chat's text box, then **one of the bot's messages** (its greeting will
   do; Esc cancels). It returns to the control room when done.
4. Type an opening line, set the turns and delay, and press **Start**.

The opening line goes to the first participant, its reply goes to the second,
and so on round the table. With one participant it talks to itself.

## Guard rails

- Nothing runs in a tab until you add it.
- At most 50 turns, at least 1 second between them, and a **Stop** button.
- Messages are trimmed to 500 characters.
- The conversation ends, without relaying, as soon as a message mentions
  payment, passwords, checkout, placing or confirming an order, or verification
  codes. This is a crude keyword filter, so stay out of chats where you are
  logged in.

## How it works

| Piece | File |
| --- | --- |
| Turn-taking loop and guard rails | `src/lib/session.ts` |
| Typing, sending, and reading replies in any chat widget | `src/lib/dom.ts` |
| Point-and-click element picker | `src/lib/picker.ts` |
| Script injected into added tabs | `entrypoints/relay.ts` |
| Control room (runs the conversation) | `entrypoints/control/` |

The bot message you click teaches the relay what the bot's messages look like
on that page (element type and classes). After sending, the reply is whatever
new messages of that kind appear, minus your own message coming back and
lines that are widget chrome: timestamps, "Sent", "Thinking", avatar
initials. It counts as finished once it has stayed unchanged for 2 seconds,
which absorbs streamed replies.

## Limits

- If the widget puts the sender's name inside the message itself, it comes
  along ("Bolt Depot: …").
- A bot that pauses for more than 2 seconds mid-reply is cut off there.
- Tried on two real sites so far, one of them with its chat in a frame from
  another domain. Other widgets may need fixes.
- Synthetic key presses are ignored by some widgets. Sending falls back to
  submitting the form, then to a nearby "Send" button.

## Develop

```sh
just check   # type-check + build
just test    # unit tests (Vitest + happy-dom)
just e2e     # two fake bots bridged in headless Chromium (Playwright)
```

## License

MIT
