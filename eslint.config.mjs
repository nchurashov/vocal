// Проверка кода: каждый модуль импортирует всё, что использует, и ничего лишнего.
import globals from 'globals';
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-redeclare': 'error',
      'no-import-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
  // слои: ядро и данные не знают про функции, экраны и тренажёр (иначе круговые зависимости и ошибки порядка загрузки)
  {
    files: ['src/core/**/*.js', 'src/data/**/*.js'],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['../features/*', '../screens/*', '../trainer/*'], message: 'Ядро (core) и данные (data) не импортируют функции, экраны и тренажёр. Подключай через main.js или передавай функцией.' }] }] },
  },
];
