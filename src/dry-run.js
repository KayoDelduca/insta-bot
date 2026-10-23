/**
 * dry-run.js — Roda o scheduler em modo simulacao (nao publica nada)
 * Funciona igual no Windows, Mac e Linux.
 *
 * Comando: npm run schedule:dry
 */
process.env.DRY_RUN = 'true';
await import('./scheduler.js');
