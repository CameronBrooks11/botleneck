import { describe, expect, it } from 'vitest';
import { clampMessage, isSensitive, LIMITS, Session, type Participant } from '../src/lib/session';

const a: Participant = { id: 'a', name: 'Burrito Barn' };
const b: Participant = { id: 'b', name: 'Bolt Depot' };
const noSleep = async () => {};

function run(opts: Partial<ConstructorParameters<typeof Session>[0]> = {}) {
  const asked: string[] = [];
  const session = new Session({
    participants: [a, b],
    seed: 'hello',
    maxTurns: 4,
    delayMs: 0,
    sleep: noSleep,
    ask: async (p, text) => {
      asked.push(`${p.id}<${text}`);
      return `${p.id} reply ${asked.length}`;
    },
    ...opts,
  });
  return { session, asked };
}

describe('Session', () => {
  it('alternates participants, relaying each reply to the next', async () => {
    const { session, asked } = run();
    const result = await session.run();
    expect(asked).toEqual(['a<hello', 'b<a reply 1', 'a<b reply 2', 'b<a reply 3']);
    expect(result.reason).toBe('turn limit reached');
    expect(result.lines.map((l) => l.speaker)).toEqual(['you', a.name, b.name, a.name, b.name]);
  });

  it('round-robins three participants', async () => {
    const c = { id: 'c', name: 'C' };
    const { session, asked } = run({ participants: [a, b, c], maxTurns: 4 });
    await session.run();
    expect(asked.map((s) => s[0])).toEqual(['a', 'b', 'c', 'a']);
  });

  it('caps turns at the hard limit', async () => {
    const { session, asked } = run({ maxTurns: 10_000 });
    await session.run();
    expect(asked).toHaveLength(LIMITS.maxTurns);
  });

  it('enforces the minimum delay between turns', async () => {
    const slept: number[] = [];
    const { session } = run({ delayMs: 0, maxTurns: 3, sleep: async (ms) => void slept.push(ms) });
    await session.run();
    expect(slept).toEqual([LIMITS.minDelayMs, LIMITS.minDelayMs]);
  });

  it('stops when asked, between turns', async () => {
    const { session, asked } = run({
      maxTurns: 10,
      sleep: async () => session.stop(),
    });
    const result = await session.run();
    expect(asked).toHaveLength(1);
    expect(result.reason).toBe('stopped');
  });

  it('stops when a participant says nothing', async () => {
    const { session } = run({ ask: async () => '   ' });
    const result = await session.run();
    expect(result.reason).toBe('Burrito Barn did not reply');
  });

  it('reports an adapter failure instead of throwing', async () => {
    const { session } = run({
      ask: async () => {
        throw new Error('input element gone');
      },
    });
    expect((await session.run()).reason).toBe('Burrito Barn failed: input element gone');
  });

  it('does not relay a reply that drifts toward a transaction', async () => {
    const { session } = run({ ask: async () => 'Great! Please enter your credit card number.' });
    const result = await session.run();
    expect(result.lines.map((l) => l.speaker)).toEqual(['you']);
    expect(result.reason).toMatch(/drifted toward a transaction/);
  });

  it('refuses a transactional seed without contacting anyone', async () => {
    const { session, asked } = run({ seed: 'please place an order for 40 tacos' });
    const result = await session.run();
    expect(asked).toHaveLength(0);
    expect(result.reason).toBe('seed looks transactional');
  });

  it('needs participants and a seed', async () => {
    expect((await run({ participants: [] }).session.run()).reason).toBe('no participants');
    expect((await run({ seed: '  ' }).session.run()).reason).toBe('empty seed');
  });
});

describe('isSensitive', () => {
  it.each(['Enter your CVV', 'confirm your order', 'what is your password', 'Proceed to checkout'])(
    'flags %s',
    (t) => expect(isSensitive(t)).toBe(true),
  );
  it.each(['What temperature rating do you need?', 'Would you like hot sauce?', 'order of operations'])(
    'passes %s',
    (t) => expect(isSensitive(t)).toBe(false),
  );
});

describe('clampMessage', () => {
  it('collapses whitespace and truncates', () => {
    expect(clampMessage('  a \n\n b ')).toBe('a b');
    const long = clampMessage('x'.repeat(2000));
    expect(long).toHaveLength(LIMITS.maxMessageChars);
    expect(long.endsWith('…')).toBe(true);
  });
});
