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
