import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'botleneck',
    description: 'Let the customer-service chatbots in your open tabs talk to each other.',
    action: { default_title: 'Open the botleneck control room' },
    permissions: ['scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
});
