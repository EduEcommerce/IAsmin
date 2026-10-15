import {
  getItem,
  getItemIdentifiers,
  getSellingFee,
  getSellerShippingCost,
} from "./mlClient.js";

import { getProductBySku } from "../tinyClient.js";

import {
  getMinimumMargin as getConfiguredMinimumMargin,
} from "../services/settingsService.js";

// Cache por SKU para evitar consultar o Tiny repetidamente no mesmo processo.
const productCache = new Map();

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getMinimumMargin(origem) {
  const origemNumero =
    Number(origem);

  /**
   * Regra atual:
   *
   * Origem 0 = NACIONAL
   * Demais origens = IMPORTADO
   *
   * Mantemos exatamente a classificação
   * que já estava validada no bot.
   */

  const classification =
    origemNumero === 0
      ? "NACIONAL"
      : "IMPORTADO";


  /**
   * A margem mínima agora vem de:
   *
   * data/bot-settings.json
   *
   * através do settingsService.
   */

  const minimumMargin =
    getConfiguredMinimumMargin(
      classification
    );


  return {
    classification,
    minimumMargin,
  };
}

async function getCachedProduct(sku) {
  const key = String(sku);

  if (productCache.has(key)) {
    return productCache.get(key);
  }

  const produto = await getProductBySku(key);

  if (produto) {
    productCache.set(key, produto);
  }

  return produto;
}

/**
 * Analisa financeiramente UM anúncio em UM determinado preço.
 *
 * feeBenefit deve ser o benefício absoluto concedido pelo ML
 * sobre os custos por venda, quando informado pela promoção.
 */
export async function analyzeFinancial({
  itemId,
  price,
  feeBenefit = 0,
  promotionId = null,
  promotionType = null,
}) {
  const analyzedPrice = number(price);

  if (!itemId) {
    throw new Error("itemId é obrigatório.");
  }

  if (analyzedPrice <= 0) {
    throw new Error(
      `Preço inválido para análise do anúncio ${itemId}: ${price}`
    );
  }

  // ─────────────────────────────────────
  // ANÚNCIO ML
  // ─────────────────────────────────────

  const item = await getItem(itemId);
  const identifiers = await getItemIdentifiers(itemId);

  const sku =
    identifiers.sku ||
    identifiers.variations.find((v) => v.sku)?.sku;

  if (!sku) {
    throw new Error(
      `Não foi possível identificar o SKU de ${itemId}.`
    );
  }

  // ─────────────────────────────────────
  // PRODUTO TINY
  // ─────────────────────────────────────

  const produto = await getCachedProduct(sku);

  if (!produto) {
    throw new Error(
      `SKU ${sku} do anúncio ${itemId} não encontrado no Tiny.`
    );
  }

  const productCost = number(produto.custo);

  if (productCost <= 0) {
    throw new Error(
      `SKU ${sku} está sem último custo válido no Tiny.`
    );
  }

  // ─────────────────────────────────────
  // CONTEXTO DO ANÚNCIO
  // ─────────────────────────────────────

  const listingTypeId = item.listing_type_id;
  const categoryId = item.category_id;

  const logisticType =
    item.shipping?.logistic_type || null;

  const shippingMode =
    item.shipping?.mode || null;

  const freeShipping =
    Boolean(item.shipping?.free_shipping);

  // ─────────────────────────────────────
  // TARIFA NORMAL ML
  // ─────────────────────────────────────

  const feeInfo = await getSellingFee({
    price: analyzedPrice,
    listingTypeId,
    categoryId,
    logisticType,
    shippingMode,
  });

  const normalSaleFee =
    number(feeInfo?.sale_fee_amount);

  // ─────────────────────────────────────
  // BENEFÍCIO NA TARIFA
  // ─────────────────────────────────────

  const requestedFeeBenefit =
    Math.max(0, number(feeBenefit));

  // Benefício efetivamente aproveitável.
  // Nunca pode ultrapassar a tarifa.
  const appliedFeeBenefit =
    Math.min(normalSaleFee, requestedFeeBenefit);

  // Tarifa nunca fica negativa.
  const effectiveSaleFee =
    Math.max(0, normalSaleFee - appliedFeeBenefit);

  // Apenas auditoria. NÃO entra como receita.
  const unusedFeeBenefit =
    Math.max(0, requestedFeeBenefit - normalSaleFee);

  // ─────────────────────────────────────
  // FRETE
  // ─────────────────────────────────────

  let shippingCost = 0;
  let shippingWarning = null;

  try {
    const shippingInfo =
      await getSellerShippingCost({
        itemId,
        price: analyzedPrice,
        freeShipping,
      });

    shippingCost = number(
      shippingInfo?.coverage?.all_country?.list_cost
    );
  } catch (err) {
    shippingWarning =
      err.response?.data ||
      err.mlBody ||
      err.message;

    // IMPORTANTE:
    // depois podemos optar por bloquear a promoção
    // quando não for possível obter o frete.
    throw new Error(
  `Não foi possível calcular o frete de ${itemId}. ` +
  `Promoção bloqueada por segurança.`
);
  }

  // ─────────────────────────────────────
  // IMPOSTO
  // ─────────────────────────────────────

  const taxPercent =
    number(process.env.IMPOSTO_PERCENT);

  const taxAmount =
    analyzedPrice * (taxPercent / 100);

  // ─────────────────────────────────────
  // RESULTADO
  // ─────────────────────────────────────

  const netProfit =
    analyzedPrice -
    productCost -
    effectiveSaleFee -
    shippingCost -
    taxAmount;

  const netMargin =
    analyzedPrice > 0
      ? (netProfit / analyzedPrice) * 100
      : 0;

  // ─────────────────────────────────────
  // REGRA COMERCIAL
  // ─────────────────────────────────────

  const {
    classification,
    minimumMargin,
  } = getMinimumMargin(produto.origem);

  const marginGap =
    netMargin - minimumMargin;

  const eligible =
    netMargin >= minimumMargin;

  return {
    itemId,
    promotionId,
    promotionType,

    sku: String(sku),

    product: {
      name: produto.nome,
      ean: produto.ean,
      origin: produto.origem,
      ncm: produto.ncm,
      cost: round2(productCost),
      classification,
    },

    listing: {
      listingTypeId,
      categoryId,
      logisticType,
      shippingMode,
      freeShipping,
    },

    financial: {
      price: round2(analyzedPrice),

      productCost: round2(productCost),

      normalSaleFee: round2(normalSaleFee),

      requestedFeeBenefit:
        round2(requestedFeeBenefit),

      appliedFeeBenefit:
        round2(appliedFeeBenefit),

      unusedFeeBenefit:
        round2(unusedFeeBenefit),

      effectiveSaleFee:
        round2(effectiveSaleFee),

      shippingCost:
        round2(shippingCost),

      taxPercent:
        round2(taxPercent),

      taxAmount:
        round2(taxAmount),

      netProfit:
        round2(netProfit),

      netMargin:
        round2(netMargin),

      minimumMargin:
        round2(minimumMargin),

      marginGap:
        round2(marginGap),

      eligible,
    },

    warnings: {
      shipping: shippingWarning,
    },
  };
}

/**
 * ============================================================
 * OTIMIZADOR DE PREÇO — PRICE_DISCOUNT
 * ============================================================
 *
 * Objetivo:
 *
 * Encontrar o MENOR preço comercial possível que:
 *
 * - esteja dentro dos limites permitidos pelo Mercado Livre;
 * - mantenha a margem mínima configurada;
 * - prefira finais comerciais:
 *
 *   1. ,90
 *   2. ,50
 *   3. ,00
 *
 * O cálculo financeiro continua sendo feito exclusivamente
 * por analyzeFinancial().
 * ============================================================
 */


/**
 * Gera preços comerciais próximos de um determinado valor.
 *
 * Exemplo:
 *
 * 411.57
 *
 * candidatos próximos:
 *
 * 410.90
 * 411.00
 * 411.50
 * 411.90
 * 412.00
 * 412.50
 * 412.90
 */
function buildCommercialCandidates(
  referencePrice,
  minPrice,
  maxPrice
) {
  const reference =
    Number(referencePrice);

  const minimum =
    Number(minPrice);

  const maximum =
    Number(maxPrice);


  if (
    !Number.isFinite(reference) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum)
  ) {
    return [];
  }


  const base =
    Math.floor(reference);


  const candidates =
    new Set();


  /**
   * Procuramos alguns reais abaixo e acima
   * do ponto encontrado pela busca binária.
   *
   * Isso é suficiente para encontrar o
   * próximo preço comercial sem fazer
   * centenas de chamadas à API.
   */
  for (
    let integer = base - 3;
    integer <= base + 4;
    integer++
  ) {

    if (integer < 0) {
      continue;
    }


    /**
     * Final ,90
     */
    candidates.add(
      round2(integer + 0.90)
    );


    /**
     * Final ,50
     */
    candidates.add(
      round2(integer + 0.50)
    );


    /**
     * Final ,00
     */
    candidates.add(
      round2(integer)
    );
  }


  return Array.from(candidates)

    /**
     * Respeita os limites da campanha.
     */
    .filter(
      (price) =>
        price >= minimum &&
        price <= maximum
    )

    /**
     * Do menor para o maior.
     *
     * Queremos o menor preço que preserve
     * nossa margem.
     */
    .sort(
      (a, b) => a - b
    );
}


/**
 * ============================================================
 * FIND BEST PRICE DISCOUNT
 * ============================================================
 */

export async function findBestPriceDiscount({
  itemId,
  minPrice,
  maxPrice,
  feeBenefit = 0,
  promotionId = null,
  promotionType = "PRICE_DISCOUNT",
}) {
  const minimum =
    number(minPrice, NaN);

  const maximum =
    number(maxPrice, NaN);


  /**
   * ==========================================================
   * VALIDAR FAIXA PERMITIDA PELO MERCADO LIVRE
   * ==========================================================
   */

  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum <= 0 ||
    maximum <= 0 ||
    minimum > maximum
  ) {
    throw new Error(
      `PRICE_DISCOUNT com faixa de preço inválida: ` +
      `mínimo=${minPrice}, máximo=${maxPrice}.`
    );
  }


  /**
   * ==========================================================
   * PASSO 1
   *
   * ANALISAR O PREÇO MÁXIMO PERMITIDO
   * ==========================================================
   *
   * Se nem o maior preço permitido pelo ML atingir
   * a margem mínima, não existe preço viável.
   */

  const maximumAnalysis =
    await analyzeFinancial({
      itemId,
      price: maximum,
      feeBenefit,
      promotionId,
      promotionType,
    });


  if (
    maximumAnalysis
      ?.financial
      ?.eligible !== true
  ) {
    return {
      eligible: false,

      reason:
        "MAX_PRICE_BELOW_MINIMUM_MARGIN",

      minPrice:
        round2(minimum),

      maxPrice:
        round2(maximum),

      selectedPrice:
        null,

      financial:
        maximumAnalysis,
    };
  }


  /**
   * ==========================================================
   * MARGEM-ALVO
   * ==========================================================
   *
   * A margem mínima continua sendo a trava absoluta.
   *
   * PRICE_DISCOUNT trabalha com 1 ponto percentual
   * de folga sobre a margem mínima.
   *
   * Exemplo:
   *
   * Nacional:
   * mínimo = 9%
   * alvo   = 10%
   *
   * Importado:
   * mínimo = 15%
   * alvo   = 16%
   */

  const minimumMargin =
    number(
      maximumAnalysis
        ?.financial
        ?.minimumMargin,
      NaN
    );

  const targetMargin =
    Number.isFinite(minimumMargin)
      ? minimumMargin + 0.5
      : NaN;


  /**
   * ==========================================================
   * PASSO 2
   *
   * BUSCA BINÁRIA
   * ==========================================================
   *
   * PRICE_DISCOUNT:
   *
   * procuramos aproximadamente o menor preço capaz
   * de atingir a margem-alvo.
   *
   * Exemplo:
   *
   * margem mínima = 9%
   * margem-alvo   = 10%
   *
   * O objetivo é chegar próximo de 10%,
   * e depois escolher um preço comercial.
   *
   * Outras promoções continuam usando a margem mínima.
   */

  let low =
    minimum;

  let high =
    maximum;


  for (
    let iteration = 0;
    iteration < 12;
    iteration++
  ) {
    if (
      high - low <= 0.25
    ) {
      break;
    }


    const middle =
      round2(
        (low + high) / 2
      );


    const analysis =
      await analyzeFinancial({
        itemId,
        price: middle,
        feeBenefit,
        promotionId,
        promotionType,
      });


    const netMargin =
      number(
        analysis
          ?.financial
          ?.netMargin,
        -Infinity
      );


    /**
     * PRICE_DISCOUNT:
     *
     * Se atingimos a margem-alvo,
     * podemos tentar baixar o preço.
     *
     * Caso contrário,
     * precisamos subir.
     */

    if (
      promotionType === "PRICE_DISCOUNT" &&
      Number.isFinite(targetMargin)
    ) {
      if (
        netMargin >= targetMargin
      ) {
        high = middle;
      } else {
        low = middle;
      }

      continue;
    }


    /**
     * Demais tipos de promoção:
     *
     * mantém exatamente a regra anterior,
     * baseada na margem mínima.
     */

    if (
      analysis
        ?.financial
        ?.eligible === true
    ) {
      high = middle;
    } else {
      low = middle;
    }
  }


  /**
   * ==========================================================
   * PASSO 3
   *
   * GERAR PREÇOS COMERCIAIS
   * ==========================================================
   *
   * buildCommercialCandidates já gera preços próximos
   * ao ponto encontrado, priorizando finais comerciais:
   *
   * ,90
   * ,50
   * ,00
   */

  const candidates =
    buildCommercialCandidates(
      high,
      minimum,
      maximum
    );


  if (
    candidates.length === 0
  ) {
    /**
     * Se não encontramos preço comercial,
     * PRICE_DISCOUNT ainda pode usar o preço máximo
     * permitido, desde que ele respeite a margem mínima.
     */

    if (
      promotionType === "PRICE_DISCOUNT" &&
      maximumAnalysis
        ?.financial
        ?.eligible === true
    ) {
      return {
        eligible: true,

        reason:
          "NO_COMMERCIAL_PRICE_USING_MAX_PRICE",

        minPrice:
          round2(minimum),

        maxPrice:
          round2(maximum),

        selectedPrice:
          round2(maximum),

        financial:
          maximumAnalysis,
      };
    }


    return {
      eligible: false,

      reason:
        "NO_COMMERCIAL_PRICE_IN_RANGE",

      minPrice:
        round2(minimum),

      maxPrice:
        round2(maximum),

      selectedPrice:
        null,

      financial:
        maximumAnalysis,
    };
  }


  /**
   * ==========================================================
   * PASSO 4
   *
   * TESTAR PREÇOS COMERCIAIS
   * ==========================================================
   *
   * Os candidatos vêm ordenados do menor para o maior.
   *
   * Para PRICE_DISCOUNT:
   * escolhemos o primeiro que atingir a margem-alvo.
   *
   * Isso nos dá um preço competitivo sem trabalhar
   * exatamente em cima da margem mínima.
   */

  for (
    const candidatePrice
    of candidates
  ) {
    const analysis =
      await analyzeFinancial({
        itemId,
        price:
          candidatePrice,

        feeBenefit,

        promotionId,

        promotionType,
      });


    const netMargin =
      number(
        analysis
          ?.financial
          ?.netMargin,
        -Infinity
      );


    /**
     * PRICE_DISCOUNT:
     * precisa atingir a margem-alvo.
     */

    if (
      promotionType === "PRICE_DISCOUNT" &&
      Number.isFinite(targetMargin)
    ) {
      if (
        netMargin >= targetMargin
      ) {
        return {
          eligible: true,

          reason: null,

          minPrice:
            round2(minimum),

          maxPrice:
            round2(maximum),

          selectedPrice:
            round2(candidatePrice),

          targetMargin:
            round2(targetMargin),

          financial:
            analysis,
        };
      }

      continue;
    }


    /**
     * Demais promoções:
     * continuam utilizando a margem mínima normal.
     */

    if (
      analysis
        ?.financial
        ?.eligible === true
    ) {
      return {
        eligible: true,

        reason: null,

        minPrice:
          round2(minimum),

        maxPrice:
          round2(maximum),

        selectedPrice:
          round2(candidatePrice),

        financial:
          analysis,
      };
    }
  }


  /**
   * ==========================================================
   * PASSO 5
   *
   * FALLBACK DA PRICE_DISCOUNT
   * ==========================================================
   *
   * A margem-alvo é um objetivo comercial,
   * NÃO uma trava.
   *
   * Se não conseguimos atingir:
   *
   * Nacional  = 10%
   * Importado = 16%
   *
   * ainda podemos aplicar PRICE_DISCOUNT se o preço
   * máximo permitido respeitar a margem mínima absoluta:
   *
   * Nacional  = 9%
   * Importado = 15%
   */

  if (
    promotionType === "PRICE_DISCOUNT" &&
    maximumAnalysis
      ?.financial
      ?.eligible === true
  ) {
    return {
      eligible: true,

      reason:
        "TARGET_MARGIN_NOT_REACHED_USING_MAX_PRICE",

      minPrice:
        round2(minimum),

      maxPrice:
        round2(maximum),

      selectedPrice:
        round2(maximum),

      targetMargin:
        Number.isFinite(targetMargin)
          ? round2(targetMargin)
          : null,

      financial:
        maximumAnalysis,
    };
  }


  /**
   * Nenhum preço comercial disponível
   * atingiu a margem necessária.
   */

  return {
    eligible: false,

    reason:
      "NO_COMMERCIAL_PRICE_MEETS_MARGIN",

    minPrice:
      round2(minimum),

    maxPrice:
      round2(maximum),

    selectedPrice:
      null,

    financial:
      maximumAnalysis,
  };
}