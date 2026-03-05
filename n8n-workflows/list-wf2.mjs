import http from 'http';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';
function get(path) {
  return new Promise((res, rej) => {
    const req = http.request({ hostname: N8N_HOST, port: N8N_PORT, path, headers:{'X-N8N-API-KEY': N8N_API_KEY} }, r => {
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d)));
    });
    req.on('error', rej); req.end();
  });
}

const r1 = await get('/api/v1/workflows?limit=50');
console.log('Total count:', r1.nextCursor, 'got:', r1.data.length);
r1.data.forEach(w=>console.log(w.id+'\t'+w.name));
if (r1.nextCursor) {
  const r2 = await get('/api/v1/workflows?limit=50&cursor='+r1.nextCursor);
  r2.data.forEach(w=>console.log(w.id+'\t'+w.name));
}
