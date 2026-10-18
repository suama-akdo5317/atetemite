/// <reference types="vitest/config" />
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  server: {
    // 実機確認用（bun run dev:phone + cloudflared）。トンネル経由ではゲームと同じオリジンで DB を読む
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      // 読み取り API だけを通す（auth・storage などは公開しない）
      '/supabase/rest/v1': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase/, ''),
      },
    },
  },
  test: {
    // 設計書 6.5: ロジックのみ対象。画面とブラウザ API のラッパーは E2E で確認する
    coverage: {
      include: ['src/game/**', 'batch/**', 'shared/schema.ts'],
      exclude: ['**/*.test.ts', 'batch/generate.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['{src,shared,batch}/**/*.test.ts'],
          exclude: ['**/*.int.test.ts'],
        },
      },
      // ローカル Supabase が必要（supabase start → bun run env:local）
      {
        extends: true,
        test: {
          name: 'int',
          include: ['{shared,batch}/**/*.int.test.ts'],
          env: loadEnv(mode, process.cwd(), ''),
        },
      },
    ],
  },
}));
