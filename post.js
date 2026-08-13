const dsteem = require('dsteem');
const fs = require('fs');

const client = new dsteem.Client('https://api.steemit.com');
const privateKey = dsteem.PrivateKey.fromString(process.env.STEEM_POST_KEY);

async function main() {
  const author = 'あなたのSteemitユーザー名';
  const permlink = 'auto-post-' + Date.now();
  const title = 'AI 自動生成ブログ';
  const body = fs.readFileSync('post.md', 'utf8');

  const jsonMetadata = { tags: ['steemit', 'ai', 'automation'], app: 'vscode-steemit' };

  const op = [
    'comment',
    {
      parent_author: '',
      parent_permlink: 'blog',
      author,
      permlink,
      title,
      body,
      json_metadata: JSON.stringify(jsonMetadata)
    }
  ];

  await client.broadcast.sendOperations([op], privateKey);
  console.log('Steemit に投稿完了');
}

main();
