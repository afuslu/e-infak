// Metro yapılandırması. Yalnızca yerel geliştirmede (expo start --web) kullanılan küçük bir
// API vekili içerir: tarayıcı, backend'e doğrudan istek atamaz (CORS), bu yüzden
// /__api/<kurum-adresi>/api/v1/... istekleri DEV_API_TARGET'a, Host başlığı <kurum-adresi>
// olacak şekilde iletilir. Böylece canlıdaki "platform adresi + token" kurum çözümlemesi
// yerelde birebir denenir. Uygulama paketine (EAS build) hiçbir etkisi yoktur.
const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');
const { URL } = require('url');

const config = getDefaultConfig(__dirname);
const target = process.env.DEV_API_TARGET;

if (target) {
  const upstream = new URL(target);
  const previous = config.server && config.server.enhanceMiddleware;
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, server) => {
      const base = previous ? previous(middleware, server) : middleware;
      return (req, res, next) => {
        const match = /^\/__api\/([a-z0-9.-]+)(\/.*)$/i.exec(req.url || '');
        if (!match) return base(req, res, next);
        const headers = { ...req.headers, host: match[1] };
        delete headers.origin;
        delete headers.referer;
        const proxied = http.request(
          { hostname: upstream.hostname, port: upstream.port || 80, path: match[2], method: req.method, headers },
          (answer) => {
            res.writeHead(answer.statusCode || 502, answer.headers);
            answer.pipe(res);
          },
        );
        proxied.on('error', (error) => {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ detail: `Yerel API vekili: ${error.message}` }));
        });
        req.pipe(proxied);
      };
    },
  };
}

module.exports = config;
