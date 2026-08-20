const dsteem = require('dsteem');
const client = new dsteem.Client('https://api.steemit.com');

const key = dsteem.PrivateKey.fromString(process.env.STEEM_POST_KEY);

(async () => {
  try {
    const result = await client.broadcast.comment(
      {
        parent_author: '',
        parent_permlink: 'test',
        author: 'your-steemit-id',
        permlink: 'auto-post',
        title: 'Auto Post',
        body: 'Hello from GitHub Actions!',
        json_metadata: '{}'
      },
      key
    );
    console.log(result);
  } catch (err) {
    console.error('Post failed:', err);
  }
})();
