import { checkServerIdentity } from 'node:tls';
export function connectionOptions() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Error('DATABASE_URL is not configured');
  const ca = process.env.DATABASE_SSL_CA;
  const expectedName = process.env.DATABASE_TLS_SERVER_NAME;
  return {
    connectionString,
    ssl: ca
      ? {
          ca,
          rejectUnauthorized: true,
          ...(expectedName
            ? {
                checkServerIdentity: (
                  _host: string,
                  cert: Parameters<typeof checkServerIdentity>[1],
                ) => checkServerIdentity(expectedName, cert),
              }
            : {}),
        }
      : undefined,
  };
}
