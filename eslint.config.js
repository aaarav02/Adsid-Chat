import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    files: ["**/*.rules"],
    languageOptions: {
      parser: firebaseRulesPlugin.preprocessors['.rules'],
    }
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
