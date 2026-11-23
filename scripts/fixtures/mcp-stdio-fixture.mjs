import readline from "node:readline";
const rl=readline.createInterface({input:process.stdin});
const send=(x)=>process.stdout.write(JSON.stringify({jsonrpc:"2.0",...x})+"\n");
for await(const line of rl){
 const m=JSON.parse(line);
 if(m.method==="initialize")send({id:m.id,result:{protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"fixture",version:"1"}}});
 if(m.method==="tools/list")send({id:m.id,result:m.params?.cursor?{tools:[{name:"sum",inputSchema:{type:"object",properties:{a:{type:"number"},b:{type:"number"}},required:["a","b"],additionalProperties:false}}]}:{tools:[{name:"echo",inputSchema:{type:"object",properties:{text:{type:"string",maxLength:10}},required:["text"],additionalProperties:false}}],nextCursor:"next"}});
 if(m.method==="tools/call")send({id:m.id,result:{content:[{type:"text",text:m.params.name==="sum"?String(m.params.arguments.a+m.params.arguments.b):m.params.arguments.text}]}});
}
