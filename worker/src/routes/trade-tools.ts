import { errorResponse, successResponse } from "../lib/http";

interface TradeToolsEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GOOGLE_MAPS_API_KEY?: string;
  DHL_API_KEY?: string;
  UPS_CLIENT_ID?: string;
  UPS_CLIENT_SECRET?: string;
  FEDEX_CLIENT_ID?: string;
  FEDEX_CLIENT_SECRET?: string;
}

async function authenticated(request:Request,env:TradeToolsEnv):Promise<boolean>{
  const token=request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if(!token)return false;
  const response=await fetch(env.SUPABASE_URL+"/auth/v1/user",{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:"Bearer "+token}});
  return response.ok;
}
async function readBody(response:Response):Promise<Record<string,unknown>>{
  const raw=await response.text();
  try{return raw?JSON.parse(raw) as Record<string,unknown>:{};}catch{return {message:raw.slice(0,300)};}
}
async function upsToken(env:TradeToolsEnv):Promise<string>{
  if(!env.UPS_CLIENT_ID||!env.UPS_CLIENT_SECRET)throw new Error("请先在设置中心配置 UPS Client ID 和 Client Secret。");
  const auth=btoa(env.UPS_CLIENT_ID+":"+env.UPS_CLIENT_SECRET);
  const response=await fetch("https://onlinetools.ups.com/security/v1/oauth/token",{method:"POST",headers:{Authorization:"Basic "+auth,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
  const data=await readBody(response);
  if(!response.ok||typeof data.access_token!=="string")throw new Error("UPS OAuth 认证失败（HTTP "+response.status+"）。请检查正式环境应用凭证及权限。");
  return data.access_token;
}
async function fedexToken(env:TradeToolsEnv):Promise<string>{
  if(!env.FEDEX_CLIENT_ID||!env.FEDEX_CLIENT_SECRET)throw new Error("请先在设置中心配置 FedEx API Key 和 Secret Key。");
  const response=await fetch("https://apis.fedex.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"client_credentials",client_id:env.FEDEX_CLIENT_ID,client_secret:env.FEDEX_CLIENT_SECRET})});
  const data=await readBody(response);
  if(!response.ok||typeof data.access_token!=="string")throw new Error("FedEx OAuth 认证失败（HTTP "+response.status+"）。请检查项目凭证和 Track API 权限。");
  return data.access_token;
}
export async function handleTradeTools(request:Request,env:TradeToolsEnv):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname!=="/api/v1/trade-tools/track"||request.method!=="POST")return errorResponse(request,"NOT_FOUND","外贸工具接口不存在。",404);
  if(!(await authenticated(request,env)))return errorResponse(request,"UNAUTHORIZED","请先登录后使用物流查询。",401);
  let body:{carrier?:string;trackingNumber?:string};
  try{body=await request.json() as typeof body;}catch{return errorResponse(request,"INVALID_JSON","请求内容格式不正确。",400);}
  const carrier=String(body.carrier||"").toLowerCase();
  const trackingNumber=String(body.trackingNumber||"").trim();
  if(!["dhl","ups","fedex"].includes(carrier)||!trackingNumber||trackingNumber.length>80)return errorResponse(request,"VALIDATION_ERROR","请选择物流服务商并输入有效运单号。",400);
  try{
    let response:Response;
    if(carrier==="dhl"){
      if(!env.DHL_API_KEY)throw new Error("请先在设置中心配置 DHL Shipment Tracking API Key。");
      const query=new URLSearchParams({trackingNumber});
      response=await fetch("https://api-eu.dhl.com/track/shipments?"+query.toString(),{headers:{"DHL-API-Key":env.DHL_API_KEY,Accept:"application/json"}});
    }else if(carrier==="ups"){
      const token=await upsToken(env);
      response=await fetch("https://onlinetools.ups.com/api/track/v1/details/"+encodeURIComponent(trackingNumber)+"?locale=en_US&returnSignature=false&returnMilestones=true&returnPOD=false",{headers:{Authorization:"Bearer "+token,transId:crypto.randomUUID(),transactionSrc:"TradePilot",Accept:"application/json"}});
    }else{
      const token=await fedexToken(env);
      response=await fetch("https://apis.fedex.com/track/v1/trackingnumbers",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({trackingInfo:[{trackingNumberInfo:{trackingNumber}}],includeDetailedScans:true})});
    }
    const data=await readBody(response);
    if(!response.ok)return errorResponse(request,"CARRIER_REQUEST_FAILED",carrier.toUpperCase()+" 官方接口返回 HTTP "+response.status+"："+String(data.message||data.errors||"请检查凭证、服务权限或运单号").slice(0,220),502);
    return successResponse(request,{carrier:carrier.toUpperCase(),trackingNumber,data});
  }catch(error){
    return errorResponse(request,"TRACKING_FAILED",error instanceof Error?error.message:"物流查询失败。",502);
  }
}
