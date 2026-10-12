import { defineConfig } from 'vitest/config';
export default defineConfig({esbuild:{jsx:'automatic'},resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},test:{include:['tests/backend/**/*.test.{ts,tsx}'],environment:'node'}});
