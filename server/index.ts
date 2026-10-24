import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses, startApp } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const app = await startApp({ port, staticDir: path.resolve(here, '../dist') });

const addresses = lanAddresses();
console.log('\nGraphwars is running.\n');
console.log(`  Big screen (open on this laptop):  http://localhost:${app.port}/`);
if (addresses.length === 0) {
  console.log('  No network connection found: connect to wifi so phones can join.');
}
for (const a of addresses) console.log(`  Phones join (same wifi):           http://${a}:${app.port}/play`);
console.log('\nIf phones cannot connect, allow Node.js through the firewall for private networks.\n');

process.on('SIGINT', () => {
  void app.close().then(() => process.exit(0));
});
