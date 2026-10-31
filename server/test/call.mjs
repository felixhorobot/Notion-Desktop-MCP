// Manual end-to-end check against a running Notion: node server/test/call.mjs <tool> '<json args>' [<tool> '<json>' ...]
// Runs the calls in order through one real MCP session and prints each result.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const server = fileURLToPath(new URL('../index.mjs', import.meta.url));
const client = new Client({ name: 'notion-desktop-mcp-test', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: process.env, stderr: 'inherit' }));
const argv = process.argv.slice(2);
if (!argv.length) console.log((await client.listTools()).tools.map(t => t.name).join('\n'));
for (let i = 0; i < argv.length; i += 2) {
  const r = await client.callTool({ name: argv[i], arguments: JSON.parse(argv[i + 1] || '{}') });
  console.log(`=== ${argv[i]}${r.isError ? ' (ERROR)' : ''}`);
  for (const c of r.content) console.log(c.type === 'text' ? c.text : `[${c.type} ${c.data?.length ?? ''} bytes]`);
}
await client.close();
