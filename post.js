const dsteem = require('dsteem');
const client = new dsteem.Client('https://api.steemit.com');

const privateKey = dsteem.PrivateKey.fromString(process.env.STEEM_POST_KEY);

async function main() {
  const author = 'gfr254';
  const permlink = 'auto-post-' + Date.now();
  const title = 'GitHub Actions 自動投稿テスト';
  const body = 'VS Code → GitHub Actions で Steemit に自動投稿しています。';

  const jsonMetadata = { tags: ['auto', 'steemit'], app: 'vscode-steemit' };

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
  console.log('投稿完了');
}

main();

