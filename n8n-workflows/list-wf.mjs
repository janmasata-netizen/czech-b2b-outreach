import http from 'http';
import { N8N_API_KEY, N8N_HOST, N8N_PORT } from './env.mjs';
const req = http.request({ hostname: N8N_HOST, port: N8N_PORT, path:'/api/v1/workflows?limit=20', headers:{'X-N8N-API-KEY': N8N_API_KEY} }, res => {
  let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
    const j=JSON.parse(d);
    j.data.forEach(w=>console.log(w.id+'\t'+w.name));
  });
});
req.end();
