const { execSync } = require('child_process');
const path = require('path');

const SOURCE_SVG = path.join(process.cwd(), 'public', 'icon.svg');
const TARGET_PNG = path.join(process.cwd(), 'public', 'icon.png');

try {
  console.log('Converting SVG to PNG...');
  execSync(`npx svgexport ${SOURCE_SVG} ${TARGET_PNG} 512:512`);
  console.log('Successfully converted SVG to PNG!');
  console.log('You can now run the generate-pwa-assets.js script to create all icon sizes.');
} catch (error) {
  console.error('Error converting SVG to PNG:', error);
  process.exit(1);
} 