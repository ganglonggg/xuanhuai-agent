// Optional local preview. No packages, data collection, or external interfaces.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = new Set(['/standalone.html','/index.html','/styles.css','/app.js','/assets/xuanhuai-original.png']);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
const server = http.createServer((req,res) => {
  let pathname;
  try {pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);} catch (_) {res.writeHead(400);res.end('Bad request');return;}
  if (pathname === '/') pathname = '/standalone.html';
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end('Method not allowed');return;}
  if (!allowed.has(pathname)) {res.writeHead(404);res.end('Not found');return;}
  const file=path.join(__dirname,pathname.slice(1));
  fs.readFile(file,(error,data)=>{
    if(error){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  });
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(4173,'127.0.0.1',()=>console.log('Xuanhuai Agent local preview: http://127.0.0.1:4173\nPress Ctrl+C to stop. You can also open standalone.html directly.'));
