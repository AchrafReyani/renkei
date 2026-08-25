// Target 3b: Workers + cloudflare:node httpServerHandler — run Koa's real
// node:http server inside workerd and let the runtime bridge fetch → http.
import { httpServerHandler } from 'cloudflare:node';
import Provider from 'oidc-provider';
import { config } from './provider-config.mjs';
const provider = new Provider('http://127.0.0.1:48789', config);
provider.listen(48789);
export default httpServerHandler({ port: 48789 });
