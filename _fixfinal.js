const fs = require('fs');
let text = fs.readFileSync('assets/lc-matching.js', 'utf8');

// The pattern is: U+00CE U+201C (Î") which should be U+0393 (Γ)
// Replace in text
text = text.replace(/\u00ce\u201c/g, '\u0393');

fs.writeFileSync('assets/lc-matching.js', Buffer.from(text, 'utf8'));

// Verify
const verify = fs.readFileSync('assets/lc-matching.js', 'utf8');
console.log('Line 402:', verify.split('\n')[401]);
console.log('Gamma fixed:', !verify.includes('\u00ce\u201c'));
