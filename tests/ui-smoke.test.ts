import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import Page from '../app/page';
import { VaultProvider } from '../components/prism/vault-provider';
import { AccountingPanel } from '../components/prism/accounting-panel';
import { CalculatorPanel } from '../components/prism/calculator-panel';
import { PngCleanerPanel } from '../components/prism/png-cleaner-panel';
void test('application startup renders all new module navigation without browser globals', () => {
  const html = renderToString(
    React.createElement(VaultProvider, null, React.createElement(Page)),
  );
  for (const text of [
    'PNG 隐私清洗',
    '记账本',
    '售图核对',
    'Profile 库',
    '拼图工坊',
  ])
    assert.ok(html.includes(text));
});
void test('new panels render initial states safely while local workspace hydration is pending', () => {
  for (const panel of [
    React.createElement(AccountingPanel),
    React.createElement(CalculatorPanel),
    React.createElement(PngCleanerPanel, { onOpen: () => {} }),
  ]) {
    const html = renderToString(React.createElement(VaultProvider, null, panel));
    assert.ok(html.length > 500);
  }
});
