export npm_config_update_notifier := "false"

[doc("List recipes")]
default:
    @just --list

[doc("Install dependencies")]
setup:
    npm ci

[doc("Type-check")]
lint:
    npx tsc --noEmit

[doc("CI equivalent: type-check and build")]
check: lint build

[doc("Unit tests")]
test:
    npx vitest run

[doc("Build the Chrome extension into .output/chrome-mv3")]
build:
    npx wxt build

[doc("End-to-end: two fake bots bridged in headless Chromium")]
e2e: build
    npx playwright test

[doc("Dev mode with live reload (opens a browser)")]
dev:
    npx wxt

[doc("Zip for the Chrome Web Store / Firefox add-ons")]
zip:
    npx wxt zip
    npx wxt zip -b firefox
