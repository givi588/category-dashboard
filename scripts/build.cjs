const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const file of ['index.html', 'style.css', 'data.js', 'script.js']) {
  fs.copyFileSync(path.join(root, file), path.join(root, 'dist', file));
}
fs.writeFileSync(path.join(root, 'dist', '.nojekyll'), '');
