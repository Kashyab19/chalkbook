// Capture once per page. Another tab signing in must not redirect this page's
// pending operations into its new account. The server checks the cookie too.
const ownerAtStartup = (() => {
  try {
    return localStorage.getItem('gym-owner');
  } catch {
    return null;
  }
})();
export function deviceOwner(): string | null {
  return ownerAtStartup;
}
export function selectDeviceOwner(id: string) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw Error('Invalid notebook account');
  localStorage.setItem('gym-owner', id);
}
