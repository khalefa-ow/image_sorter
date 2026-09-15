const fs = require('node:fs');
const embed = path => fs.readFileSync(path,'utf8').replace(/<\/script/gi,'<\\/script');
const html = fs.readFileSync('index.html','utf8')
  .replace('<link rel="stylesheet" href="style.css">',()=>`<style>${fs.readFileSync('style.css','utf8')}</style>`)
  .replace('<script src="layout.js"></script>',()=>`<script>${embed('layout.js')}</script>`)
  .replace('<script src="app.js"></script>',()=>`<script>${embed('app.js')}</script>`);
fs.writeFileSync('Image Layout Studio.html',html);
console.log('Built standalone Image Layout Studio.html');
