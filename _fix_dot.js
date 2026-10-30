const fs = require('fs');
let buf = fs.readFileSync('assets/lc-matching.js');
let text = buf.toString('utf8');

// Fix double-encoded middle dot (Â· -> ·)
text = text.replace(/Â·/g, '\u00b7'); // middle dot

// Also check for other common double-encoding issues
text = text.replace(/Âµ/g, '\u00b5'); // micro sign µ
text = text.replace(/Â±/g, '\u00b1'); // plus-minus ±
text = text.replace(/Â²/g, '\u00b2'); // superscript 2 ²
text = text.replace(/Â³/g, '\u00b3'); // superscript 3 ³

const newBuf = Buffer.from(text, 'utf8');
fs.writeFileSync('assets/lc-matching.js', newBuf);

// Verify
const verify = fs.readFileSync('assets/lc-matching.js', 'utf8');
console.log('Remaining Â·:', (verify.match(/Â·/g) || []).length);
console.log('Line 340:', JSON.stringify(verify.split('\n')[339]));
