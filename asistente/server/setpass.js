'use strict';
/* Uso: npm run set-password -- "nueva contraseña" */
const sec = require('./security');
const pw = process.argv[2];
if (!pw || pw.length < 8) { console.error('Escribe una contraseña de al menos 8 caracteres: npm run set-password -- "mi contraseña"'); process.exit(1); }
sec.setPassword(pw);
console.log('Contraseña de administración actualizada.');
