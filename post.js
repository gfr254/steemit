import dsteem from 'dsteem';

const client = new dsteem.Client('https://api.steemit.com');

const privateKey = process.env.STEEM_POST_KEY;

async function main() {
  const result = await client.broadcast.comment(
    privateKey,
    '', // parent author
    'test', // parent permlink
    'your-steemit-username',
    'test-post',
    'Hello from GitHub Actions!',
    '',
    {}
  );

  console.log(result);
}

main();
