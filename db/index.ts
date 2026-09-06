import {env} from 'cloudflare:workers';
export function getDb(){if(!env.DB)throw new Error('Database unavailable');return env.DB}
