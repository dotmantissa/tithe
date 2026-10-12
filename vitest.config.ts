import { defineConfig } from 'vitest/config';
export default defineConfig({resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{include:['tests/backend/**/*.test.ts'],environment:'node'}});
