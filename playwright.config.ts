import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

// 事前に `supabase start` と `bun run env:local` が必要（seed のお題を使う）
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 844, height: 390 }, // 横向きのスマホ
    // Chrome 156 以降は DeviceOrientationEvent.requestPermission があり、許可がないと tap になる
    permissions: ['accelerometer', 'gyroscope'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `bun run dev --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
