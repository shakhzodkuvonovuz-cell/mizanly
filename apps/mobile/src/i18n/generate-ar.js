const fs = require('fs');
const path = require('path');
const { translateObject } = require('./translate.js');

const enPath = path.join(__dirname, 'en.json');
const arPath = path.join(__dirname, 'ar.json');

console.log('Reading English translations from', enPath);
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));

console.log('Translating to Arabic...');
const arData = translateObject(enData);

console.log('Writing Arabic translations to', arPath);
fs.writeFileSync(arPath, JSON.stringify(arData, null, 2), 'utf8');

console.log('Done. Total keys processed:', countKeys(enData));

function countKeys(obj) {
  let count = 0;
  function traverse(o) {
    for (const key in o) {
      count++;
      if (typeof o[key] === 'object' && o[key] !== null) {
        traverse(o[key]);
      }
    }
  }
  traverse(obj);
  return count;
}