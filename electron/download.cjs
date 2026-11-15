const fs = require('node:fs/promises');

async function getDownloadContent(url, fetcher) {
  if (typeof url !== 'string') throw new Error('Invalid download URL');
  if (url.startsWith('data:')) {
    const match = /^data:([^,]*),(.*)$/s.exec(url);
    if (!match) throw new Error('Invalid backup data');
    const payload = decodeURIComponent(match[2]);
    if (match[1].split(';').includes('base64')) {
      if (!/^[\da-z+/]*={0,2}$/i.test(payload) || payload.length % 4 === 1) {
        throw new Error('Invalid base64 backup data');
      }
      return Buffer.from(payload, 'base64');
    }
    return Buffer.from(payload, 'utf8');
  }
  if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('Unsupported download URL');
  const response = await fetcher(url);
  if (!response.ok) throw new Error('Download failed: ' + response.status);
  return Buffer.from(await response.arrayBuffer());
}

async function saveDownload(url, destination, fetcher) {
  const content = await getDownloadContent(url, fetcher);
  await fs.writeFile(destination, content);
}

module.exports = { getDownloadContent, saveDownload };
