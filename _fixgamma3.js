const fs = require('fs');
let text = fs.readFileSync('assets/lc-matching.js', 'utf8');

// Fix: Î" (U+00CE U+201C) -> Γ (U+0393)
// This is a double-encoded Gamma symbol
text = text.replace(/Î"/g, 'Γ');

fs.writeFileSync('assets/lc-matching.js', Buffer.from(text, 'utf8'));

// Verify
const verify = fs.readFileSync('assets/lc-matching.js', 'utf8');
console.log('Line 402:', verify.split('\n')[401]);
console.log('Gamma fixed:', !verify.includes('Î"'));
