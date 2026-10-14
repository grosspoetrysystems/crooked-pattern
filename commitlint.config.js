export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'trailer-exists': [2, 'always', 'Signed-off-by:'],
    'header-max-length': [2, 'always', 100],
  },
};
