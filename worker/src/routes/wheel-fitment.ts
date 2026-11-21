import { errorResponse, successResponse } from "../lib/http";
import { readIntegrationSecret } from "../lib/integrations";

export interface WheelFitmentEnv {
  WHEELSIZE_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

const ANKUSI = "https://ankusiwheels.com/wp-json/ankusi/v1";
const WHEEL_SIZE = "https://api.wheel-size.com/v2";
const NHTSA = "https://vpic.nhtsa.dot.gov/api/vehicles";

type JsonRecord = Record<string, unknown>;

function text(value: string | null): string {
  return (value ?? "").trim();
}

function jsonHeaders(): Record<string, string> {
  return { Accept: "application/json", "User-Agent": "TradePilot-Harmonia/1.0" };
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: jsonHeaders(), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
  return await response.json() as unknown;
}

function withQuery(base: string, values: Record<string, string | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function wheelSizeKey(env: WheelFitmentEnv): Promise<string> {
  return await readIntegrationSecret(env, "tradepilot_api_wheel_size", "WHEELSIZE_API_KEY");
}

async function wheelSize(path: string, params: Record<string, string | undefined>, env: WheelFitmentEnv): Promise<unknown | null> {
  const key = await wheelSizeKey(env);
  if (!key) return null;
  return await getJson(withQuery(WHEEL_SIZE + path, { ...params, user_key: key }));
}

async function ankusi(path: string, params: Record<string, string | undefined> = {}): Promise<unknown | null> {
  return await getJson(withQuery(ANKUSI + path, params));
}

function arrayFrom(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const value = payload as JsonRecord;
    for (const key of ["data", "results", "items", "makes", "models", "years", "generations", "modifications"]) {
      if (Array.isArray(value[key])) return value[key] as unknown[];
    }
  }
  return [];
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map(value => {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (value && typeof value === "object") {
      const item = value as JsonRecord;
      return String(item.name ?? item.make ?? item.manufacturer ?? item.brand ?? item.slug ?? item.year ?? item.title ?? "");
    }
    return "";
  }).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function catalog(request: Request, env: WheelFitmentEnv, kind: string): Promise<Response> {
  const url = new URL(request.url);
  const make = text(url.searchParams.get("make"));
  const model = text(url.searchParams.get("model"));
  const year = text(url.searchParams.get("year"));
  const generation = text(url.searchParams.get("generation"));
  const requestedRegion = text(url.searchParams.get("region")) || "all";
  const region = requestedRegion === "all" ? undefined : requestedRegion;
  const modification = text(url.searchParams.get("modification"));

  try {
    const hasWheelSizeKey = Boolean(await wheelSizeKey(env));
    if (kind === "makes") {
      const [ws, ank] = await Promise.allSettled([
        wheelSize("/makes/", { region }, env),
        ankusi("/makes"),
      ]);
      const wsData = ws.status === "fulfilled" ? ws.value : null;
      const ankData = ank.status === "fulfilled" ? ank.value : null;
      const names = uniqueStrings([...arrayFrom(wsData), ...arrayFrom(ankData)]);
      return successResponse(request, {
        items: names.map(name => ({ name, logoKey: logoKey(name) })),
        sources: [
          { id: "wheel-size", status: wsData ? "available" : hasWheelSizeKey ? "error" : "not_configured" },
          { id: "ankusi", status: ankData ? "available" : "error", license: "CC BY 4.0" },
        ],
      });
    }

    if (!make) return errorResponse(request, "MAKE_REQUIRED", "请先选择车辆品牌。", 400);

    if (kind === "models" || kind === "years" || kind === "generations" || kind === "modifications") {
      if (["years", "generations", "modifications"].includes(kind) && !model) {
        return errorResponse(request, "MODEL_REQUIRED", "请先选择车型。", 400);
      }
      const wsPath = kind === "models" ? "/models/" : kind === "years" ? "/years/" : kind === "generations" ? "/generations/" : "/modifications/";
      const wsParams = { make, model: model || undefined, year: year || undefined, generation: generation || undefined, region };
      const wsPromise = wheelSize(wsPath, wsParams, env);
      const ankPromise = kind === "models" || kind === "years"
        ? ankusi("/fitment", { make, model: model || undefined, year: year || undefined, limit: "100" })
        : Promise.resolve(null);
      const [ws, ank] = await Promise.allSettled([wsPromise, ankPromise]);
      const wsData = ws.status === "fulfilled" ? ws.value : null;
      const ankData = ank.status === "fulfilled" ? ank.value : null;
      const wsItems = arrayFrom(wsData);
      const ankItems = arrayFrom(ankData);
      let items: unknown[] = wsItems;
      if (kind === "models") {
        items = uniqueStrings([...wsItems, ...ankItems.map(item => (item as JsonRecord).model)]);
      } else if (kind === "years") {
        items = uniqueStrings([...wsItems, ...ankItems.map(item => (item as JsonRecord).year)]);
      }
      return successResponse(request, {
        items,
        raw: { wheelSize: wsData, ankusi: ankData },
        sources: [
          { id: "wheel-size", status: wsData ? "available" : hasWheelSizeKey ? "error" : "not_configured" },
          { id: "ankusi", status: ankData ? "available" : "not_available_for_this_dimension", license: "CC BY 4.0" },
        ],
      });
    }

    if (kind === "vehicle") {
      if (!model) return errorResponse(request, "MODEL_REQUIRED", "请先选择车型。", 400);
      const wsData = await wheelSize("/search/by_model/", {
        make, model, year: year || undefined, generation: generation || undefined,
        modification: modification || undefined, region,
      }, env).catch(() => null);
      const ankData = await ankusi("/fitment", { make, model, year: year || undefined, limit: "100" }).catch(() => null);
      const wsRows = arrayFrom(wsData);
      const ankRows = arrayFrom(ankData);
      const rows = [
        ...wsRows.map((record, index) => ({ id: `wheel-size-${index}`, provider: "Wheel-Size", confidence: "professional_database", record })),
        ...ankRows.map((record, index) => ({ id: `ankusi-${index}`, provider: "ANKUSI", confidence: "open_reference_dataset", record })),
      ];
      return successResponse(request, {
        vehicle: { make, model, year: year || null, generation: generation || null, modification: modification || null, region: region ?? "all" },
        retrievedAt: new Date().toISOString(),
        records: rows,
        raw: { wheelSize: wsData, ankusi: ankData },
        sources: [
          { id: "wheel-size", status: wsData ? "available" : hasWheelSizeKey ? "error_or_no_match" : "not_configured", fields: ["OE wheels", "OE tires", "aftermarket options", "PCD", "center bore", "offset", "torque", "thread", "tire pressure", "powertrain", "region"] },
          { id: "ankusi", status: ankData ? "available" : "no_match", license: "CC BY 4.0", attribution: "ANKUSI Wheel Fitment Dataset" },
        ],
        limitations: ["同一车型可能返回多个配置及前后轴规格；请逐条核对车身、动力、市场与刹车套件。", "开放数据集中的 flush/max 仅为参考，不是制造商安全认证。"],
      });
    }
    return errorResponse(request, "UNKNOWN_CATALOG", "不支持的车辆目录查询。", 404);
  } catch (error) {
    console.error("WHEEL_FITMENT_PROVIDER_ERROR", { kind, error: String(error).slice(0, 240) });
    return errorResponse(request, "VEHICLE_DATA_UNAVAILABLE", "车辆数据源暂时不可用，请稍后重试。", 502);
  }
}

function logoKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    mercedesbenz: "mercedesbenz", volkswagen: "volkswagen", landrover: "landrover",
    rollsroyce: "rollsroyce", astonmartin: "astonmartin", alfaRomeo: "alfaromeo",
    byd: "byd", bmw: "bmw", audi: "audi", toyota: "toyota", honda: "honda",
    porsche: "porsche", ferrari: "ferrari", tesla: "tesla", lexus: "lexus",
    nissan: "nissan", mazda: "mazda", subaru: "subaru", volvo: "volvo",
    hyundai: "hyundai", kia: "kia", ford: "ford", jeep: "jeep", mini: "mini",
  };
  return aliases[key] ?? key;
}

export async function handleWheelFitment(request: Request, env: WheelFitmentEnv): Promise<Response> {
  if (request.method !== "GET") return errorResponse(request, "METHOD_NOT_ALLOWED", "仅支持 GET 请求。", 405);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/v1\/wheel-fitment\/?/, "");
  if (path === "vin") {
    const vin = text(url.searchParams.get("vin")).toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) return errorResponse(request, "INVALID_VIN", "VIN 必须为 11–17 位有效字符。", 400);
    try {
      const payload = await getJson(withQuery(`${NHTSA}/DecodeVinValuesExtended/${encodeURIComponent(vin)}`, { format: "json" }));
      return successResponse(request, { provider: "NHTSA vPIC", vin, raw: payload, note: "VIN 解码用于辅助确认车辆身份，不提供轮毂安全适配认证。" });
    } catch {
      return errorResponse(request, "VIN_PROVIDER_UNAVAILABLE", "NHTSA VIN 解码服务暂时不可用。", 502);
    }
  }
  return await catalog(request, env, path || "makes");
}
