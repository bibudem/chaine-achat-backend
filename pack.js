const { execSync } = require('child_process');
const fs = require('fs');

const EXCLUDE = ['.git', '.env', 'function.zip', 'pack.js'];
const OUT = 'function.zip';

if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

console.log('Installation des dépendances de production...');
execSync('npm install --omit=dev', { stdio: 'inherit' });

console.log('Création du ZIP...');
if (process.platform === 'win32') {
  const items = fs.readdirSync('.').filter(f => !EXCLUDE.includes(f));
  const paths = items.map(f => `'${f}'`).join(',');
  execSync(
    `powershell -Command "Compress-Archive -Path @(${paths}) -DestinationPath ${OUT} -Force"`,
    { stdio: 'inherit' }
  );
} else {
  const excludeFlags = EXCLUDE.map(f => `--exclude '${f}'`).join(' ');
  execSync(`zip -r ${OUT} . ${excludeFlags}`, { stdio: 'inherit' });
}

console.log('Restauration des dépendances de développement...');
execSync('npm install', { stdio: 'inherit' });

console.log(`\n${OUT} prêt pour Lambda (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} Mo)`);
