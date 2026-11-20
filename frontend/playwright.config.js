import { defineConfig } from '@playwright/test'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const port = 8765
const python = join(root, '.venv', 'Scripts', 'python.exe')

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.MORADIA_BROWSER_CHANNEL || undefined,
  },
  webServer: {
    command: `"${python}" -m backend.tests.browser_server ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
  },
})
