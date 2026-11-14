const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function str(value, name, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${name}不能为空，且不能超过 ${max} 字符`);
  return value.trim();
}
function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function store(file, initial) {
  if (!fs.existsSync(file)) atomicWrite(file, initial);
  return { read: () => JSON.parse(fs.readFileSync(file, 'utf8')), write: value => atomicWrite(file, value) };
}
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
module.exports = { fail, str, atomicWrite, store, hash };
