import { backupDatabase } from "../src/lib/backup";

async function main() {
  const result = await backupDatabase();
  console.log(`Backup ready: ${result.destination} (${result.bytes} bytes)`);
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
