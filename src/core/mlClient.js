import axios from "axios";
import { getAccessToken } from "../auth.js";

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

/**
 * Obtém os dados completos de um anúncio do Mercado Livre.
 */
export async function getItem(itemId) {
  return ml.get(`/items/${itemId}`, {
    include_attributes: "all",
  });
}

function getAttributeValue(attributes = [], id) {
  const attr = attributes.find((a) => a.id === id);
  return attr?.value_name ?? attr?.values?.[0]?.name ?? null;
}

export async function getAvailableStock(itemId) {
  const item = await getItem(itemId);

  // Anúncio sem variações
  if (!item.variations || item.variations.length === 0) {
    return {
      availableQuantity: Number(item.available_quantity ?? 0),
      hasVariations: false,
    };
  }

  // Anúncio com variações:
  // soma o estoque disponível de todas as variações.
  const total = item.variations.reduce(
    (sum, variation) =>
      sum + Number(variation.available_quantity ?? 0),
    0
  );

  return {
    availableQuantity: total,
    hasVariations: true,
  };
}

/**
 * Extrai SKU e EAN do anúncio.
 *
 * Prioridade:
 * 1. SELLER_SKU
 * 2. seller_custom_field (compatibilidade com anúncios antigos)
 *
 * Se houver variações, também devolvemos os SKUs/EANs delas.
 */
export async function getItemIdentifiers(itemId) {
  const item = await getItem(itemId);

  const itemSku =
    getAttributeValue(item.attributes, "SELLER_SKU") ||
    item.seller_custom_field ||
    null;

  const itemEan =
    getAttributeValue(item.attributes, "GTIN") ||
    getAttributeValue(item.attributes, "EAN") ||
    null;

  const variations = (item.variations || []).map((variation) => ({
    variationId: variation.id,

    sku:
      getAttributeValue(variation.attributes, "SELLER_SKU") ||
      variation.seller_custom_field ||
      null,

    ean:
      getAttributeValue(variation.attributes, "GTIN") ||
      getAttributeValue(variation.attributes, "EAN") ||
      null,
  }));

  return {
    itemId: item.id,
    title: item.title,
    price: item.price,
    status: item.status,

    sku: itemSku,
    ean: itemEan,

    variations,
  };
}

/**
 * Calcula a tarifa estimada de venda para um determinado preço.
 */
export async function getSellingFee({
  price,
  listingTypeId,
  categoryId,
  logisticType,
  shippingMode,
}) {
  const params = {
    price,
    listing_type_id: listingTypeId,
    category_id: categoryId,
    currency_id: "BRL",
  };

  if (logisticType) {
    params.logistic_type = logisticType;
  }

  if (shippingMode) {
    params.shipping_mode = shippingMode;
  }

  const data = await ml.get("/sites/MLB/listing_prices", params);

  const results = Array.isArray(data) ? data : [data];

  return (
    results.find((r) => r.listing_type_id === listingTypeId) ||
    results[0] ||
    null
  );
}

/**
 * Estima o custo de frete do vendedor para um anúncio existente.
 */
export async function getSellerShippingCost({
  itemId,
  price,
  freeShipping,
}) {
  return ml.get(
    `/users/${process.env.ML_USER_ID}/shipping_options/free`,
    {
      item_id: itemId,
      item_price: price,
      free_shipping: freeShipping,
      verbose: true,
    }
  );
}