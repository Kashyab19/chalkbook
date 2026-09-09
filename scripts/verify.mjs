import { spawnSync } from 'node:child_process';

const commands = [
  ['pnpm', ['test']],
  ['pnpm', ['exec', 'tsc', '--noEmit', '-p', 'tsconfig.application.json']],
  ['pnpm', ['build:railway']],
];
for (const [command, args] of commands) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nVerification passed.');
