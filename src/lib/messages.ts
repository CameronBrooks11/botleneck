// Messages between the control page and the relay script in each tab.

/** Control page -> relay script. */
export type ToRelay =
  | { type: 'pick' }
  | { type: 'cancelPick'; keep: string }
  | { type: 'ask'; text: string };

/** Relay script -> control page. */
export type FromRelay =
  | { type: 'pickStarted'; token: string }
  | { type: 'picked'; host: string; title: string };

export type AskResponse = { reply: string } | { error: string };
