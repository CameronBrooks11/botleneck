// Two fake support bots on different origins, bridged by the built extension.
// Run `npm run build` first.
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const ext = resolve(import.meta.dirname, '../.output/chrome-mv3');
let context: BrowserContext;
let extId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extId = new URL(sw.url()).host;
});

test.afterAll(() => context.close());

async function addBot(control: Page, bot: Page, title: string) {
  await control.getByRole('listitem').filter({ hasText: title }).getByRole('button').click();
  await expect(bot.getByText('botleneck: 1/2')).toBeVisible();
  await bot.locator('#input').click();
  await expect(bot.getByText('botleneck: 2/2')).toBeVisible();
  await bot.locator('#log').click();
}

test('two bots talk to each other', async () => {
  const burrito = await context.newPage();
  await burrito.goto('http://localhost:4173/burrito.html');
  const bolts = await context.newPage();
  await bolts.goto('http://127.0.0.1:4173/bolts.html');
  const control = await context.newPage();
  await control.goto(`chrome-extension://${extId}/control.html`);

  await addBot(control, burrito, 'Burrito Barn Support');
  await expect(control.locator('#participants')).toContainText('1. localhost');
  await addBot(control, bolts, 'Bolt Depot Help');
  await expect(control.locator('#participants')).toContainText('2. 127.0.0.1');

  await control.locator('#seed').fill('Hello there, what do you sell?');
  await control.locator('#turns').fill('4');
  await control.locator('#delay').fill('1');
  await control.getByRole('button', { name: 'Start' }).click();
  await expect(control.locator('#status')).toHaveText('Ended: turn limit reached.', { timeout: 90_000 });

  const lines = await control.locator('#transcript li').allInnerTexts();
  expect(lines).toEqual([
    'you: Hello there, what do you sell?',
    'localhost: Burrito Barn: Our Volcano Burrito is a fan favourite. Can I interest you in extra hot sauce?',
    '127.0.0.1: Bolt Depot: What are your operating temperature and pressure requirements?',
    'localhost: Burrito Barn: Are you asking about our hot sauce? You mentioned "Bolt Depot: What are".',
    '127.0.0.1: Bolt Depot: I recommend a high-temperature food-grade silicone gasket.',
  ]);
  // Each bot actually received the other's words.
  await expect(bolts.locator('#log')).toContainText('You: Burrito Barn: Our Volcano Burrito');
});
