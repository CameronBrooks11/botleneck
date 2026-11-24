// The conversation loop. Pure: everything that touches the browser comes in
// through `ask`, so it runs the same in tests and in the control page.

export interface Participant {
  id: string;
  name: string;
}

export interface Line {
  speaker: string;
  text: string;
}

export interface SessionOptions {
  participants: Participant[];
  seed: string;
  maxTurns: number;
  delayMs: number;
  /** Send `text` to `p` and resolve with its reply ('' for none). */
  ask: (p: Participant, text: string) => Promise<string>;
  onLine?: (line: Line) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface SessionResult {
  lines: Line[];
  reason: string;
}

export const LIMITS = {
  maxTurns: 50,
  minDelayMs: 1000,
  maxMessageChars: 500,
};

// Stop rather than relay anything that drifts toward a transaction or an
// account. Crude on purpose: a false stop costs nothing.
const HALT =
  /\b(credit card|card number|cvv|password|social security|ssn|billing address|checkout|check out now|place (?:the |your |an )?order|confirm (?:the |your )?(?:order|purchase|payment)|account number|one-time code|verification code)\b/i;

export function isSensitive(text: string): boolean {
  return HALT.test(text);
}

export function clampMessage(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > LIMITS.maxMessageChars ? t.slice(0, LIMITS.maxMessageChars - 1) + '…' : t;
}

export class Session {
  private stopped = false;

  constructor(private opts: SessionOptions) {}

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<SessionResult> {
    const { participants, ask, onLine } = this.opts;
    const sleep = this.opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const maxTurns = Math.max(1, Math.min(this.opts.maxTurns, LIMITS.maxTurns));
    const delayMs = Math.max(this.opts.delayMs, LIMITS.minDelayMs);
    const lines: Line[] = [];
    const push = (line: Line) => {
      lines.push(line);
      onLine?.(line);
    };
    const end = (reason: string) => ({ lines, reason });

    if (participants.length === 0) return end('no participants');
    let message = clampMessage(this.opts.seed);
    if (!message) return end('empty seed');
    if (isSensitive(message)) return end('seed looks transactional');
    push({ speaker: 'you', text: message });

    for (let turn = 0; turn < maxTurns; turn++) {
      if (this.stopped) return end('stopped');
      const p = participants[turn % participants.length]!;
      let reply: string;
      try {
        reply = clampMessage(await ask(p, message));
      } catch (e) {
        return end(`${p.name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (this.stopped) return end('stopped');
      if (!reply) return end(`${p.name} did not reply`);
      if (isSensitive(reply)) return end(`${p.name} drifted toward a transaction; not relayed`);
      push({ speaker: p.name, text: reply });
      message = reply;
      if (turn < maxTurns - 1) await sleep(delayMs);
    }
    return end('turn limit reached');
  }
}
