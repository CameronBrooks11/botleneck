import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'botleneck',
    description: 'Let the customer-service chatbots in your open tabs talk to each other.',
    action: { default_title: 'Open the botleneck control room' },
    permissions: ['scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'botleneck@cameronbrooks11.github.io',
          // Nothing leaves the browser.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
