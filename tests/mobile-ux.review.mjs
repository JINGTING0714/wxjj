// Optional local browser regression: requires Playwright and a running PRISM preview.
// Uses a fresh isolated browser vault; never opens the user's stored vault.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  process.env.PRISM_PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PRISM_PLAYWRIGHT_MODULE).href
    : 'playwright'
);
const phase = process.argv[2] || 'review';
fs.mkdirSync('work', { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PRISM_BROWSER_PATH
      ? { executablePath: process.env.PRISM_BROWSER_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(process.env.PRISM_REVIEW_URL || 'http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    async function nav(group, item) {
      await page
        .locator('.mobile-primary-nav')
        .getByRole('button', { name: group, exact: true })
        .click();
      await page
        .locator('.mobile-module-list')
        .getByRole('button', { name: new RegExp(item) })
        .click();
      await page.locator('.mobile-module-list').waitFor({ state: 'hidden' });
    }
    await nav('更多', '安全与备份');
    const pw = page.locator(
      '.security-mobile-workspace input[type=password]:visible',
    );
    await pw.nth(0).fill('review-local-123');
    await pw.nth(1).fill('review-local-123');
    await page.getByRole('button', { name: '创建并解锁' }).click();
    await page.getByRole('button', { name: '立即锁定' }).waitFor();
    console.log('review vault ready');
    await nav('工坊', '拼图工坊');
    await page
      .locator('.collage-drop input')
      .setInputFiles(['public/og.png', 'public/og.png']);
    await page
      .locator('.collage-page .real-preview-cell img')
      .first()
      .waitFor({ state: 'attached' });
    const report = { phase, collage: [], watermark: [], errors };
    const collageUndo = page
      .locator('.collage-mobile-workspace')
      .getByRole('button', { name: '撤销上一步拼图操作', exact: true });
    await page
      .locator('.collage-mobile-workspace')
      .getByRole('tab', { name: '操作', exact: true })
      .click();
    await collageUndo.click();
    await page
      .locator('.collage-page .real-preview-cell img')
      .first()
      .waitFor({ state: 'detached' });
    await page
      .locator('.collage-mobile-workspace')
      .getByRole('button', { name: '重做上一步拼图操作', exact: true })
      .click();
    await page
      .locator('.collage-page .real-preview-cell img')
      .first()
      .waitFor({ state: 'attached' });
    report.collageHistory = true;
    async function measure(rootSelector, previewSelector, panelSelector) {
      return page
        .locator(rootSelector)
        .first()
        .evaluate(
          (root, { previewSelector, panelSelector }) => {
            const box = (e) => {
              const r = e.getBoundingClientRect();
              return {
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                bottom: r.bottom,
              };
            };
            const preview = root.querySelector(previewSelector),
              tabs = root.querySelector('[role=tablist]');
            const action = root.querySelector(
              '.mobile-workspace-primary-action',
            );
            const panels = [...root.querySelectorAll(panelSelector)].filter(
              (e) => {
                const style = getComputedStyle(e);
                return (
                  style.display !== 'none' && style.visibility !== 'hidden'
                );
              },
            );
            return {
              width: innerWidth,
              height: innerHeight,
              pageHeight: document.documentElement.scrollHeight,
              pageWidth: document.documentElement.scrollWidth,
              rootDisplay: getComputedStyle(root).display,
              rootScrollTop: root.scrollTop,
              root: box(root),
              preview: box(preview),
              tabs: box(tabs),
              panels: panels.map((e) => ({ class: e.className, box: box(e) })),
              layoutDebug: {
                tabsPosition: getComputedStyle(tabs).position,
                tabsBottom: getComputedStyle(tabs).bottom,
                tabsTop: getComputedStyle(tabs).top,
                tabsTransform: getComputedStyle(tabs).transform,
                rootPadding: getComputedStyle(root).padding,
                rootBoxSizing: getComputedStyle(root).boxSizing,
                rootClientHeight: root.clientHeight,
                rootOffsetHeight: root.offsetHeight,
                tabsOffsetParent: tabs.offsetParent?.className || '',
                tabsOffsetBox: tabs.offsetParent
                  ? box(tabs.offsetParent)
                  : null,
                panelPositions: panels.map((e) => ({
                  position: getComputedStyle(e).position,
                  offsetParent: e.offsetParent?.className || '',
                  offsetBox: e.offsetParent ? box(e.offsetParent) : null,
                })),
              },
              action: box(action),
              actionDisabled: action
                .querySelector('button')
                ?.matches(':disabled'),
              scrollContainers: [...root.querySelectorAll('*')]
                .filter(
                  (e) =>
                    e.clientHeight > 0 &&
                    e.scrollHeight > e.clientHeight + 2 &&
                    getComputedStyle(e).visibility !== 'hidden' &&
                    /(auto|scroll)/.test(getComputedStyle(e).overflowY),
                )
                .map((e) => ({
                  class: e.className,
                  overflow: getComputedStyle(e).overflowY,
                  height: e.clientHeight,
                  scrollHeight: e.scrollHeight,
                })),
              touch: getComputedStyle(preview).touchAction,
            };
          },
          { previewSelector, panelSelector },
        );
    }
    for (const width of [360, 375, 390, 414, 430, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of ['图片', '布局', '编号', '操作', '输出']) {
        await page
          .locator('.collage-page')
          .getByRole('tab', { name: tab, exact: true })
          .click();
        await page.waitForTimeout(240);
        await page.evaluate(() => window.scrollTo(0, 0));
        report.collage.push({
          tab,
          ...(await measure(
            '.collage-mobile-workspace',
            '.board-preview',
            '.collage-mobile-panel, .preview-edit-tools',
          )),
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator('.collage-page')
      .getByRole('tab', { name: '编号', exact: true })
      .click();
    await page.screenshot({
      path: `work/${phase}-collage.png`,
      fullPage: true,
    });
    console.log('collage measured');
    await page
      .locator('.collage-page')
      .getByRole('tab', { name: '编号', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          ".collage-mobile-workspace [data-mobile-active='true']",
        ),
    );
    assert.equal(
      await page
        .locator('.collage-mobile-workspace')
        .locator(
          ".collage-mobile-panel[data-mobile-active='true'], .preview-edit-tools[data-mobile-active='true']",
        )
        .count(),
      0,
      'tapping the active collage tool closes its drawer',
    );
    report.collageSheets = [];
    for (const [tab, title] of [
      ['图片', '管理原图'],
      ['布局', '精确布局设置'],
      ['编号', '编号样式与输出格式'],
      ['操作', '调整图片顺序'],
    ]) {
      await page
        .locator('.collage-page')
        .getByRole('tab', { name: tab, exact: true })
        .click();
      await page
        .locator('.collage-page')
        .getByRole('button', { name: title + ' →', exact: true })
        .click();
      const sheet = page.locator('.mobile-workspace-sheet:visible');
      await sheet.waitFor();
      await page.waitForTimeout(550);
      const bounds = await sheet.evaluate((e) => ({
        bottom: e.getBoundingClientRect().bottom,
        close: e
          .querySelector('[data-slot=drawer-footer] button')
          .getBoundingClientRect().bottom,
      }));
      console.log('sheet', title, bounds);
      await page.screenshot({ path: `work/detail-${title}.png` });
      assert.ok(
        bounds.bottom <= 845 && bounds.close <= 845,
        `${title} close within viewport`,
      );
      report.collageSheets.push({ title, ...bounds });
      await sheet.getByRole('button', { name: '完成', exact: true }).click();
      await sheet.waitFor({ state: 'hidden' });
    }
    await page
      .locator('.collage-page')
      .getByRole('tab', { name: '图片', exact: true })
      .click();
    await page
      .locator('.collage-drop input')
      .setInputFiles(Array(40).fill('public/og.png'));
    await page
      .locator('.collage-drop strong')
      .filter({ hasText: '42' })
      .waitFor();
    await page
      .locator('.collage-page')
      .getByRole('tab', { name: '输出', exact: true })
      .click();
    await page
      .locator(
        '.collage-mobile-workspace .mobile-workspace-primary-action button',
      )
      .click();
    const pause = page
      .locator('.collage-mobile-workspace')
      .getByRole('button', { name: '暂停并保留进度', exact: true });
    await pause.waitFor();
    assert.ok(
      await pause.isEnabled(),
      'pause must not inherit fieldset disabled',
    );
    await pause.click();
    await pause.waitFor({ state: 'hidden' });
    report.pauseClickable = true;
    fs.writeFileSync(
      path.resolve(`work/${phase}-review.json`),
      JSON.stringify(report, null, 2),
    );
    await nav('工坊', '水印工坊');
    const root = page.locator('.watermark-mobile-workspace').first();
    await root
      .locator('.watermark-source-panel input[type=file]')
      .setInputFiles('public/og.png');
    await root.getByRole('tab', { name: '图层', exact: true }).click();
    await root
      .locator('.watermark-layers-mobile-panel input[type=file]')
      .setInputFiles('public/og.png');
    await root
      .locator('.transform-layer-list article')
      .nth(1)
      .waitFor({ state: 'attached' });
    await root.getByRole('tab', { name: '操作', exact: true }).click();
    await root
      .getByRole('button', { name: '撤销上一步水印操作', exact: true })
      .click();
    await root.locator('.transform-layer-list article').nth(1).waitFor({
      state: 'detached',
    });
    await root
      .getByRole('button', { name: '重做上一步水印操作', exact: true })
      .click();
    await root
      .locator('.transform-layer-list article')
      .nth(1)
      .waitFor({ state: 'attached' });
    report.watermarkHistory = true;
    await root.getByRole('tab', { name: '文字', exact: true }).click();
    const textPanel = root.locator(
      '.watermark-text-mobile-panel[data-mobile-active=true]',
    );
    await textPanel.getByLabel('文字内容').fill('PRISM 商用字体 Text');
    await textPanel
      .getByRole('combobox', { name: '字体', exact: true })
      .selectOption('Noto Serif SC');
    await textPanel.getByRole('button', { name: '文字加粗' }).click();
    await textPanel.getByRole('button', { name: '文字斜体' }).click();
    await textPanel.getByRole('button', { name: '文字下划线' }).click();
    await textPanel.getByLabel('文字颜色').fill('#b8ff3d');
    await textPanel
      .getByRole('button', { name: '添加文字图层', exact: true })
      .click();
    await root
      .locator('.transform-layer-list article')
      .filter({ hasText: 'PRISM 商用字体 Text' })
      .waitFor({ state: 'attached' });
    report.textLayer = true;
    for (const width of [360, 375, 390, 414, 430, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of ['原图', '图层', '文字', '操作', '调整', '输出']) {
        await root.getByRole('tab', { name: tab, exact: true }).click();
        await page.waitForTimeout(240);
        await page.evaluate(() => window.scrollTo(0, 0));
        report.watermark.push({
          tab,
          ...(await measure(
            '.watermark-mobile-workspace',
            '.dom-watermark-stage',
            '.mobile-workspace-panel, .mobile-preview-interaction',
          )),
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await root.getByRole('tab', { name: '原图', exact: true }).click();
    await page.waitForTimeout(240);
    report.surfaceRatio = await root
      .locator('.watermark-surface')
      .evaluate((e) => ({
        actual: e.clientWidth / e.clientHeight,
        expected: Number(e.style.getPropertyValue('--watermark-ratio')),
      }));
    await page.screenshot({
      path: `work/${phase}-watermark.png`,
      fullPage: true,
    });
    await root.getByRole('tab', { name: '操作', exact: true }).click();
    await root.getByRole('button', { name: '全屏预览', exact: true }).click();
    report.fullscreen = await root
      .locator('.is-mobile-fullscreen')
      .evaluate((e) => ({
        rect: e.getBoundingClientRect().toJSON(),
        stage: e
          .querySelector('.dom-watermark-stage')
          .getBoundingClientRect()
          .toJSON(),
        overflow: getComputedStyle(document.body).overflow,
      }));
    await page.screenshot({ path: `work/${phase}-fullscreen.png` });
    await root.getByRole('button', { name: '退出全屏预览' }).click();
    await root.getByRole('tab', { name: '调整', exact: true }).click();
    fs.writeFileSync(
      path.resolve(`work/${phase}-review.json`),
      JSON.stringify(report, null, 2),
    );
    await root.locator('.mobile-advanced-trigger').click();
    await page.waitForTimeout(500);
    report.advanced = await page
      .locator('.mobile-workspace-sheet:visible')
      .evaluate((e) => ({
        rect: e.getBoundingClientRect().toJSON(),
        body: e
          .querySelector('.mobile-workspace-sheet-body')
          .getBoundingClientRect()
          .toJSON(),
        footer: e
          .querySelector('[data-slot=drawer-footer]')
          .getBoundingClientRect()
          .toJSON(),
        overflow: getComputedStyle(document.body).overflow,
        rangeTouch: [...e.querySelectorAll('input[type=range]')].map(
          (x) => getComputedStyle(x).touchAction,
        ),
      }));
    await page.getByRole('button', { name: '完成', exact: true }).click();
    await page.locator('.mobile-workspace-sheet').waitFor({ state: 'hidden' });
    report.closedOverflow = await page.evaluate(
      () => getComputedStyle(document.body).overflow,
    );
    await root.getByRole('tab', { name: '操作', exact: true }).click();
    await root
      .getByRole('button', { name: '移动 / 缩放', exact: true })
      .click();
    assert.equal(
      await root
        .locator('.dom-watermark-stage')
        .evaluate((element) => getComputedStyle(element).touchAction),
      'none',
      'explicit move mode captures canvas touch',
    );
    await root.getByRole('button', { name: '完成移动', exact: true }).click();
    await root.getByRole('tab', { name: '操作', exact: true }).click();
    await root.locator('.dom-watermark-stage').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -80));
    const touch = await context.newCDPSession(page);
    const stageBox = await root.locator('.dom-watermark-stage').boundingBox();
    const scrollBefore = await page.evaluate(() => scrollY);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {
          x: stageBox.x + stageBox.width / 2,
          y: stageBox.y + stageBox.height * 0.8,
        },
      ],
    });
    for (let i = 1; i <= 6; i++)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: stageBox.x + stageBox.width / 2,
            y: stageBox.y + stageBox.height * 0.8 - i * 15,
          },
        ],
      });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await page.waitForTimeout(300);
    report.touchScroll = {
      before: scrollBefore,
      after: await page.evaluate(() => scrollY),
    };
    assert.equal(
      await root
        .locator('.dom-watermark-stage')
        .evaluate((e) => getComputedStyle(e).touchAction),
      'pan-y',
      'leaving direct-edit mode restores vertical page gestures',
    );
    await root.getByRole('tab', { name: '调整', exact: true }).click();
    const slider = root
      .locator('.transform-grid input[type=range]:visible')
      .first();
    await slider.scrollIntoViewIfNeeded();
    const sliderBox = await slider.boundingBox();
    assert.ok(
      await slider.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width * 0.7, r.y + r.height / 2) ===
          e
        );
      }),
      'slider touch point not covered',
    );
    const valueBefore = await slider.inputValue();
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        {
          x: sliderBox.x + sliderBox.width * 0.7,
          y: sliderBox.y + sliderBox.height / 2,
        },
      ],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    report.touchSlider = {
      before: valueBefore,
      after: await slider.inputValue(),
    };
    assert.notEqual(
      report.touchSlider.after,
      valueBefore,
      'touch changes slider',
    );
    await root.getByRole('tab', { name: '操作', exact: true }).click();
    await root.getByRole('button', { name: '全屏预览', exact: true }).click();
    await page.keyboard.press('Escape');
    await root.locator('.is-mobile-fullscreen').waitFor({ state: 'hidden' });
    assert.notEqual(
      await page.evaluate(() => getComputedStyle(document.body).overflow),
      'hidden',
    );
    await root.getByRole('button', { name: '全屏预览', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await root.locator('.is-mobile-fullscreen').waitFor({ state: 'hidden' });
    assert.notEqual(
      await page.evaluate(() => getComputedStyle(document.body).overflow),
      'hidden',
    );
    report.desktop = await page.evaluate(() => ({
      collage: getComputedStyle(document.querySelector('.collage-layout'))
        .gridTemplateColumns,
      watermark: getComputedStyle(
        document.querySelector('.watermark-free-editor'),
      ).gridTemplateColumns,
      nav: getComputedStyle(document.querySelector('.mobile-primary-nav'))
        .display,
      tabs: getComputedStyle(document.querySelector('.mobile-workspace-tabs'))
        .display,
    }));
    await page
      .locator('.sidebar')
      .getByRole('button', { name: '拼图工坊', exact: true })
      .click();
    report.desktop.collageVisible = await page
      .locator('.collage-layout')
      .evaluate((e) => ({
        width: e.clientWidth,
        columns: getComputedStyle(e).gridTemplateColumns,
      }));
    await page.screenshot({ path: `work/${phase}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('资产', '提示词库');
    const emptyState = page
      .locator('.studio-page .record-list > .empty-state:visible')
      .filter({ hasText: '没有找到匹配资产' });
    await emptyState.waitFor();
    report.emptyState = await emptyState.evaluate((element) => {
      const host = element.getBoundingClientRect();
      const visibleChildren = [...element.children]
        .map((child) => child.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const content = {
        left: Math.min(...visibleChildren.map((rect) => rect.left)),
        right: Math.max(...visibleChildren.map((rect) => rect.right)),
        top: Math.min(...visibleChildren.map((rect) => rect.top)),
        bottom: Math.max(...visibleChildren.map((rect) => rect.bottom)),
      };
      return {
        horizontalDelta:
          (content.left + content.right) / 2 - (host.left + host.right) / 2,
        verticalDelta:
          (content.top + content.bottom) / 2 - (host.top + host.bottom) / 2,
        host: host.toJSON(),
        content,
      };
    });
    assert.ok(
      Math.abs(report.emptyState.horizontalDelta) < 3,
      'mobile empty state is horizontally centered',
    );
    assert.ok(
      Math.abs(report.emptyState.verticalDelta) < 3,
      'mobile empty state is vertically centered in the result area',
    );
    fs.writeFileSync(
      path.resolve(`work/${phase}-review.json`),
      JSON.stringify(report, null, 2),
    );
    for (const result of [...report.collage, ...report.watermark]) {
      assert.equal(
        result.pageWidth,
        result.width,
        'no horizontal page overflow',
      );
      assert.equal(
        result.rootScrollTop,
        0,
        'workspace shell must never become a hidden nested scroller',
      );
      assert.equal(result.panels.length, 1, 'only one active panel');
      assert.ok(
        result.preview.height > 100 &&
          result.preview.height < result.height * 0.86,
        'preview-first workspace stays visible within the viewport',
      );
      assert.ok(
        result.panels[0].box.bottom <= result.tabs.y + 1 &&
          result.panels[0].box.y < result.tabs.y,
        'the active tool opens as a drawer directly above the tool rail',
      );
      assert.ok(
        result.tabs.bottom <= result.height - 67,
        'workshop tool rail stays above the fixed app navigation',
      );
      assert.ok(
        result.scrollContainers.length <= 1 &&
          result.scrollContainers.every((item) =>
            /mobile-panel|mobile-workspace-panel/.test(item.class),
          ),
        'only the expanded lower tool tray may scroll',
      );
    }
    for (const result of report.collage)
      assert.equal(
        result.touch,
        'pan-y',
        'collage scroll mode keeps page scroll',
      );
    for (const result of report.watermark)
      assert.equal(
        result.touch,
        'pan-y',
        'watermark keeps normal page scroll until explicit move mode',
      );
    assert.ok(
      Math.abs(report.surfaceRatio.actual / report.surfaceRatio.expected - 1) <
        0.02,
      'surface aspect preserved',
    );
    assert.equal(report.desktop.nav, 'none');
    assert.equal(report.desktop.tabs, 'none');
    assert.equal(errors.length, 0);
    console.log(
      'PASS: 66 mobile/tablet drawer layouts; text layer; contain ratio; fullscreen exit/resize; dialog viewport; desktop navigation; no runtime errors.',
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
