import test from "node:test";
import assert from "node:assert/strict";
import { handleAgentCenter } from "./agent-center.ts";

const ownerId="123e4567-e89b-42d3-a456-426614174000";
const connectionId="123e4567-e89b-42d3-a456-426614174001";
const env={SUPABASE_URL:"https://project.supabase.co",SUPABASE_ANON_KEY:"anon-test-key",SUPABASE_SERVICE_ROLE_KEY:"service-test-key"};
function withFetch(handler:(input:string|URL|Request,init?:RequestInit)=>Promise<Response>){
 const original=globalThis.fetch;globalThis.fetch=handler as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}
function authResponse(){return Response.json({id:ownerId});}
function connectionRow(){
 return {id:connectionId,owner_id:ownerId,name:"Demo MCP",protocol:"mcp",endpoint_url:"https://tools.example.com/mcp",auth_mode:"none",encrypted_credentials:null,capabilities:[],protocol_tools:[
  {name:"legacy_search",description:"Search records",risk:"read_only",protocol:"mcp"},
  {name:"approved_search",description:"Search with user policy",risk:"read_only",riskPolicySource:"user",protocol:"mcp"},
  {name:"dangerous_write",description:"Update external records",risk:"blocked",riskPolicySource:"user",protocol:"mcp"},
 ],protocol_metadata:{},status:"active",last_tested_at:null,last_error:null,created_at:"2026-11-19T00:00:00Z",updated_at:"2026-11-19T00:00:00Z"};
}

test("Tools registry treats legacy read_only flags as approval-required unless explicitly user-approved",async()=>{
 const restore=withFetch(async(input)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return authResponse();
  if(url.includes("/rest/v1/agent_tool_registry?or="))return Response.json(Array.from({length:10},(_,index)=>({id:"00000000-0000-4000-8000-"+String(index+1).padStart(12,"0"),owner_id:null,tool_key:"native_"+index,name:"Native "+index,description:"Read-only",category:"business_data",source:"system",implementation_key:"native_"+index,connection_id:null,protocol_tool_name:null,risk:"read_only",policy_source:"system",enabled:true,status:"active",input_schema:{},metadata:{}})));
  if(url.includes("/rest/v1/agent_connections?owner_id="))return Response.json([connectionRow()]);
  throw new Error("Unexpected fetch: "+url);
 });
 try{
  const response=await handleAgentCenter(new Request("https://worker.test/api/v1/agent/tools",{headers:{Authorization:"Bearer user-token"}}),env);
  assert.equal(response.status,200);
  const payload=await response.json() as {data:{items:Array<{name:string;risk:string;policySource:string}>;nativeCount:number;externalCount:number}};
  const items=payload.data.items.filter(item=>["legacy_search","approved_search","dangerous_write"].includes(item.name));
  assert.equal(payload.data.nativeCount,10);
  assert.equal(payload.data.externalCount,3);
  assert.equal(items.find(item=>item.name==="legacy_search")?.risk,"approval_required");
  assert.equal(items.find(item=>item.name==="legacy_search")?.policySource,"default");
  assert.equal(items.find(item=>item.name==="approved_search")?.risk,"read_only");
  assert.equal(items.find(item=>item.name==="dangerous_write")?.risk,"blocked");
 }finally{restore();}
});

test("Tools policy updates are owner-scoped and persist an explicit user decision",async()=>{
 let persisted:Record<string,unknown>|undefined;
 const restore=withFetch(async(input,init)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return authResponse();
  if(url.includes("/rest/v1/agent_connections?id=eq."+connectionId)&&(!init?.method||init.method==="GET"))return Response.json([connectionRow()]);
  if(url.includes("/rest/v1/agent_connections?id=eq."+connectionId)&&init?.method==="PATCH"){
   persisted=JSON.parse(String(init.body)) as Record<string,unknown>;
   return Response.json([{...connectionRow(),protocol_tools:persisted.protocol_tools}]);
  }
  if(url.includes("/rest/v1/agent_tool_registry?owner_id=eq."+ownerId)&&init?.method==="PATCH"){
   const registryPatch=JSON.parse(String(init.body)) as Record<string,unknown>;assert.equal(registryPatch.risk,"read_only");assert.equal(registryPatch.policy_source,"user");assert.equal(typeof registryPatch.updated_at,"string");
   return Response.json([]);
  }
  throw new Error("Unexpected fetch: "+url+" "+String(init?.method));
 });
 try{
  const response=await handleAgentCenter(new Request("https://worker.test/api/v1/agent/connections/"+connectionId+"/tool-policy",{method:"PUT",headers:{Authorization:"Bearer user-token","Content-Type":"application/json"},body:JSON.stringify({toolName:"legacy_search",risk:"read_only"})}),env);
  assert.equal(response.status,200);
  const payload=await response.json() as {data:{risk:string;policySource:string}};
  assert.equal(payload.data.risk,"read_only");
  assert.equal(payload.data.policySource,"user");
  assert.ok(persisted);
  const tools=persisted.protocol_tools as Array<Record<string,unknown>>;
  const saved=tools.find(tool=>tool.name==="legacy_search");
  assert.equal(saved?.risk,"read_only");
  assert.equal(saved?.riskPolicySource,"user");
  assert.equal(typeof saved?.riskPolicyUpdatedAt,"string");
 }finally{restore();}
});

test("Tools policy rejects unsupported risk values",async()=>{
 const restore=withFetch(async(input)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return authResponse();
  throw new Error("Database must not be queried for invalid policy");
 });
 try{
  const response=await handleAgentCenter(new Request("https://worker.test/api/v1/agent/connections/"+connectionId+"/tool-policy",{method:"PUT",headers:{Authorization:"Bearer user-token","Content-Type":"application/json"},body:JSON.stringify({toolName:"legacy_search",risk:"automatic"})}),env);
  assert.equal(response.status,400);
 }finally{restore();}
});


test("Xiaoya chat receives enabled Skill instructions and only registry-enabled native tools",async()=>{
 const artifactBody=JSON.stringify({schemaVersion:1,files:[{path:"SKILL.md",encoding:"utf-8",content:"---\\nname: demo-skill\\ndescription: Demo workflow\\n---\\n\\nUse a three-step evidence review workflow.",size:100,sha:"x"}]});
 const artifactDigest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(artifactBody))),byte=>byte.toString(16).padStart(2,"0")).join("");
 const artifactKey="sha256/"+artifactDigest+".json";
 const artifactBucket={async get(key:string){return key===artifactKey?{async arrayBuffer(){return new TextEncoder().encode(artifactBody).buffer;}}:null;}};
 const seenSystems:string[]=[];let modelCalls=0;let leadQueries=0;
 const chatEnv={...env,SKILL_ARTIFACTS:artifactBucket,AI:{async run(_model:string,input:Record<string,unknown>){
  const messages=input.messages as Array<{role:string;content:string}>;
  seenSystems.push(messages[0]?.content??"");modelCalls++;
  return {response:JSON.stringify(modelCalls===1?{reply:"查询中",task:null,toolCalls:[{name:"search_leads",arguments:{query:"Acme",limit:2}},{name:"search_crm_contacts",arguments:{query:"Acme"}}]}:{reply:"已按记录整理",task:null,toolCalls:[]})};
 }}};
 const restore=withFetch(async(input,init)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return authResponse();
  if(url.includes("/rest/v1/agent_conversations?")&&(!init?.method||init.method==="GET"))return Response.json([]);
  if(url.endsWith("/rest/v1/agent_conversations")&&init?.method==="POST")return Response.json([{id:"123e4567-e89b-42d3-a456-426614174099",title:"新聊天"}]);
  if(url.includes("/rest/v1/agent_conversations?id=eq.")&&init?.method==="PATCH")return Response.json([]);
  if(url.includes("/rest/v1/agent_chat_messages?")&&(!init?.method||init.method==="GET"))return Response.json([]);
  if(url.endsWith("/rest/v1/agent_chat_messages")&&init?.method==="POST"){
   return init.headers&&new Headers(init.headers).get("Prefer")==="return=representation"?Response.json([{id:"assistant-message-id"}]):Response.json([]);
  }
  if(url.includes("/rest/v1/ai_provider_settings"))return Response.json([]);
  if(url.includes("/rest/v1/agent_tool_registry?owner_id=is.null"))return Response.json([{tool_key:"search_leads",implementation_key:"search_leads",name:"潜在客户查询",description:"查询潜在客户"}]);
  if(url.includes("/rest/v1/agent_profiles?owner_id=eq."+ownerId))return Response.json([{agent_key:"skill:demo-skill",config:{manifest:{name:"demo-skill",description:"Demo workflow"},bundle:{artifact:{key:artifactKey}}}}]);
  if(url.includes("/rest/v1/leads?")){leadQueries++;return new Response(JSON.stringify([{id:"lead-1",name:"Acme"}]),{headers:{"content-range":"0-0/1"}});}
  if(url.includes("/rest/v1/")&&init?.method!=="POST")return new Response("[]",{headers:{"content-range":"0-0/0"}});
  throw new Error("Unexpected fetch: "+url+" "+String(init?.method));
 });
 try{
  const response=await handleAgentCenter(new Request("https://worker.test/api/v1/agent/chat",{method:"POST",headers:{Authorization:"Bearer user-token","Content-Type":"application/json"},body:JSON.stringify({message:"查询 Acme 潜在客户"})}),chatEnv);
  const payload=await response.json() as {data?:{reply:string;toolsUsed:Array<{name:string}>};error?:{message:string}};
  assert.equal(response.status,200,JSON.stringify(payload));
  assert.equal(payload.data?.reply,"已按记录整理");
  assert.equal(leadQueries,1);
  assert.deepEqual(payload.data?.toolsUsed.map(item=>item.name),["search_leads"]);
  assert.equal(modelCalls,2);
  assert.ok(seenSystems[0].includes("Use a three-step evidence review workflow."));
  assert.ok(seenSystems[0].includes("search_leads"));
  assert.ok(!seenSystems[0].includes("search_crm_contacts"));
 }finally{restore();}
});
