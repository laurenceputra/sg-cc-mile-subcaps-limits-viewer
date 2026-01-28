import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.user.js',
  output: {
    file: 'dist/bank-cc-limits-subcap-calculator.user.js',
    format: 'iife',
    banner: `// ==UserScript==
// @name         Bank CC Limits Subcap Calculator
// @namespace    local
// @version      0.6.0
// @description  Extract credit card transactions and manage subcap categories with optional sync
// @match        https://pib.uob.com.sg/PIBCust/2FA/processSubmit.do*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      bank-cc-sync.your-domain.workers.dev
// @connect      localhost
// ==/UserScript==
`
  },
  plugins: [
    resolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    copy({
      targets: [
        { src: 'dist/bank-cc-limits-subcap-calculator.user.js', dest: '../../..' }
      ],
      hook: 'writeBundle'
    })
  ]
};
