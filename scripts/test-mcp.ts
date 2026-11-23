import {strict as assert} from "node:assert";
import {McpClient} from "../src/mcp/client.js";
import {approvalGate} from "../src/approval/gate.js";
import {fileURLToPath} from "node:url";
const fixture=fileURLToPath(new URL("./fixtures/mcp-stdio-fixture.mjs",import.meta.url));
const hub=new McpClient();
async function waitForApproval(){
 for(let i=0;i<100;i++){const p=approvalGate.listPending()[0];if(p)return p;await new Promise(r=>setTimeout(r,10))}
 throw Error("No approval requested");
}
try{
 const tools=await hub.connect({name:"fixture",command:process.execPath,args:[fixture]});
 assert.deepEqual(tools.map(t=>t.name),["fixture__echo","fixture__sum"]);
 await assert.rejects(hub.callTool("fixture__echo",{text:"longer than ten chars"}),/Invalid MCP tool arguments/);
 await assert.rejects(hub.callTool("fixture__echo",{text:"hi",extra:1}),/Invalid MCP tool arguments/);
 const denied=hub.callTool("fixture__sum",{a:2,b:3});const first=await waitForApproval();approvalGate.resolve(first.id,false,"fixture-test");
 await assert.rejects(denied,/Approval denied/);
 const approved=hub.callTool("fixture__sum",{a:2,b:3});const second=await waitForApproval();approvalGate.resolve(second.id,true,"fixture-test");
 const result=await approved;assert.equal((result as any).content[0].text,"5");
 console.log("PASS MCP initialize + paginated tools/list + schema rejection + approval deny/allow + tools/call");
}finally{await hub.disconnectAll()}
