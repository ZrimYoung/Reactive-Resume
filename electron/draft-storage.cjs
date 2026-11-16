const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createDraftStorage(directory) {
  const filename = (id, sessionId) => {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(id)) {
      throw new Error('Invalid resume ID');
    }
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(sessionId))) {
      throw new Error('Invalid draft session ID');
    }
    return path.join(directory, `${id}${sessionId ? `--${sessionId}` : ''}.json`);
  };
  const list = (id) => {
    filename(id);
    try {
      return fs.readdirSync(directory)
        .filter((name) => name === `${id}.json` || (name.startsWith(`${id}--`) && name.endsWith('.json')))
        .map((name) => {
          const record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
          if (record.id !== id || typeof record.token !== 'string' || !record.data ||
              path.basename(filename(record.id, record.sessionId)) !== name) {
            throw new Error('The local draft is invalid');
          }
          return record;
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const read = (id) => list(id)[0] ?? null;
  const write = (record) => {
    let temporary;
    try {
      const destination = filename(record?.id, record?.sessionId);
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
    for (const record of list(id)) {
      if (record.token === token) fs.unlinkSync(filename(id, record.sessionId));
    }
  };
  return { read, list, write, remove };
}

module.exports = { createDraftStorage };
