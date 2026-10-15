import axios from "axios";
import { getAccessToken } from "./auth.js";

const BASE_URL = "https://api.mercadolibre.com";

async function request(method, path, { params, data } = {}, attempt = 1) {
  const token = await getAccessToken();

  try {
    const res = await axios({
      method,
      url: `${BASE_URL}${path}`,
      params: { app_version: "v2", ...params },
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;

    // 429: rate limit — espera e tenta de novo (até 3x)
    if (status === 429 && attempt <= 3) {
      const wait = attempt * 2000;
      console.warn(`[mlClient] 429 em ${path}, aguardando ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      return request(method, path, { params, data }, attempt + 1);
    }

    // 400 com preço não crível: não é erro de sistema, é regra de negócio — não repetir
    if (status === 400) {
      const code = body?.cause?.[0]?.error_code || body?.message;
      console.error(`[mlClient] 400 em ${path}: ${code}`);
      const error = new Error(code || "bad_request");
      error.code = code;
      error.status = 400;
      throw error;
    }

    console.error(`[mlClient] Erro ${status} em ${path}:`, body || err.message);
    if (body) err.mlBody = body;
    throw err;
  }
}

export const ml = {
  get: (path, params) => request("get", path, { params }),
  post: (path, data, params) => request("post", path, { params, data }),
  put: (path, data, params) => request("put", path, { params, data }),
  delete: (path, params) => request("delete", path, { params }),
};
