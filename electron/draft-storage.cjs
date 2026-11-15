const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createDraftStorage(directory) {
  const filename = (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(id)) {
      throw new Error('Invalid resume ID');
    }
    return path.join(directory, `${id}.json`);
  };
  const read = (id) => {
    try {
      const record = JSON.parse(fs.readFileSync(filename(id), 'utf8'));
      if (record.id !== id || typeof record.token !== 'string' || !record.data) {
        throw new Error('The local draft is invalid');
      }
      return record;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const write = (record) => {
    let temporary;
    try {
      const destination = filename(record?.id);
      if (
        typeof record.token !== 'string' || record.token.length > 128 || !record.token ||
        !record.data || typeof record.data !== 'object' ||
        !Number.isFinite(Date.parse(record.baseUpdatedAt)) || !Number.isFinite(Date.parse(record.updatedAt))
      ) throw new Error('The local draft is invalid');
      const content = JSON.stringify(record);
      if (Buffer.byteLength(content) > 10 * 1024 * 1024) throw new Error('The local draft exceeds 10 MB');
      fs.mkdirSync(directory, { recursive: true });
      temporary = `${destination}.${randomUUID()}.tmp`;
      const descriptor = fs.openSync(temporary, 'wx');
      try {
        fs.writeFileSync(descriptor, content, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, destination);
      return { ok: true };
    } catch (error) {
      if (temporary) { try { fs.unlinkSync(temporary); } catch {} }
      return { ok: false, error: error.message };
    }
  };
  const remove = (id, token) => {
    const current = read(id);
    if (current && current.token === token) fs.unlinkSync(filename(id));
  };
  return { read, write, remove };
}

module.exports = { createDraftStorage };
