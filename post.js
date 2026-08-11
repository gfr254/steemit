const fs = require('fs');
const dsteem = require('dsteem');
const client = new dsteem.Client('https://api.steemit.com');

const privateKey = dsteem.PrivateKey.fromString(process.env.STEEM_POST_KEY);

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const file = `./posts/${today}.md`;
  const md = fs.readFileSync(file, 'utf8');

  const front = /---([\s\S]*?)---/.exec(md);
  const meta = front ? front[1] : '';
  const title = /title:\s*(.*)/.exec(meta)?.[1] ?? `Auto Post ${today}`;
  const tags = /tags:\s*

\[(.*)\]

/.exec(meta)?.[1]?.split(',').map(t => t.trim()) ?? ['steemit'];

  const body = md.replace(front[0], '');

  const op = [
    'comment',
    {
      parent_author: '',
      parent_permlink: 'blog',
      author: 'あなたのID',
      permlink: `auto-${today}`,
      title,
      body,
      json_metadata: JSON.stringify({ tags })
    }
  ];

  await client.broadcast.sendOperations([op], privateKey);
}

main();
