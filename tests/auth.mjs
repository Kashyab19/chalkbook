import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
const origin = process.env.GYM_TEST_URL;
const password = process.env.GYM_TEST_PASSWORD;
if (!origin || !password) throw Error('Set isolated test URL and credentials.');
const request = (path, options = {}) => fetch(origin + path, options);
assert.equal((await request('/api/log')).status, 401);
assert.equal((await request('/api/auth', {method:'POST', headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:JSON.stringify({username:'test-owner',password})})).status,403);
const login = await request('/api/auth', {method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'test-owner',password})});
assert.equal(login.status,200);
const cookie = login.headers.get('set-cookie').split(';')[0];
assert.match(login.headers.get('set-cookie'),/HttpOnly/);
assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
const {user} = await login.json();
const headers = {Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
const snapshot = await request('/api/log',{headers});
assert.equal(snapshot.status,200);
assert.equal(snapshot.headers.get('cache-control'),'no-store');
const before = (await snapshot.json()).data;
assert.equal((await request('/api/log',{headers:{...headers,'X-Notebook-Owner':randomUUID()}})).status,409);
const operation = {id:randomUUID(),action:{type:'deleteBody',date:'2026-01-01'}};
for (const owner of [undefined,randomUUID()]) {
 const h = {...headers};if(owner)h['X-Notebook-Owner']=owner;
 assert.equal((await request('/api/log',{method:'POST',headers:h,body:JSON.stringify(operation)})).status,409);
}
assert.deepEqual((await (await request('/api/log',{headers:{...headers,'X-Notebook-Owner':user.id}})).json()).data,before);
assert.equal((await request('/api/auth',{method:'DELETE',headers})).status,200);
assert.equal((await request('/api/log',{headers})).status,401);
console.log('PASS private API rejects anonymous access, foreign origins, mismatched device owners and revoked sessions without modifying data');
