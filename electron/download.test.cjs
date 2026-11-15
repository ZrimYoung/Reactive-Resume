const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getDownloadContent } = require('./download.cjs');

test('JSON and Markdown backups retain Chinese, reserved URL characters and line breaks without network access', async () => {
  const content = '# 中文简历\n\n[项目](https://example.com/?a=1&b=%25#结果)\n**粗体**';
  const offline = () => { throw new Error('Network must not be called'); };
  for (const type of ['text/markdown', 'application/json']) {
    assert.equal((await getDownloadContent(`data:${type};charset=utf-8,${encodeURIComponent(content)}`, offline)).toString(), content);
  }
  assert.equal((await getDownloadContent(`data:text/plain;base64,${Buffer.from(content).toString('base64')}`, offline)).toString(), content);
});
test('failed remote downloads and malformed backups are rejected before a destination file is touched', async () => {
  await assert.rejects(getDownloadContent('http://localhost/missing', async () => ({ok:false,status:404})), /404/);
  await assert.rejects(getDownloadContent('data:text/plain,%ZZ', fetch), URIError);
  await assert.rejects(getDownloadContent('file:///private', fetch), /Unsupported/);
});
