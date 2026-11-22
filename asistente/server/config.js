
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

module.exports = {
  ROOT,
  DATA: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data'),
  PUBLIC: path.join(ROOT, 'public'),

  /* Carpeta de tu web */
  SITE_DIR: path.resolve(process.env.SITE_DIR || path.join(ROOT, '..')),

  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || '0.0.0.0',

  /* Ollama: IA local de respaldo */
  OLLAMA_URL: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen3:4b-instruct',
  OLLAMA_TIMEOUT: Number(process.env.OLLAMA_TIMEOUT) || 300000,

  /* Gemini: IA online principal */
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  GEMINI_BASE_URL: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  GEMINI_TIMEOUT: Number(process.env.GEMINI_TIMEOUT) || 45000,
  GEMINI_RETRIES: process.env.GEMINI_RETRIES === undefined ? 2 : Math.max(0, Number(process.env.GEMINI_RETRIES) || 0),

  /* Seguridad y límites */
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  MAX_MESSAGE: 500,
  RATE_CHAT_PER_MIN: Number(process.env.RATE_CHAT_PER_MIN) || 20,
  MAX_BODY: 20 * 1024,

  /* Los datos que cambian a menudo se guardan por lotes cada tantos milisegundos */
  SAVE_DELAY: Number(process.env.SAVE_DELAY) || 3000,
};
