/**
 * ============================================================
 * NORMALIZADOR DE PROMOÇÕES DO MERCADO LIVRE
 * ============================================================
 *
 * Objetivo:
 *
 * Transformar os diferentes formatos de promoções retornados
 * pelo Mercado Livre em uma estrutura interna padronizada.
 *
 * IMPORTANTE:
 *
 * - NUNCA toma decisões pelo nome comercial da campanha.
 * - promotion.name é somente informativo.
 * - As regras são baseadas em:
 *
 *      type
 *      status
 *      price
 *      percentuais
 *      offer/ref
 *      limites de preço
 *      estoque
 *      boost
 *
 * Assim nomes como:
 *
 * "Dia das Crianças"
 * "10.10"
 * "Top Vendedores Outubro"
 * "Black Friday"
 *
 * não exigem alteração no código.
 *
 * ============================================================
 */

const KNOWN_TYPES = new Set([
  "SMART",
  "LIGHTNING",
  "DEAL",
  "DOD",
  "PRICE_DISCOUNT",
  "PRICE_MATCHING",
  "PRE_NEGOTIATED",
  "UNHEALTHY_STOCK",
  "BANK",
  "SELLER_COUPON_CAMPAIGN",
]);

/**
 * Tipos que já estamos preparados para analisar financeiramente.
 *
 * Isso NÃO significa que todos estão liberados para POST.
 */
const ANALYZABLE_TYPES = new Set([
  "SMART",
  "LIGHTNING",
  "DEAL",
  "DOD",
  "PRICE_DISCOUNT",
  "PRICE_MATCHING",
  "PRE_NEGOTIATED",
  "UNHEALTHY_STOCK",
]);

/**
 * Tipos que já temos estratégia de aplicação no laboratório.
 *
 * Continuamos conservadores aqui.
 */
const APPLY_SUPPORTED_TYPES = new Set([
  "SMART",
  "LIGHTNING",
  "DEAL",
  "DOD",
  "PRICE_DISCOUNT",
  "PRE_NEGOTIATED",
  "UNHEALTHY_STOCK",
  "PRICE_MATCHING",
]);

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function positiveNumberOrNull(value) {
  const number = numberOrNull(value);

  return number !== null && number > 0
    ? number
    : null;
}

/**
 * ============================================================
 * PREÇO ECONÔMICO DA PROMOÇÃO
 * ============================================================
 *
 * Retorna o preço que deve ser enviado ao financial.js.
 *
 * Não usamos uma regra única para todos os tipos porque a API
 * representa as oportunidades de formas diferentes.
 */
function determineBuyerPrice(raw) {
  const type = raw.type;

  const price =
    positiveNumberOrNull(raw.price);

  const suggested =
    positiveNumberOrNull(
      raw.suggested_discounted_price
    );

  const max =
    positiveNumberOrNull(
      raw.max_discounted_price
    );

  switch (type) {
    /**
     * Nos testes LIGHTNING, o campo price representou
     * o preço específico daquela oportunidade.
     */
    case "LIGHTNING":
      return price ?? suggested ?? max;

    /**
     * Na DOD validamos que price deve ter prioridade.
     */
    case "DOD":
      return price ?? suggested ?? max;

    /**
     * DEAL normalmente chega candidate com price = 0
     * e preço sugerido preenchido.
     */
    case "DEAL":
      return suggested ?? price ?? max;

    /**
     * PRICE_DISCOUNT candidate segue lógica semelhante.
     */
    case "PRICE_DISCOUNT":
      return suggested ?? price ?? max;

    /**
     * Esses tipos normalmente fornecem diretamente o
     * preço da oferta.
     */
    case "SMART":
    case "PRICE_MATCHING":
    case "PRE_NEGOTIATED":
    case "UNHEALTHY_STOCK":
      return price;

    /**
     * BANK ainda não foi validada financeiramente.
     *
     * Mesmo que a API forneça price, não vamos assumir
     * que ele representa sozinho a economia da campanha.
     */
    case "BANK":
      return null;

    /**
     * Cupom exige cálculo combinatório separado.
     */
    case "SELLER_COUPON_CAMPAIGN":
      return null;

    default:
      /**
       * Tipo desconhecido:
       * não tentamos adivinhar.
       */
      return null;
  }
}

/**
 * ============================================================
 * BENEFÍCIO ML
 * ============================================================
 *
 * O benefício NÃO vira receita.
 *
 * Ele reduz a tarifa:
 *
 * tarifa efetiva =
 *
 * MAX(
 *   0,
 *   tarifa normal - benefício ML
 * )
 */
function determineFeeBenefits(raw) {
  const originalPrice =
    positiveNumberOrNull(
      raw.original_price
    ) ?? 0;

  const meliPercentage =
    numberOrNull(
      raw.meli_percentage
    ) ?? 0;

  let campaignBenefit = 0;

  /**
   * SMART foi validada nos testes:
   *
   * original_price × meli_percentage
   *
   * é considerado redução da tarifa.
   */
    if (
    originalPrice > 0 &&
    meliPercentage > 0
    ) {
    campaignBenefit =
        originalPrice *
        (meliPercentage / 100);
    }

  /**
   * Boost explícito retornado pela API.
   */
  let boostBenefit = 0;

  const boostAmount =
    numberOrNull(
      raw.discount_meli_boost_amount
    );

  if (
    boostAmount !== null &&
    boostAmount > 0
  ) {
    boostBenefit = boostAmount;
  }

  return {
    campaignBenefit,
    boostBenefit,

    totalBenefit:
      campaignBenefit + boostBenefit,
  };
}

/**
 * ============================================================
 * CAPACIDADE DE ANÁLISE
 * ============================================================
 */
function determineCanAnalyze(
  type,
  buyerPrice
) {
  if (!ANALYZABLE_TYPES.has(type)) {
    return false;
  }

  return (
    buyerPrice !== null &&
    buyerPrice > 0
  );
}

/**
 * ============================================================
 * CAPACIDADE DE APLICAÇÃO
 * ============================================================
 *
 * Aqui estamos falando somente da capacidade técnica
 * conhecida pelo laboratório.
 *
 * A margem financeira ainda será verificada depois.
 */
function determineCanApply(
  type,
  raw
) {
  if (!APPLY_SUPPORTED_TYPES.has(type)) {
    return false;
  }

  /**
   * LIGHTNING precisa de limites de estoque válidos.
   */
  if (type === "LIGHTNING") {
    return (
      numberOrNull(raw.stock?.min) !== null &&
      numberOrNull(raw.stock?.max) !== null
    );
  }

  /**
   * Tipos baseados em oferta precisam de referência.
   */
  if (
    type === "SMART" ||
    type === "PRE_NEGOTIATED" ||
    type === "UNHEALTHY_STOCK"
  ) {
    return Boolean(
      raw.offer_id ??
      raw.ref_id
    );
  }

  return true;
}

/**
 * ============================================================
 * MOTIVO DE NÃO ANÁLISE
 * ============================================================
 */
function determineAnalysisReason(
  type,
  buyerPrice
) {
  if (!KNOWN_TYPES.has(type)) {
    return `Tipo desconhecido: ${type}`;
  }

  if (type === "BANK") {
    return "BANK ainda não possui regra financeira validada.";
  }

  if (
    type ===
    "SELLER_COUPON_CAMPAIGN"
  ) {
    return "Cupom exige análise combinada separada.";
  }

  if (
    buyerPrice === null ||
    buyerPrice <= 0
  ) {
    return "Promoção sem preço utilizável para análise.";
  }

  if (!ANALYZABLE_TYPES.has(type)) {
    return "Tipo ainda não habilitado para análise financeira.";
  }

  return null;
}

/**
 * ============================================================
 * MOTIVO DE NÃO APLICAÇÃO
 * ============================================================
 */
function determineApplyReason(
  type,
  raw,
  canApply
) {
  if (canApply) {
    return null;
  }

  if (!KNOWN_TYPES.has(type)) {
    return "Tipo desconhecido. Aplicação bloqueada por segurança.";
  }

  if (type === "LIGHTNING") {
    if (
      raw.stock?.min == null ||
      raw.stock?.max == null
    ) {
      return "LIGHTNING sem limites de estoque válidos.";
    }
  }


  if (type === "BANK") {
    return "BANK ainda não possui cálculo/aplicação validados.";
  }

  if (
    type ===
    "SELLER_COUPON_CAMPAIGN"
  ) {
    return "Cupons serão tratados em módulo específico.";
  }

  return "Aplicação automática ainda não habilitada para este tipo.";
}

/**
 * ============================================================
 * NORMALIZADOR PRINCIPAL
 * ============================================================
 */
export function normalizePromotion(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      "Promoção inválida recebida pelo normalizador."
    );
  }

  const type =
    raw.type ?? "UNKNOWN";

  const buyerPrice =
    determineBuyerPrice(raw);

  const benefits =
    determineFeeBenefits(raw);

  const canAnalyze =
    determineCanAnalyze(
      type,
      buyerPrice
    );

  const canApply =
    determineCanApply(
      type,
      raw
    );

  /**
   * ref_id é importante porque vimos várias oportunidades
   * LIGHTNING com o mesmo promotion.id.
   */
  const refId =
    raw.ref_id ??
    raw.offer_id ??
    null;

  /**
   * Chave interna.
   *
   * NÃO depende do nome comercial da campanha.
   */
  const key =
    refId ??
    [
      type,
      raw.id ?? "NO_ID",
      buyerPrice ?? "NO_PRICE",
      raw.start_date ?? "NO_START",
    ].join(":");

  return {
    /**
     * Identidade
     */
    key,

    id:
      raw.id ?? null,

    refId,

    offerId:
      raw.offer_id ??
      raw.ref_id ??
      null,

    type,

    /**
     * Nome SOMENTE para exibição.
     */
    name:
      raw.name ??
      raw.id ??
      type,

    status:
      raw.status ?? null,

    /**
     * Preços
     */
    originalPrice:
      positiveNumberOrNull(
        raw.original_price
      ),

    buyerPrice,

    minPrice:
      positiveNumberOrNull(
        raw.min_discounted_price
      ),

    maxPrice:
      positiveNumberOrNull(
        raw.max_discounted_price
      ),

    suggestedPrice:
      positiveNumberOrNull(
        raw.suggested_discounted_price
      ),

    /**
     * Cofinanciamento
     */
    sellerPercentage:
      numberOrNull(
        raw.seller_percentage
      ),

    meliPercentage:
      numberOrNull(
        raw.meli_percentage
      ),

    /**
     * Benefícios
     */
    campaignBenefit:
      benefits.campaignBenefit,

    boostBenefit:
      benefits.boostBenefit,

    feeBenefit:
      benefits.totalBenefit,

    /**
     * Estoque
     */
    stockMin:
      numberOrNull(
        raw.stock?.min
      ),

    stockMax:
      numberOrNull(
        raw.stock?.max
      ),

    /**
     * Datas
     */
    startDate:
      raw.start_date ?? null,

    finishDate:
      raw.finish_date ??
      raw.end_date ??
      null,

    /**
     * Cupom
     */
    subType:
      raw.sub_type ?? null,

    fixedPercentage:
      numberOrNull(
        raw.fixed_percentage
      ),

    /**
     * Decisões estruturais
     */
    knownType:
      KNOWN_TYPES.has(type),

    canAnalyze,

    canApply,

    analysisBlockReason:
      determineAnalysisReason(
        type,
        buyerPrice
      ),

    applyBlockReason:
      determineApplyReason(
        type,
        raw,
        canApply
      ),

    /**
     * Guardamos RAW para diagnóstico e para montar
     * payloads específicos posteriormente.
     */
    raw,
  };
}

/**
 * ============================================================
 * NORMALIZA UMA LISTA COMPLETA
 * ============================================================
 */
export function normalizePromotions(
  promotions
) {
  if (!Array.isArray(promotions)) {
    return [];
  }

  return promotions.map(
    normalizePromotion
  );
}

/**
 * ============================================================
 * HELPERS DE STATUS
 * ============================================================
 */
export function isCandidatePromotion(
  promotion
) {
  return (
    promotion?.status ===
    "candidate"
  );
}

export function isActivePromotion(
  promotion
) {
  return (
    promotion?.status ===
      "started" ||
    promotion?.status ===
      "pending"
  );
}