import { expect, type Page, test } from '@playwright/test';

const COUNTDOWN_MS = 3_000;
const SENSOR_TIMEOUT_MS = 1_000;
const FEEDBACK_MS = 500;

const topicText = (page: Page) => page.getByTestId('topic');

/**
 * 時計を小刻みに進める。React の描画は MessageChannel で行われ page.clock では進まないため、
 * 1 ステップごとにイベントループを一周させて「描画 → 次のタイマー登録」を追いつかせる
 */
async function advance(page: Page, ms: number, step = 100) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    await page.clock.runFor(step);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => resolve();
          channel.port2.postMessage(null);
        }),
    );
  }
}

async function startRound(page: Page, category = '動物') {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: category }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.getByTestId('countdown')).toBeVisible();
}

const tilt = (page: Page, beta: number) =>
  page.evaluate(
    (b) =>
      window.dispatchEvent(
        new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: 0 }),
      ),
    beta,
  );

test('タップ操作で1ラウンド遊べる（センサーが無いと tap に切り替わる）', async ({ page }) => {
  await startRound(page);
  await advance(page, COUNTDOWN_MS);
  await advance(page, SENSOR_TIMEOUT_MS);

  const first = await topicText(page).textContent();
  await page.getByRole('button', { name: '正解 →' }).click();
  await expect(topicText(page)).toHaveText('正解！');
  await advance(page, FEEDBACK_MS);

  const second = await topicText(page).textContent();
  expect(second).not.toBe(first);
  await page.getByRole('button', { name: '← パス' }).click();
  await expect(topicText(page)).toHaveText('パス');
  await advance(page, FEEDBACK_MS);

  await advance(page, 60_000);
  await expect(page.getByText('問正解')).toBeVisible();
  const items = page.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(`${first}正解`);
  await expect(items.nth(1)).toContainText(`${second}パス`);
});

test('傾きで正解・パスを判定し、ニュートラルに戻るまで次を判定しない', async ({ page }) => {
  await startRound(page);
  // 実機と同じく、構え（ニュートラル）の値を送り続ける
  await page.evaluate(() => {
    const id = setInterval(
      () =>
        window.dispatchEvent(
          new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 }),
        ),
      100,
    );
    Object.assign(window, { stopNeutral: () => clearInterval(id) });
  });
  await advance(page, COUNTDOWN_MS + SENSOR_TIMEOUT_MS);
  await page.evaluate(() => (window as unknown as { stopNeutral: () => void }).stopNeutral());

  await tilt(page, 150); // 前に倒す
  await expect(topicText(page)).toHaveText('正解！');
  await advance(page, FEEDBACK_MS);
  const afterCorrect = await topicText(page).textContent();

  await tilt(page, 150); // 倒したまま → 判定しない
  await expect(topicText(page)).toHaveText(afterCorrect ?? '');

  await tilt(page, 90);
  await tilt(page, 30); // 後ろに倒す
  await expect(topicText(page)).toHaveText('パス');
});

test('傾き操作のときもタップで正解・パスできる（FR-06）', async ({ page }) => {
  await startRound(page);
  await page.evaluate(() => {
    const id = setInterval(
      () =>
        window.dispatchEvent(
          new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 90, gamma: 0 }),
        ),
      100,
    );
    Object.assign(window, { stopNeutral: () => clearInterval(id) });
  });
  await advance(page, COUNTDOWN_MS + SENSOR_TIMEOUT_MS);

  await page.getByRole('button', { name: '正解 →' }).click();
  await expect(topicText(page)).toHaveText('正解！');
  await advance(page, FEEDBACK_MS);
  await page.getByRole('button', { name: '← パス' }).click();
  await expect(topicText(page)).toHaveText('パス');

  // 傾きも引き続き効く
  await advance(page, FEEDBACK_MS);
  await page.evaluate(() => (window as unknown as { stopNeutral: () => void }).stopNeutral());
  await tilt(page, 90);
  await tilt(page, 150);
  await expect(topicText(page)).toHaveText('正解！');
});

test('お題を出し切ると時間が残っていても結果画面になる（FR-08）', async ({ page }) => {
  await startRound(page);
  await advance(page, COUNTDOWN_MS + SENSOR_TIMEOUT_MS);
  for (let i = 0; i < 8; i++) {
    await page.getByRole('button', { name: '正解 →' }).click();
    await advance(page, FEEDBACK_MS);
  }
  await expect(page.getByText('8問正解')).toBeVisible();
});

test.describe('センサーの利用が許可されていない', () => {
  test.use({ permissions: [] });

  test('センサーを待たずに最初から tap になる（FR-06）', async ({ page }) => {
    await startRound(page);
    await advance(page, COUNTDOWN_MS);
    await expect(page.getByRole('button', { name: '正解 →' })).toBeVisible();
  });
});

test('縦長の画面では90度回転して横向きで表示する（NFR-04）', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startRound(page);
  await advance(page, COUNTDOWN_MS + SENSOR_TIMEOUT_MS);

  await expect(topicText(page)).toBeVisible();
  // 回転後の舞台が画面全体を覆い、横長（幅 > 高さ）として描かれている
  const stage = page.locator('main');
  expect(await stage.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
  const box = await stage.boundingBox();
  expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  const inner = await stage.evaluate((el: HTMLElement) => ({
    w: el.offsetWidth,
    h: el.offsetHeight,
  }));
  expect(inner.w).toBeGreaterThan(inner.h);

  // タップ操作は回転後の左右（＝画面の上下）で効く
  await page.getByRole('button', { name: '正解 →' }).click();
  await expect(topicText(page)).toHaveText('正解！');
});

test('指定した問題数を出し切ると結果画面になる', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.getByRole('button', { name: '動物' }).click();
  await page.getByLabel('何問にする？').fill('2');
  await page.getByRole('button', { name: 'スタート' }).click();
  await advance(page, COUNTDOWN_MS + SENSOR_TIMEOUT_MS);

  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '正解 →' }).click();
    await advance(page, FEEDBACK_MS);
  }
  await expect(page.getByText('2問正解')).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(2);
});

test('カテゴリを読み込めないときは再試行できる（FR-11）', async ({ page }) => {
  await page.route('**/rest/v1/categories*', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('読み込めませんでした', { timeout: 10_000 });

  // supabase-js は GET の通信エラーを 1s/2s/4s 間隔で 3 回リトライしてからエラーにする
  await page.unroute('**/rest/v1/categories*');
  await page.getByRole('button', { name: '再試行' }).click();
  await expect(page.getByRole('button', { name: '動物' })).toBeVisible();
});
