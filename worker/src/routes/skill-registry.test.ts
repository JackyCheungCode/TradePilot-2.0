import test from "node:test";
import assert from "node:assert/strict";
import { handleSkillRegistry } from "./skill-registry.ts";

const ownerId="123e4567-e89b-42d3-a456-426614174000";
const artifactObjects=new Map<string,{body:string;customMetadata:Record<string,string>}>();
const skillArtifacts={
 async head(key:string){const item=artifactObjects.get(key);return item?{key,size:new TextEncoder().encode(item.body).length,customMetadata:item.customMetadata}:null;},
 async get(key:string){const item=artifactObjects.get(key);return item?{async arrayBuffer(){return new TextEncoder().encode(item.body).buffer;}}:null;},
 async put(key:string,value:string|ArrayBuffer|ArrayBufferView,options?:{customMetadata?:Record<string,string>}){const body=typeof value==="string"?value:new TextDecoder().decode(value instanceof ArrayBuffer?value:new Uint8Array(value.buffer,value.byteOffset,value.byteLength));artifactObjects.set(key,{body,customMetadata:options?.customMetadata??{}});return {key};}
} as unknown as R2Bucket;
const env={SUPABASE_URL:"https://project.supabase.co",SUPABASE_ANON_KEY:"anon-test-key",SUPABASE_SERVICE_ROLE_KEY:"service-test-key",SKILL_ARTIFACTS:skillArtifacts};
function withFetch(handler:(input:string|URL|Request,init?:RequestInit)=>Promise<Response>){
 const original=globalThis.fetch;globalThis.fetch=handler as typeof fetch;
 return ()=>{globalThis.fetch=original;};
}
function request(body:unknown){
 return new Request("https://worker.test/api/v1/agent/skills",{method:"POST",headers:{Authorization:"Bearer user-access-token","Content-Type":"application/json"},body:JSON.stringify(body)});
}

function githubSkillFetch(contract:Record<string,unknown>,onStored:(row:Record<string,unknown>)=>void){
 const sourceFiles=[
  {path:"skills/demo/SKILL.md",content:"---\nname: demo-skill\ndescription: Demo skill\n---\n"},
  {path:"skills/demo/index.mjs",content:"export async function run(input){ return {result:input.query}; }"},
  {path:"skills/demo/package.json",content:'{"dependencies":{}}'},
  {path:"skills/demo/skill.json",content:JSON.stringify(contract)},
 ];
 const entries=sourceFiles.map((file,index)=>({path:file.path,type:"blob",size:new TextEncoder().encode(file.content).length,sha:"blob-"+index}));
 return async(input:string|URL|Request,init?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("api.github.com/repos/acme/skills/commits/main"))return Response.json({sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
  if(url.includes("api.github.com/repos/acme/skills/git/trees/aaaaaaaa"))return Response.json({truncated:false,tree:entries});
  const source=sourceFiles.find(file=>url.endsWith("/"+file.path));
  if(source&&url.includes("raw.githubusercontent.com/acme/skills/"))return new Response(source.content);
  if(url.includes("/rest/v1/agent_profiles")){onStored(JSON.parse(String(init?.body)) as Record<string,unknown>);return new Response(null,{status:201});}
  throw new Error("Unexpected fetch: "+url);
 };
}
const validSkillContract:Record<string,unknown>={
 schemaVersion:1,name:"demo-skill",version:"1.0.0",runtime:"dynamic_worker",entrypoint:"index.mjs",
 inputSchema:{type:"object",properties:{query:{type:"string",maxLength:200}},required:["query"],additionalProperties:false},
 outputSchema:{type:"object",properties:{result:{type:"string"}},required:["result"],additionalProperties:false},
 requiredTools:["native:market.search"],
 permissions:{networkHosts:["api.example.com"],dataScopes:["market_data:read"],secrets:[],sideEffects:[]},
 limits:{timeoutSeconds:30,memoryMb:128,maxOutputBytes:64000},
};


test("Skill package import stores a bounded bundle, review findings and disabled state under the authenticated owner",async()=>{
 let stored:Record<string,unknown>|undefined;
 const restore=withFetch(async(input,init)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("api.github.com/repos/acme/skills/commits/main"))return Response.json({sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
  if(url.includes("api.github.com/repos/acme/skills/git/trees/aaaaaaaa"))return Response.json({truncated:false,tree:[
   {path:"skills/demo/SKILL.md",type:"blob",size:90,sha:"skill-sha"},
   {path:"skills/demo/index.ts",type:"blob",size:45,sha:"script-sha"},
   {path:"skills/demo/package.json",type:"blob",size:35,sha:"package-sha"},
  ]});
  if(url.includes("raw.githubusercontent.com/acme/skills/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/skills/demo/SKILL.md"))return new Response("---\nname: demo-skill\ndescription: Demo skill\n---\n");
  if(url.includes("raw.githubusercontent.com/acme/skills/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/skills/demo/index.ts"))return new Response("export async function run(){ return fetch('https://api.example.com'); }");
  if(url.includes("raw.githubusercontent.com/acme/skills/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/skills/demo/package.json"))return new Response('{"dependencies":{"zod":"^3.0.0"}}');
  if(url.includes("/rest/v1/agent_profiles")){
   stored=JSON.parse(String(init?.body)) as Record<string,unknown>;
   return new Response(null,{status:201});
  }
  throw new Error("Unexpected fetch: "+url);
 });
 try{
  const response=await handleSkillRegistry(request({repositoryUrl:"https://github.com/acme/skills/tree/main/skills/demo"}),env);
  const responseBody=await response.json() as {data?:unknown;error?:{message:string}};
  assert.equal(response.status,200,JSON.stringify(responseBody));
  const payload=responseBody as {data:{id:string;contractStatus:string;package:{fileCount:number};securityReview:{requiresHumanReview:boolean;findings:Array<{code:string}>}}};
  assert.equal(payload.data.id,"demo-skill");
  assert.equal(payload.data.package.fileCount,3);
  assert.equal(payload.data.contractStatus,"missing");
  assert.equal(payload.data.securityReview.requiresHumanReview,true);
  assert.ok(payload.data.securityReview.findings.some(item=>item.code==="NETWORK_ACCESS"));
  assert.ok(stored);
  assert.equal(stored.owner_id,ownerId);
  assert.equal(stored.agent_key,"skill:demo-skill");
  assert.equal(stored.enabled,false);
  const config=stored.config as Record<string,unknown>;
  const bundle=config.bundle as {artifact:{key:string;sha256:string;fileCount:number}};
  assert.equal(bundle.artifact.fileCount,3);
  assert.match(bundle.artifact.key,/^sha256\/[a-f0-9]{64}\.json$/);
  assert.equal(bundle.artifact.sha256,bundle.artifact.key.slice(7,-5));
  assert.equal(artifactObjects.size,1);
  const storedArtifact=artifactObjects.get(bundle.artifact.key);
  assert.ok(storedArtifact);
  assert.equal(JSON.parse(storedArtifact.body).files.length,3);
  assert.ok((config.securityReview as {dependencies:string[]}).dependencies.includes("zod"));
  assert.equal(config.activationStatus,"disabled_pending_review");
  assert.equal(config.contractStatus,"missing");
 }finally{restore();}
});

test("truncated GitHub trees are rejected before any package is persisted",async()=>{
 let databaseWrites=0;
 const restore=withFetch(async(input)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("api.github.com/repos/acme/skills/commits/main"))return Response.json({sha:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"});
  if(url.includes("api.github.com/repos/acme/skills/git/trees/aaaaaaaa"))return Response.json({truncated:true,tree:[]});
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

test("valid skill.json contract is validated and stored without enabling execution",async()=>{
 let stored:Record<string,unknown>|undefined;
 const restore=withFetch(githubSkillFetch(validSkillContract,row=>{stored=row;}));
 try{
  const response=await handleSkillRegistry(request({repositoryUrl:"https://github.com/acme/skills/tree/main/skills/demo"}),env);
  const payload=await response.json() as {data:{contractStatus:string;contractErrors:string[];package:{fileCount:number}}};
  assert.equal(response.status,200);
  assert.equal(payload.data.contractStatus,"valid");
  assert.equal(payload.data.contractErrors.length,0);
  assert.equal(payload.data.package.fileCount,4);
  assert.ok(stored);
  const config=stored.config as Record<string,unknown>;
  assert.equal(config.contractStatus,"valid");
  assert.equal((config.contract as {runtime:string}).runtime,"dynamic_worker");
  assert.equal(config.activationStatus,"disabled_pending_review");
  assert.equal(stored.enabled,false);
 }finally{restore();}
});

test("invalid network destinations invalidate the Skill contract and remain disabled",async()=>{
 let stored:Record<string,unknown>|undefined;
 const invalid={...validSkillContract,permissions:{networkHosts:["169.254.169.254"],dataScopes:[],secrets:[],sideEffects:[]}};
 const restore=withFetch(githubSkillFetch(invalid,row=>{stored=row;}));
 try{
  const response=await handleSkillRegistry(request({repositoryUrl:"https://github.com/acme/skills/tree/main/skills/demo"}),env);
  const payload=await response.json() as {data:{contractStatus:string;contractErrors:string[];securityReview:{findings:Array<{code:string}>}}};
  assert.equal(response.status,200);
  assert.equal(payload.data.contractStatus,"invalid");
  assert.ok(payload.data.contractErrors.some(error=>error.includes("networkHosts")));
  assert.ok(payload.data.securityReview.findings.some(item=>item.code==="SKILL_CONTRACT_INVALID"));
  assert.ok(stored);
  assert.equal(stored.enabled,false);
  assert.equal((stored.config as Record<string,unknown>).activationStatus,"disabled_pending_review");
 }finally{restore();}
});

test("manual Skill registration stores validated markdown privately and remains disabled",async()=>{
 let stored:Record<string,unknown>|undefined;
 const restore=withFetch(async(input,init)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("/rest/v1/agent_profiles")){stored=JSON.parse(String(init?.body)) as Record<string,unknown>;return new Response(null,{status:201});}
  throw new Error("Unexpected fetch: "+url);
 });
 try{
  const response=await handleSkillRegistry(request({sourceType:"manual",skillMd:"---\\nname: manual-demo\\ndescription: A manually authored Skill\\n---\\n\\n# Instructions\\nReview the provided input."}),env);
  const payload=await response.json() as {data:{id:string;contractStatus:string;activationStatus:string}};
  assert.equal(response.status,200);
  assert.equal(payload.data.id,"manual-demo");
  assert.equal(payload.data.contractStatus,"missing");
  assert.equal(payload.data.activationStatus,"disabled_pending_review");
  assert.ok(stored);
  assert.equal(stored.enabled,false);
  assert.equal((stored.config as Record<string,unknown>).sourceType,"manual");
  assert.equal(artifactObjects.size,1);
 }finally{restore();}
});

test("manual Skill registration rejects invalid frontmatter before storage",async()=>{
 let writes=0;
 const restore=withFetch(async(input)=>{
  const url=String(input);
  if(url.endsWith("/auth/v1/user"))return Response.json({id:ownerId});
  if(url.includes("/rest/v1/agent_profiles"))writes++;
  throw new Error("Unexpected fetch: "+url);
 });
 try{
  const response=await handleSkillRegistry(request({sourceType:"manual",skillMd:"# Missing frontmatter"}),env);
  assert.equal(response.status,502);
  assert.equal(writes,0);
 }finally{restore();}
});
