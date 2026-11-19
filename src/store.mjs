import fs from 'node:fs';
import path from 'node:path';
export function atomicJson(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data,null,2)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp,file);
}
export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
