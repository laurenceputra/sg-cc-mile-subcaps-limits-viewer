import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/index.user.js',
  output: {
    file: 'dist/bank-cc-limits-subcap-calculator.user.js',
    format: 'iife',
    banner: `// ==UserScript==
// @name         Bank CC Limits Subcap Calculator
// @namespace    local
// @version      0.5.0
// @description  Extract credit card transactions and manage subcap categories
// @match        https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
`
  },
  plugins: [
    resolve(),
    copy({
      targets: [
        { src: 'dist/bank-cc-limits-subcap-calculator.user.js', dest: '../../..' }
      ],
      hook: 'writeBundle'
    })
  ]
};
