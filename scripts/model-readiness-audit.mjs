import assert from 'node:assert/strict';
import http from 'node:http';
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close=server=>new Promise(resolve=>server.close(resolve));
const reservation=http.createServer();await listen(reservation);const port=reservation.address().port;await close(reservation);
process.env.LLAMA_BASE_URL=`http://127.0.0.1:${port}/v1`;
process.env.PO_AGENT_NO_LISTEN='1';
const { modelJson }=await import('../server.mjs');
const provider=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{assert.match(body,/enable_thinking/);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'{"ready":true}'}}]}))})});
setTimeout(()=>provider.listen(port,'127.0.0.1'),650);
try {
  const value=await modelJson('system','user',{timeoutMs:3000});
  assert.deepEqual(value,{ready:true},'a provider that becomes ready during startup grace succeeds');
} finally { await new Promise(resolve=>provider.close(()=>resolve())); }
console.log('model readiness audit: transient local-provider startup is retried inside the existing deadline · PASS');
