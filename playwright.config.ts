import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'tests/browser',timeout:60000,use:{baseURL:process.env.TEST_APP_URL||'http://localhost:3000',headless:true,launchOptions:{
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),
  args:['--no-sandbox'],
}},webServer:process.env.TEST_APP_URL?undefined:{command:'npm run dev',url:'http://localhost:3000',reuseExistingServer:true,timeout:120000}});
