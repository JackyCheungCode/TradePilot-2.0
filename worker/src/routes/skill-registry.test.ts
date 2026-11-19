import test from "node:test";
import assert from "node:assert/strict";
import { handleSkillRegistry } from "./skill-registry.ts";

const ownerId="123e4567-e89b-42d3-a456-426614174000";
const env={SUPABASE_URL:"https://project.supabase.co",SUPABASE_ANON_KEY:"anon-test-key",SUPABASE_SERVICE_ROLE_KEY:"service-test-key"};
function withFetch(handler:(input:string|URL|Request,init?:RequestInit)=>Promise<Response>){
 const original=globalThis.fetch;globalThis.fetch=handler as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}
function request(body:unknown){
 return new Request("https://worker.test/api/v1/agent/skills",{method:"POST",headers:{Authorization:"Bearer user-access-token","Content-Type":"application/json"},body:JSON.stringify(body)});
}

test("Skill package import stores a bounded bundle, review findings and disabled state under the authenticated owner",async()=>{
 let stored:Record<string,unknown>|undefined;
 const restore=withFetch(async(input,init)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("api.github.com/repos/acme/skills/git/trees/main"))return Response.json({truncated:false,tree:[
   {path:"skills/demo/SKILL.md",type:"blob",size:90,sha:"skill-sha"},
   {path:"skills/demo/index.ts",type:"blob",size:45,sha:"script-sha"},
   {path:"skills/demo/package.json",type:"blob",size:35,sha:"package-sha"},
  ]});
  if(url.includes("raw.githubusercontent.com/acme/skills/main/skills/demo/SKILL.md"))return new Response("---\\nname: demo-skill\\ndescription: Demo skill\\n---\\n");
  if(url.includes("raw.githubusercontent.com/acme/skills/main/skills/demo/index.ts"))return new Response("export async function run(){ return fetch('https://api.example.com'); }");
  if(url.includes("raw.githubusercontent.com/acme/skills/main/skills/demo/package.json"))return new Response('{"dependencies":{"zod":"^3.0.0"}}');
  if(url.includes("/rest/v1/agent_profiles")){
   stored=JSON.parse(String(init?.body)) as Record<string,unknown>;
   return new Response(null,{status:201});
  }
  throw new Error("Unexpected fetch: "+url);
 });
 try{
  const response=await handleSkillRegistry(request({repositoryUrl:"https://github.com/acme/skills/tree/main/skills/demo"}),env);
  assert.equal(response.status,200);
  const payload=await response.json() as {data:{id:string;package:{fileCount:number};securityReview:{requiresHumanReview:boolean;findings:Array<{code:string}>}}};
  assert.equal(payload.data.id,"demo-skill");
  assert.equal(payload.data.package.fileCount,3);
  assert.equal(payload.data.securityReview.requiresHumanReview,true);
  assert.ok(payload.data.securityReview.findings.some(item=>item.code==="NETWORK_ACCESS"));
  assert.ok(stored);
  assert.equal(stored.owner_id,ownerId);
  assert.equal(stored.agent_key,"skill:demo-skill");
  assert.equal(stored.enabled,false);
  const config=stored.config as Record<string,unknown>;
  const bundle=config.bundle as {files:Array<{path:string}>};
  assert.equal(bundle.files.length,3);
  assert.ok((config.securityReview as {dependencies:string[]}).dependencies.includes("zod"));
  assert.equal(config.activationStatus,"disabled_pending_review");
 }finally{restore();}
});

test("truncated GitHub trees are rejected before any package is persisted",async()=>{
 let databaseWrites=0;
 const restore=withFetch(async(input)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("api.github.com/repos/acme/skills/git/trees/main"))return Response.json({truncated:true,tree:[]});
  if(url.includes("/rest/v1/agent_profiles"))databaseWrites++;
  throw new Error("Unexpected fetch: "+url);
 });
 try{
  const response=await handleSkillRegistry(request({repositoryUrl:"https://github.com/acme/skills/tree/main/skills/demo"}),env);
  assert.equal(response.status,502);
  assert.equal(databaseWrites,0);
  const payload=await response.json() as {error:{message:string}};
  assert.match(payload.error.message,/SKILL_TREE_TRUNCATED/);
 }finally{restore();}
});

test("unauthenticated Skill package imports are rejected",async()=>{
 const restore=withFetch(async()=>Response.json({message:"invalid token"},{status:401}));
 try{
  const response=await handleSkillRegistry(request({repositoryUrl:"https://github.com/acme/skills"}),env);
  assert.equal(response.status,401);
 }finally{restore();}
});
