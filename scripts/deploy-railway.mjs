import { spawnSync } from 'node:child_process';

const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
if (status.status !== 0) throw Error('Git status could not be checked.');
if (status.stdout.trim()) {
  console.error('Deploy stopped: commit the verified changes before deploying.');
  console.error('Use `git status` to review the worktree.');
  process.exit(1);
}
const verify = spawnSync('pnpm', ['verify'], { stdio: 'inherit', shell: false });
if (verify.status !== 0) process.exit(verify.status ?? 1);
const deploy = spawnSync('pnpm', ['dlx', '@railway/cli', 'up', '--project', '058da553-2021-4687-8331-a1f7ba54fe78', '--service', 'personal-os-web', '--environment', 'production', '--detach', '--yes', '--message', 'Verified production deploy'], { stdio: 'inherit', shell: false });
process.exit(deploy.status ?? 1);
