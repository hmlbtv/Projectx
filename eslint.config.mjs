import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
// The aim is to catch real mistakes (hooks, unused code, unsafe links). Style-only and "any"-heavy rules are warnings so they never block a deploy.
export default [
  { ignores: ['.next/**', 'node_modules/**', 'scripts/**', 'public/**', 'tests/**', 'next-env.d.ts', '*.config.mjs'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    '@typescript-eslint/no-unused-expressions': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/ban-ts-comment': 'warn',
    'react/no-unescaped-entities': 'off',
    '@next/next/no-img-element': 'off',
    'react-hooks/exhaustive-deps': 'warn',
    'prefer-const': 'warn',
  } },
];
