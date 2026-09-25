import { WASI } from 'node:wasi';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
const wasi = new WASI({
  version: 'preview1',
  args: ['basisu', ...args],
  preopens: { '.': resolve('.') },
  returnOnExit: true,
});
const binary = await readFile('.cache/nacar-assets/basisu.wasm');
const module = await WebAssembly.compile(binary);
const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
process.exitCode = wasi.start(instance);
