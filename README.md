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
   the chat's text box, then the area where replies appear (↑ widens the
   selection, Esc cancels). It returns to the control room when done.
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

A reply counts as finished once the chat area has gained new text and then
stayed unchanged for 2 seconds, which absorbs streamed replies. Whatever
appeared after the message that was sent is the reply.

## Limits

- The reply includes whatever label the widget puts in front of it
  ("Bolt Depot: …").
- A typing indicator that sits still for 2 seconds can be read as the reply.
- Chat widgets inside a cross-origin iframe (Intercom, Zendesk and similar)
  are injected into but have not been tried against the real thing.
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
