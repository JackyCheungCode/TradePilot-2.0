export interface IntegrationSecretEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}
export async function readIntegrationSecrets<T extends IntegrationSecretEnv>(
  env: T,
  names: string[],
): Promise<Record<string,string>> {
  const unique=[...new Set(names.filter(Boolean))];
  if(!unique.length)return {};
  const response=await fetch(env.SUPABASE_URL+"/rest/v1/rpc/tradepilot_secret_get",{
    method:"POST",
    headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({p_names:unique}),
  });
  if(!response.ok)throw new Error("读取集成凭证失败（HTTP "+response.status+"）");
  const rows=await response.json() as Array<{name:string;secret:string}>;
  return Object.fromEntries((rows??[]).map(row=>[row.name,row.secret]));
}
export async function readIntegrationSecret<T extends IntegrationSecretEnv>(
  env: T,
  name: string,
  legacyBinding?: string,
): Promise<string> {
  const values=await readIntegrationSecrets(env,[name]);
  return values[name]||String(legacyBinding?(env as unknown as Record<string,unknown>)[legacyBinding]??"": "");
}
