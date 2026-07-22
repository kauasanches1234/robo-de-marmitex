// Liga o Playwright já instalado no ambiente (global) dentro do node_modules
// local. Fazemos symlink em vez de `npm i playwright-core` de propósito: o
// Chromium vem pré-instalado (/opt/pw-browsers/chromium-1194) e casa com a
// versão global — baixar outra versão quebraria o protocolo. Idempotente.
import { existsSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const nm = join(root, 'node_modules');
if (!existsSync(nm)) mkdirSync(nm);

let globalRoot;
try { globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim(); }
catch { console.error('npm root -g falhou'); process.exit(1); }

const link = (nome, alvo) => {
  const dest = join(nm, nome);
  if (!existsSync(alvo)) { console.warn(`aviso: ${alvo} não existe — pulei ${nome}`); return; }
  try { rmSync(dest, { recursive: true, force: true }); } catch {}
  symlinkSync(alvo, dest);
  console.log(`ligado ${nome} → ${alvo}`);
};

link('playwright', join(globalRoot, 'playwright'));
link('playwright-core', join(globalRoot, 'playwright', 'node_modules', 'playwright-core'));
console.log('setup ok — Playwright ligado.');
