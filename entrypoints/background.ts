import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

// The toolbar button opens (or focuses) the control room. Everything else
// lives in that page, so there is no background state to lose.
export default defineBackground(() => {
  browser.action.onClicked.addListener(async () => {
    const url = browser.runtime.getURL('/control.html');
    const [open] = await browser.tabs.query({ url });
    if (open?.id != null) {
      await browser.tabs.update(open.id, { active: true });
      if (open.windowId != null) await browser.windows.update(open.windowId, { focused: true });
    } else {
      await browser.tabs.create({ url });
    }
  });
});
