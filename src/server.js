import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { createHandler } from './handler.js';

const server = createServer(createHandler());
const { values: options } = parseArgs({
  options: { host: { type: 'string' }, port: { type: 'string' }, strictPort: { type: 'boolean' } },
});
const host = options.host || process.env.HOST || '127.0.0.1';
const port = Number(options.port || process.env.PORT || 3000);
server.listen(port, host, () => {
  console.log(`Ankiety działają na http://${host}:${server.address().port}`);
});
