import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['apps/web/**/*.{ts,tsx}'],
  },
);
