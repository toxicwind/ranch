import { Database } from "bun:sqlite";
export function createFactory(opts:{framework:"hono"|"elysia",port?:number}){
  const db=new Database(":memory:"); db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`);
  const batch=[]; let timer=null; function flush(){ if(!batch.length) return; process.stderr.write(batch.splice(0).map(b=>JSON.stringify(b)).join("\n")+"\n"); }
  process.on("unhandledRejection",(r)=>{ batch.push({at:new Date().toISOString(),event:"unhandledRejection",reason:String(r)}); });
  return { createServer(a){ const s=Bun.serve({port:opts.port||3000,hostname:"0.0.0.0",reusePort:true,idleTimeout:30,fetch:a.fetch||a.handle}); batch.push({at:new Date().toISOString(),event:"listening",port:s.port,bun:Bun.version,zeroTrust:true,datetime_based:true,checkpoint:"/home/toxic/.herdproof_checkpoint"}); return s; } };
}
