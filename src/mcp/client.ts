import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import {approvalGate} from "../approval/gate.js";
export interface McpTool {name:string;description?:string;inputSchema?:Record<string,unknown>;destructive?:boolean;openWorld?:boolean}
export interface McpServerConfig {name:string;command:string;args?:string[];env?:Record<string,string>;cwd?:string;requireApproval?:string[];maxConcurrent?:number}
type Pending={resolve:(v:any)=>void;reject:(e:Error)=>void;timer:NodeJS.Timeout};
type Session={proc:ReturnType<typeof spawn>;config:McpServerConfig;tools:McpTool[];pending:Map<number,Pending>;buffer:string;nextId:number;inflight:number;ready:boolean};
const ajv=new Ajv({strict:false,allErrors:true});
export class McpClient {
 private servers=new Map<string,Session>();private tools=new Map<string,{server:string;tool:McpTool}>();private connecting=new Map<string,Promise<McpTool[]>>();
 private auditPath=process.env.MCP_AUDIT_LOG||"./data/mcp-audit.log";
 private allow=process.env.MCP_ALLOWED_SERVERS?.split(",").map(x=>x.trim()).filter(Boolean);
 constructor(){fs.mkdirSync(path.dirname(this.auditPath),{recursive:true})}
 private audit(event:string,detail:Record<string,unknown>){try{fs.appendFileSync(this.auditPath,JSON.stringify({ts:new Date().toISOString(),event,...detail})+"\n")}catch{ /* log failure must not grant permissions */ }}
 private fail(name:string,s:Session,err:Error){if(this.servers.get(name)!==s)return;this.servers.delete(name);for(const [k,v] of this.tools)if(v.server===name)this.tools.delete(k);for(const p of s.pending.values()){clearTimeout(p.timer);p.reject(err)}s.pending.clear();this.audit("server_exit",{server:name})}
 private send(s:Session,m:Record<string,unknown>){if(!s.proc.stdin?.writable)throw Error("MCP stdin closed");s.proc.stdin.write(JSON.stringify({jsonrpc:"2.0",...m})+"\n")}
 private receive(name:string,s:Session,chunk:Buffer){
  s.buffer+=chunk.toString("utf8");
  if(s.buffer.length>8388608){s.proc.kill();this.fail(name,s,Error("MCP buffer limit"));return}
  while(true){const i=s.buffer.indexOf("\n");if(i<0)break;const line=s.buffer.slice(0,i).trim();s.buffer=s.buffer.slice(i+1);if(!line)continue;
   if(line.length>4194304){s.proc.kill();this.fail(name,s,Error("MCP message limit"));return}
   let m:any;try{m=JSON.parse(line);if(m.jsonrpc!=="2.0")throw Error("protocol")}catch{this.audit("invalid_message",{server:name});continue}
   if(m.id!==undefined&&m.method===undefined){if(typeof m.id!=="number")continue;const p=s.pending.get(m.id);if(!p)continue;s.pending.delete(m.id);clearTimeout(p.timer);if(m.error)p.reject(Error("MCP "+m.error.code+": "+m.error.message));else p.resolve(m.result)}
   else if(typeof m.method==="string"){if(m.id!==undefined)this.send(s,{id:m.id,error:{code:-32601,message:"Unsupported client method"}});this.audit("server_message",{server:name,method:m.method.slice(0,80)})}
  }
 }
 private request(s:Session,method:string,params:Record<string,unknown>={},timeout=30000):Promise<any>{
  const id=++s.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.pending.delete(id);reject(Error("MCP timeout: "+method))},timeout);s.pending.set(id,{resolve,reject,timer});try{this.send(s,{id,method,params})}catch(e){clearTimeout(timer);s.pending.delete(id);reject(e)}})
 }
 async connect(c:McpServerConfig):Promise<McpTool[]>{
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(c.name)||c.name.includes("__"))throw Error("Invalid server name");
  if(this.allow?.length&&!this.allow.includes(c.name))throw Error("Server not allowed");
  const ready=this.servers.get(c.name);if(ready?.ready)return [...ready.tools];
  const pending=this.connecting.get(c.name);if(pending)return pending;
  const job=this.connectInternal(c);this.connecting.set(c.name,job);try{return await job}finally{this.connecting.delete(c.name)}
 }
 private async connectInternal(c:McpServerConfig):Promise<McpTool[]>{
  if(!c.command.trim()||/[;&|$\r\n]/.test(c.command)||c.command.includes(String.fromCharCode(96)))throw Error("Invalid executable");
  const proc=spawn(c.command,c.args||[],{shell:false,env:{...process.env,...c.env},cwd:c.cwd,stdio:["pipe","pipe","pipe"],windowsHide:true});
  const s:Session={proc,config:c,tools:[],pending:new Map(),buffer:"",nextId:0,inflight:0,ready:false};this.servers.set(c.name,s);
  proc.stdout?.on("data",(x:Buffer)=>this.receive(c.name,s,x));proc.stderr?.on("data",()=>this.audit("server_stderr",{server:c.name}));
  proc.on("error",e=>this.fail(c.name,s,e));proc.on("exit",code=>this.fail(c.name,s,Error("MCP exited: "+code)));this.audit("server_connect",{server:c.name});
  try{
   const init=await this.request(s,"initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"OpenGrokBot-Prime",version:"0.1.0"}});
   if(typeof init?.protocolVersion!=="string"||typeof init?.serverInfo?.name!=="string")throw Error("Invalid initialize response");
   this.send(s,{method:"notifications/initialized"});
   const found:McpTool[]=[];const cursors=new Set<string>();let cursor:string|undefined;
   for(let page=0;page<100;page++){
    const list=await this.request(s,"tools/list",cursor?{cursor}:{});
    if(!Array.isArray(list?.tools))throw Error("Invalid tools/list");
    for(const t of list.tools){if(typeof t?.name!=="string"||!t.name||t.name.includes("__"))throw Error("Invalid tool name");
     const name=c.name+"__"+t.name;if(found.some(x=>x.name===name)||this.tools.has(name))throw Error("Duplicate tool");
     found.push({name,description:t.description,inputSchema:t.inputSchema,destructive:t.annotations?.destructiveHint,openWorld:t.annotations?.openWorldHint});
    }
    cursor=list.nextCursor;if(!cursor)break;if(typeof cursor!=="string"||cursors.has(cursor))throw Error("Invalid cursor");cursors.add(cursor);
   }
   if(cursor)throw Error("Pagination limit");
   if(this.servers.get(c.name)!==s)throw Error("Disconnected during initialize");
   s.tools=found;s.ready=true;for(const t of found)this.tools.set(t.name,{server:c.name,tool:t});
   this.audit("server_ready",{server:c.name,count:found.length});return [...found];
  }catch(e){proc.kill();this.fail(c.name,s,e instanceof Error?e:Error(String(e)));throw e}
 }
 listTools(){return [...this.tools.values()].map(x=>x.tool)}
 listServers(){return [...this.servers.entries()].filter(([,s])=>s.ready).map(([n])=>n)}
 async callTool(name:string,args:Record<string,unknown>={}):Promise<unknown>{
  const meta=this.tools.get(name);if(!meta){this.audit("tool_unknown",{tool:name});throw Error("Unknown MCP tool")}
  const s=this.servers.get(meta.server);if(!s?.ready)throw Error("MCP server not ready");
  if(!args||typeof args!=="object"||Array.isArray(args))throw Error("Invalid argument object");
  let validate;try{validate=ajv.compile(meta.tool.inputSchema||{type:"object"})}catch{throw Error("Invalid tool schema")}
  if(!validate(args))throw Error("Invalid MCP tool arguments");
  if(s.inflight>=Math.max(1,s.config.maxConcurrent??4))throw Error("MCP concurrency limit");
  if(!approvalGate.needsApproval("mcp_tool"))throw Error("MCP approvals disabled: refusing execution");
  const ok=await approvalGate.request("mcp_tool","MCP tool "+name,{tool:name,server:meta.server,argumentKeys:Object.keys(args)},"high");
  if(!ok){this.audit("tool_denied",{tool:name});throw Error("Approval denied for "+name)}
  s.inflight++;this.audit("tool_call",{tool:name,server:meta.server});
  try{const result=await this.request(s,"tools/call",{name:name.slice(meta.server.length+2),arguments:args},Number(process.env.MCP_CALL_TIMEOUT_MS)||30000);
   if(!result||!Array.isArray(result.content))throw Error("Invalid tools/call result");
   this.audit("tool_result",{tool:name,isError:result.isError===true});return result;
  }catch(e){this.audit("tool_error",{tool:name});throw e}finally{s.inflight--}
 }
 async disconnectAll(){for(const [name,s] of this.servers){this.fail(name,s,Error("MCP disconnected"));s.proc.kill();this.audit("server_disconnect",{server:name})}this.servers.clear();this.tools.clear()}
}
export const mcpHub=new McpClient();
