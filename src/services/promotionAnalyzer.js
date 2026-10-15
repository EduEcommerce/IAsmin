import { ml } from "../core/mlClient.js";

/**
 * ============================================================
 * PROMOTION ANALYZER
 * ============================================================
 *
 * REGRAS DE SEGURANÇA:
 *
 * 1. O preço de uma promoção NUNCA será calculado,
 *    estimado, deduzido ou reconstruído.
 *
 * 2. Para promoções cujo preço é definido pelo Mercado Livre,
 *    usamos SOMENTE price retornado oficialmente pela API.
 *
 * 3. meli_percentage NÃO é tratado como redução da tarifa.
 *    Ele permanece apenas como informação da participação
 *    do Mercado Livre na promoção.
 *
 * 4. discount_meli_boost_amount pode ser considerado benefício
 *    nos custos por venda quando retornado explicitamente pelo ML.
 *
 * 5. Se não houver price oficial válido:
 *    - não analisar financeiramente;
 *    - não inferir pelo percentual;
 *    - não aplicar a promoção.
 *
 * ============================================================
 */


/**
 * Cache por campanha UNHEALTHY_STOCK.
 *
 * Evita consultar repetidamente a mesma campanha
 * durante uma execução.
 */
const unhealthyCampaignCache =
  new Map();


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}


function validPrice(value) {
  const n =
    numberOrNull(value);

  return (
    n !== null &&
    n > 0
  );
}


/**
 * ============================================================
 * PROMOÇÕES DO ITEM
 * ============================================================
 */

export async function getItemPromotions(
  itemId
) {
  const data =
    await ml.get(
      `/seller-promotions/items/${itemId}`,
      {
        app_version: "v2",
      }
    );

  return Array.isArray(data)
    ? data
    : [];
}


/**
 * ============================================================
 * LOCALIZAR PROMOÇÃO
 * ============================================================
 */

export function findPromotion(
  promotions,
  promotionId,
  promotionType
) {
  return (
    promotions.find(
      (promotion) => {

        const sameType =
          promotion?.type ===
          promotionType;

        const sameId =
          promotionId == null ||
          promotion?.id ===
            promotionId;

        return (
          sameType &&
          sameId
        );
      }
    ) ?? null
  );
}


/**
 * ============================================================
 * PROMOÇÕES ATIVAS
 * ============================================================
 */

export function getActivePromotions(
  promotions
) {
  return promotions.filter(
    (promotion) =>
      promotion?.status ===
        "started" ||
      promotion?.status ===
        "pending"
  );
}


/**
 * ============================================================
 * PROMOÇÕES CANDIDATAS
 * ============================================================
 */

export function getCandidatePromotions(
  promotions
) {
  return promotions.filter(
    (promotion) =>
      promotion?.status ===
      "candidate"
  );
}


/**
 * ============================================================
 * CONSULTAR CAMPANHA UNHEALTHY_STOCK
 * ============================================================
 *
 * O objetivo desta consulta é encontrar dados oficiais
 * da oportunidade, principalmente:
 *
 * - price
 * - offer_id
 * - original_price
 * - seller_percentage
 * - meli_percentage
 *
 * NENHUM preço é calculado.
 */

async function getUnhealthyCampaignItems(
  promotionId
) {
  if (!promotionId) {
    return [];
  }

  /**
   * Cache:
   * evita consultar a mesma campanha várias vezes
   * durante a mesma execução.
   */
  if (
    unhealthyCampaignCache.has(
      promotionId
    )
  ) {
    return unhealthyCampaignCache.get(
      promotionId
    );
  }

  const allItems = [];

  const limit = 50;

  /**
   * IMPORTANTE:
   *
   * Este endpoint do Mercado Livre utiliza
   * paginação por searchAfter.
   *
   * NÃO usar offset.
   */
  let searchAfter = null;

  let page = 1;

  while (true) {
    const params = {
      promotion_type:
        "UNHEALTHY_STOCK",

      app_version:
        "v2",

      limit,
    };

    /**
     * Na primeira página NÃO enviamos searchAfter.
     *
     * Nas páginas seguintes enviamos exatamente
     * o token retornado pelo Mercado Livre.
     */
    if (searchAfter) {
      params.searchAfter =
        searchAfter;
    }

    const response =
      await ml.get(
        `/seller-promotions/promotions/${promotionId}/items`,
        params
      );

    const results =
      Array.isArray(response)
        ? response
        : Array.isArray(
            response?.results
          )
          ? response.results
          : Array.isArray(
              response?.items
            )
            ? response.items
            : [];

    allItems.push(
      ...results
    );

    /**
     * Total oficial informado pelo ML.
     */
    const total =
      numberOrNull(
        response?.paging?.total
      );

    /**
     * Token para próxima página.
     */
    const nextSearchAfter =
      response?.paging?.searchAfter ??
      response?.paging?.search_after ??
      null;

    /**
     * --------------------------------------------------------
     * CONDIÇÕES DE PARADA
     * --------------------------------------------------------
     */

    // Nenhum item retornado.
    if (
      results.length === 0
    ) {
      break;
    }

    // Já coletamos o total informado pelo ML.
    if (
      total !== null &&
      allItems.length >= total
    ) {
      break;
    }

    // Não existe token para próxima página.
    if (!nextSearchAfter) {
      break;
    }

    /**
     * Proteção contra loop infinito:
     * o ML não pode devolver o mesmo searchAfter novamente.
     */
    if (
      nextSearchAfter ===
      searchAfter
    ) {
      throw new Error(
        `Paginação UNHEALTHY_STOCK travada na campanha ${promotionId}. ` +
        `O Mercado Livre retornou o mesmo searchAfter na página ${page}.`
      );
    }

    /**
     * Próxima página.
     */
    searchAfter =
      nextSearchAfter;

    page++;

    /**
     * Proteção adicional.
     *
     * Uma campanha jamais deveria exigir
     * centenas de páginas neste processo.
     */
    if (page > 500) {
      throw new Error(
        `Paginação UNHEALTHY_STOCK excedeu 500 páginas ` +
        `na campanha ${promotionId}.`
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * VALIDAÇÃO FINAL
   * ----------------------------------------------------------
   *
   * Remove eventuais duplicidades por segurança.
   *
   * A chave preferencial é:
   *
   * id + offer_id
   */

  const uniqueItems = [];

  const seen =
    new Set();

  for (const item of allItems) {
    const itemId =
      item?.id ??
      item?.item_id ??
      item?.itemId ??
      "";

    const offerId =
      item?.offer_id ??
      item?.ref_id ??
      "";

    const key =
      `${itemId}|${offerId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    uniqueItems.push(
      item
    );
  }

  /**
   * Só depois de concluir corretamente
   * salvamos no cache.
   */
  unhealthyCampaignCache.set(
    promotionId,
    uniqueItems
  );

  return uniqueItems;
}


/**
 * ============================================================
 * BUSCAR ITEM OFICIAL NA CAMPANHA
 * ============================================================
 */

async function getOfficialUnhealthyItem({
  itemId,
  promotionId,
}) {

  if (!itemId) {
    throw new Error(
      "UNHEALTHY_STOCK sem itemId."
    );
  }


  if (!promotionId) {
    throw new Error(
      `${itemId}: UNHEALTHY_STOCK sem promotion_id.`
    );
  }


  const items =
    await getUnhealthyCampaignItems(
      promotionId
    );


  const officialItem =
    items.find(
      (item) => {

        const returnedItemId =
          item?.id ??
          item?.item_id ??
          null;


        return (
          String(returnedItemId) ===
          String(itemId)
        );
      }
    );


  if (!officialItem) {
    throw new Error(
      `${itemId}: não encontrado na campanha ` +
      `${promotionId} UNHEALTHY_STOCK.`
    );
  }

  /**
 * DEBUG TEMPORÁRIO — UNHEALTHY_STOCK
 *
 * Mostra exatamente o objeto oficial retornado
 * pela campanha para um único MLB.
 *
 * SOMENTE LEITURA.
 */
if (
  String(itemId) ===
  "MLB7305856516"
) {
  console.log(
    "\n=================================================="
  );
  console.log(
    "DEBUG UNHEALTHY_STOCK — RETORNO OFICIAL ML"
  );
  console.log(
    "=================================================="
  );
  console.log(
    "itemId:",
    itemId
  );
  console.log(
    "promotionId:",
    promotionId
  );
  console.log(
    "officialItem encontrado:",
    Boolean(officialItem)
  );

  console.dir(
    officialItem,
    {
      depth: null,
      colors: true,
    }
  );

  console.log(
    "==================================================\n"
  );
}


  /**
   * TRAVA ABSOLUTA:
   *
   * price precisa existir no retorno oficial.
   */
  if (
    !validPrice(
      officialItem?.price
    )
  ) {
    throw new Error(
      `${itemId}: campanha ${promotionId} não retornou ` +
      `price oficial válido. Nenhum preço será calculado.`
    );
  }


  return officialItem;
}


/**
 * ============================================================
 * ENRIQUECER UNHEALTHY_STOCK
 * ============================================================
 */

async function enrichUnhealthyStock(
  itemId,
  promotion
) {

  if (
    promotion?.type !==
    "UNHEALTHY_STOCK"
  ) {
    return promotion;
  }


  /**
   * Se price já veio oficialmente no retorno do item,
   * não precisamos consultar a campanha.
   */
  if (
    validPrice(
      promotion?.price
    )
  ) {

    return {
      ...promotion,

      official_price:
        Number(
          promotion.price
        ),

      official_price_source:
        "ITEM_PROMOTIONS",

      price_was_calculated:
        false,
    };
  }


  const promotionId =
    promotion?.id ??
    promotion?.promotion_id ??
    null;


  if (!promotionId) {

    return {
      ...promotion,

      official_price:
        null,

      official_price_source:
        null,

      price_was_calculated:
        false,

      enrichment_error:
        "UNHEALTHY_STOCK sem promotion_id para buscar price oficial.",
    };
  }


  try {

    const officialItem =
      await getOfficialUnhealthyItem({
        itemId,
        promotionId,
      });


    /**
     * Copiamos apenas dados recebidos oficialmente.
     */
    return {
      ...promotion,

      price:
        officialItem.price,

      original_price:
        officialItem.original_price ??
        promotion.original_price ??
        null,

      offer_id:
        officialItem.offer_id ??
        promotion.offer_id ??
        null,

      ref_id:
        officialItem.ref_id ??
        promotion.ref_id ??
        null,

      seller_percentage:
        officialItem.seller_percentage ??
        promotion.seller_percentage ??
        null,

      meli_percentage:
        officialItem.meli_percentage ??
        promotion.meli_percentage ??
        null,

      boosted_offer:
        officialItem.boosted_offer ??
        promotion.boosted_offer ??
        false,

      discount_meli_boost_amount:
        officialItem
          .discount_meli_boost_amount ??
        promotion
          .discount_meli_boost_amount ??
        null,

      discount_meli_boosted_percentage:
        officialItem
          .discount_meli_boosted_percentage ??
        officialItem
          .discount_meli_boost_percentage ??
        promotion
          .discount_meli_boosted_percentage ??
        promotion
          .discount_meli_boost_percentage ??
        null,

      total_price_for_boosted_offer:
        officialItem
          .total_price_for_boosted_offer ??
        promotion
          .total_price_for_boosted_offer ??
        null,

      start_date:
        officialItem.start_date ??
        promotion.start_date ??
        null,

      finish_date:
        officialItem.finish_date ??
        officialItem.end_date ??
        promotion.finish_date ??
        promotion.end_date ??
        null,


      /**
       * AUDITORIA
       */

      official_price:
        Number(
          officialItem.price
        ),

      official_price_source:
        "UNHEALTHY_STOCK_CAMPAIGN",

      price_was_calculated:
        false,

      official_campaign_item:
        officialItem,

      enrichment_error:
        null,
    };

  } catch (err) {

    return {
      ...promotion,

      official_price:
        null,

      official_price_source:
        null,

      price_was_calculated:
        false,

      enrichment_error:
        err?.response?.data ??
        err?.mlBody ??
        err?.message ??
        String(err),
    };
  }
}


/**
 * ============================================================
 * ENRIQUECER PROMOÇÕES
 * ============================================================
 */

export async function enrichPromotions(
  itemId,
  promotions
) {

  if (
    !Array.isArray(promotions)
  ) {
    return [];
  }


  const enriched = [];


  for (
    const promotion
    of promotions
  ) {

    if (
      promotion?.type ===
      "UNHEALTHY_STOCK"
    ) {

      enriched.push(
        await enrichUnhealthyStock(
          itemId,
          promotion
        )
      );

      continue;
    }


    enriched.push(
      promotion
    );
  }


  return enriched;
}


/**
 * ============================================================
 * BUSCAR + ENRIQUECER
 * ============================================================
 */

export async function getEnrichedItemPromotions(
  itemId
) {

  const promotions =
    await getItemPromotions(
      itemId
    );


  return await enrichPromotions(
    itemId,
    promotions
  );
}


/**
 * ============================================================
 * PREÇO PARA ANÁLISE
 * ============================================================
 *
 * ESTA FUNÇÃO NÃO CALCULA PREÇO.
 *
 * Apenas seleciona um valor de preço explicitamente
 * retornado pelo Mercado Livre.
 */

export function getAnalysisPrice(
  promotion
) {

  if (!promotion) {
    return null;
  }


  switch (
    promotion.type
  ) {

    /**
     * Estes três tipos exigem PRICE oficial.
     */

    case "UNHEALTHY_STOCK":
    case "BANK":
    case "PRICE_MATCHING":

      return validPrice(
        promotion.price
      )
        ? Number(
            promotion.price
          )
        : null;


    /**
     * SMART / PRE_NEGOTIATED
     */

    case "SMART":
    case "PRE_NEGOTIATED":

      if (
        validPrice(
          promotion.price
        )
      ) {
        return Number(
          promotion.price
        );
      }


      if (
        validPrice(
          promotion
            .suggested_discounted_price
        )
      ) {
        return Number(
          promotion
            .suggested_discounted_price
        );
      }


      return null;


    /**
     * LIGHTNING / DEAL / DOD
     */

    case "LIGHTNING":
    case "DEAL":
    case "DOD":

      if (
        validPrice(
          promotion
            .suggested_discounted_price
        )
      ) {
        return Number(
          promotion
            .suggested_discounted_price
        );
      }


      if (
        validPrice(
          promotion.price
        )
      ) {
        return Number(
          promotion.price
        );
      }


      if (
        validPrice(
          promotion
            .max_discounted_price
        )
      ) {
        return Number(
          promotion
            .max_discounted_price
        );
      }


      return null;


    /**
     * PRICE_DISCOUNT
     *
     * Mantemos separado porque nesta modalidade o vendedor
     * pode definir o preço dentro das regras permitidas.
     *
     * A otimização para margem-alvo será tratada em módulo
     * próprio, não aqui.
     */

    case "PRICE_DISCOUNT":

      if (
        validPrice(
          promotion
            .max_discounted_price
        )
      ) {
        return Number(
          promotion
            .max_discounted_price
        );
      }


      if (
        validPrice(
          promotion.price
        )
      ) {
        return Number(
          promotion.price
        );
      }


      if (
        validPrice(
          promotion
            .suggested_discounted_price
        )
      ) {
        return Number(
          promotion
            .suggested_discounted_price
        );
      }


      return null;


    default:

      return null;
  }
}


/**
 * ============================================================
 * NORMALIZAR PROMOÇÃO
 * ============================================================
 */

export function normalizePromotion(
  promotion
) {

  const explicitPrice =
    validPrice(
      promotion?.price
    )
      ? Number(
          promotion.price
        )
      : null;


  return {

    id:
      promotion?.id ??
      null,

    type:
      promotion?.type ??
      null,

    subType:
      promotion?.sub_type ??
      null,

    name:
      promotion?.name ??
      null,

    status:
      promotion?.status ??
      null,

    refId:
      promotion?.ref_id ??
      null,

    offerId:
      promotion?.offer_id ??
      promotion?.ref_id ??
      null,


    /**
     * PREÇOS
     */

    price:
      explicitPrice,

    originalPrice:
      numberOrNull(
        promotion?.original_price
      ),

    minDiscountedPrice:
      numberOrNull(
        promotion
          ?.min_discounted_price
      ),

    maxDiscountedPrice:
      numberOrNull(
        promotion
          ?.max_discounted_price
      ),

    suggestedDiscountedPrice:
      numberOrNull(
        promotion
          ?.suggested_discounted_price
      ),


    /**
     * AUDITORIA DO PRICE
     */

    officialPrice:
      numberOrNull(
        promotion?.official_price
      ) ??
      explicitPrice,

    officialPriceSource:
      promotion
        ?.official_price_source ??
      (
        explicitPrice !== null
          ? "ITEM_PROMOTIONS"
          : null
      ),

    priceWasCalculated:
      promotion
        ?.price_was_calculated ===
      true,


    /**
     * PARTICIPAÇÕES
     *
     * IMPORTANTE:
     *
     * meliPercentage é INFORMATIVO.
     * Não significa abatimento automático da tarifa.
     */

    sellerPercentage:
      numberOrNull(
        promotion
          ?.seller_percentage
      ),

    meliPercentage:
      numberOrNull(
        promotion
          ?.meli_percentage
      ),


    /**
     * BOOST
     */

    boostedOffer:
      promotion?.boosted_offer ===
      true,

    discountMeliBoostAmount:
      numberOrNull(
        promotion
          ?.discount_meli_boost_amount
      ),

    discountMeliBoostedPercentage:
      numberOrNull(
        promotion
          ?.discount_meli_boosted_percentage ??
        promotion
          ?.discount_meli_boost_percentage
      ),

    totalPriceForBoostedOffer:
      numberOrNull(
        promotion
          ?.total_price_for_boosted_offer
      ),


    /**
     * ESTOQUE
     */

    stock:
      promotion?.stock ??
      null,


    /**
     * DATAS
     */

    startDate:
      promotion?.start_date ??
      null,

    finishDate:
      promotion?.finish_date ??
      promotion?.end_date ??
      null,


    /**
     * ENRIQUECIMENTO
     */

    enrichmentError:
      promotion
        ?.enrichment_error ??
      null,

    officialCampaignItem:
      promotion
        ?.official_campaign_item ??
      null,
  };
}


/**
 * ============================================================
 * BENEFÍCIO NOS CUSTOS POR VENDA
 * ============================================================
 *
 * CORREÇÃO IMPORTANTE:
 *
 * meli_percentage NÃO entra aqui.
 *
 * Não fazemos mais:
 *
 * original_price * meli_percentage
 *
 * como abatimento da tarifa.
 *
 * Neste momento, somente usamos um benefício quando o ML
 * retorna explicitamente um valor de redução nos custos
 * por venda:
 *
 * discount_meli_boost_amount
 *
 * ============================================================
 */

export function getPromotionFeeBenefit(
  promotion
) {

  if (!promotion) {
    return 0;
  }


  /**
   * Sem BOOST explicitamente informado:
   * benefício de tarifa = ZERO.
   */
  if (
    promotion
      ?.boosted_offer !==
    true
  ) {
    return 0;
  }


  const boostAmount =
    numberOrNull(
      promotion
        ?.discount_meli_boost_amount
    );


  if (
    boostAmount === null ||
    boostAmount <= 0
  ) {
    return 0;
  }


  return boostAmount;
}


/**
 * ============================================================
 * CONTEXTO FINANCEIRO INDIVIDUAL
 * ============================================================
 */

export function getOpportunityFinancialContext(
  promotion
) {

  if (!promotion) {

    return {
      valid: false,

      reason:
        "Promoção não informada.",
    };
  }


  const type =
    promotion?.type ??
    null;


  /**
   * Se houve erro ao buscar informações oficiais,
   * bloqueamos a análise.
   */
  if (
    promotion
      ?.enrichment_error
  ) {

    return {
      valid: false,

      reason:
        promotion
          .enrichment_error,

      type,
    };
  }


  /**
   * TRAVA:
   *
   * Nunca aceitar um preço marcado como calculado.
   */
  if (
    promotion
      ?.price_was_calculated ===
    true
  ) {

    return {
      valid: false,

      reason:
        `${type}: price calculado/inferido não é permitido.`,

      type,
    };
  }


  const rawPrice =
    getAnalysisPrice(
      promotion
    );


  const price =
    rawPrice !== null
      ? Number(rawPrice)
      : NaN;


  const originalPrice =
    numberOrNull(
      promotion
        ?.original_price
    );


  const sellerPercentage =
    numberOrNull(
      promotion
        ?.seller_percentage
    );


  const meliPercentage =
    numberOrNull(
      promotion
        ?.meli_percentage
    );


  const boostAmount =
    numberOrNull(
      promotion
        ?.discount_meli_boost_amount
    ) ?? 0;


  const boostedBuyerPrice =
    numberOrNull(
      promotion
        ?.total_price_for_boosted_offer
    );


  /**
   * ==========================================================
   * TIPOS QUE EXIGEM PRICE OFICIAL
   * ==========================================================
   */

  const officialPriceTypes =
    new Set([
      "BANK",
      "PRICE_MATCHING",
      "UNHEALTHY_STOCK",
    ]);


  if (
    officialPriceTypes.has(
      type
    )
  ) {

    if (
      !Number.isFinite(
        price
      ) ||
      price <= 0
    ) {

      return {
        valid: false,

        reason:
          `${type}: price oficial não encontrado. ` +
          `Nenhum preço será calculado ou inferido.`,

        type,
      };
    }


    if (
      originalPrice === null ||
      originalPrice <= 0
    ) {

      return {
        valid: false,

        reason:
          `${type}: original_price ausente ou inválido.`,

        type,

        price,
      };
    }


    if (
      price >
      originalPrice
    ) {

      return {
        valid: false,

        reason:
          `${type}: price oficial maior que original_price.`,

        type,

        price,

        originalPrice,
      };
    }


    if (
      sellerPercentage !== null &&
      sellerPercentage < 0
    ) {

      return {
        valid: false,

        reason:
          `${type}: seller_percentage inválido.`,

        type,

        price,

        originalPrice,
      };
    }


    if (
      meliPercentage !== null &&
      meliPercentage < 0
    ) {

      return {
        valid: false,

        reason:
          `${type}: meli_percentage inválido.`,

        type,

        price,

        originalPrice,
      };
    }


    const feeBenefit =
      getPromotionFeeBenefit(
        promotion
      );


    const observedDiscountAmount =
      Math.max(
        0,
        originalPrice -
        price
      );


    const observedDiscountPercentage =
      originalPrice > 0
        ? (
            observedDiscountAmount /
            originalPrice
          ) * 100
        : 0;


    return {

      valid: true,

      reason: null,

      type,

      price,

      originalPrice,

      sellerPercentage:
        sellerPercentage ?? 0,

      meliPercentage:
        meliPercentage ?? 0,


      /**
       * IMPORTANTE:
       *
       * Este benefício NÃO contém meli_percentage.
       */
      feeBenefit,


      /**
       * Participação do ML fica separada
       * apenas para auditoria.
       */
      meliContributionPercentage:
        meliPercentage ?? 0,


      observedDiscountAmount,

      observedDiscountPercentage,

      officialPrice: true,

      officialPriceSource:
        promotion
          ?.official_price_source ??
        "ITEM_PROMOTIONS",

      priceWasCalculated:
        false,

      boosted:
        promotion
          ?.boosted_offer ===
        true,

      boostAmount,

      boostedBuyerPrice,
    };
  }


  /**
   * ==========================================================
   * DEMAIS TIPOS
   * ==========================================================
   */

  const valid =
    Number.isFinite(
      price
    ) &&
    price > 0;


  return {

    valid,

    reason:
      valid
        ? null
        : `${type}: preço válido não encontrado.`,

    type,

    price:
      valid
        ? price
        : null,

    originalPrice,

    sellerPercentage:
      sellerPercentage ?? 0,

    meliPercentage:
      meliPercentage ?? 0,

    meliContributionPercentage:
      meliPercentage ?? 0,

    feeBenefit:
      getPromotionFeeBenefit(
        promotion
      ),

    priceWasCalculated:
      promotion
        ?.price_was_calculated ===
      true,

    boosted:
      promotion
        ?.boosted_offer ===
      true,

    boostAmount,

    boostedBuyerPrice,
  };
}


/**
 * ============================================================
 * DADOS FINANCEIROS
 * ============================================================
 */

export function getPromotionFinancialData(
  promotion
) {

  const context =
    getOpportunityFinancialContext(
      promotion
    );


  return {

    price:
      context?.price ??
      null,

    feeBenefit:
      context?.feeBenefit ??
      0,

    contextValid:
      context?.valid ===
      true,

    contextReason:
      context?.reason ??
      null,

    originalPrice:
      numberOrNull(
        promotion
          ?.original_price
      ),

    sellerPercentage:
      numberOrNull(
        promotion
          ?.seller_percentage
      ) ?? 0,

    meliPercentage:
      numberOrNull(
        promotion
          ?.meli_percentage
      ) ?? 0,


    /**
     * Participação do ML no desconto.
     *
     * INFORMATIVO.
     * Não entra automaticamente como redução da tarifa.
     */
    meliContributionPercentage:
      numberOrNull(
        promotion
          ?.meli_percentage
      ) ?? 0,


    observedDiscountAmount:
      context
        ?.observedDiscountAmount ??
      null,

    observedDiscountPercentage:
      context
        ?.observedDiscountPercentage ??
      null,

    officialPrice:
      context
        ?.officialPrice ===
      true,

    officialPriceSource:
      context
        ?.officialPriceSource ??
      null,

    priceWasCalculated:
      context
        ?.priceWasCalculated ===
      true,


    /**
     * BOOST
     */

    boosted:
      promotion
        ?.boosted_offer ===
      true,

    boostAmount:
      numberOrNull(
        promotion
          ?.discount_meli_boost_amount
      ) ?? 0,

    boostPercentage:
      numberOrNull(
        promotion
          ?.discount_meli_boosted_percentage ??
        promotion
          ?.discount_meli_boost_percentage
      ) ?? 0,

    boostedBuyerPrice:
      numberOrNull(
        promotion
          ?.total_price_for_boosted_offer
      ),
  };
}


/**
 * ============================================================
 * NORMALIZAR LISTA
 * ============================================================
 */

export function normalizePromotions(
  promotions
) {

  if (
    !Array.isArray(
      promotions
    )
  ) {
    return [];
  }


  return promotions.map(
    (promotion) => {

      const normalized =
        normalizePromotion(
          promotion
        );


      const financialData =
        getPromotionFinancialData(
          promotion
        );


      /**
       * TIPOS QUE JÁ PODEMOS ANALISAR.
       */
      const analyzableTypes =
        new Set([
          "SMART",
          "DEAL",
          "LIGHTNING",
          "PRICE_DISCOUNT",
          "DOD",
          "PRE_NEGOTIATED",

          "BANK",
          "PRICE_MATCHING",
          "UNHEALTHY_STOCK",
        ]);


      /**
       * TIPOS CUJO POST JÁ ESTAVA LIBERADO.
       *
       * BANK / PRICE_MATCHING / UNHEALTHY_STOCK
       * permanecem bloqueados para POST.
       */
      const applicableTypes =
      new Set([
        "SMART",
        "DEAL",
        "LIGHTNING",
        "PRICE_DISCOUNT",
        "DOD",
        "PRE_NEGOTIATED",
        "UNHEALTHY_STOCK",
      ]);


      const typeSupportsAnalysis =
        analyzableTypes.has(
          normalized.type
        );


      const canAnalyze =
        typeSupportsAnalysis &&
        financialData
          .contextValid ===
          true;


      const canApply =
        applicableTypes.has(
          normalized.type
        );


      const stockMin =
        numberOrNull(
          promotion
            ?.stock
            ?.min
        );


      const stockMax =
        numberOrNull(
          promotion
            ?.stock
            ?.max
        );


      return {

        /**
         * IDENTIFICADOR INTERNO
         */

        key:
          normalized.refId ??
          normalized.offerId ??
          normalized.id ??
          `${
            normalized.type ??
            "UNKNOWN"
          }-${Math.random()}`,


        /**
         * IDENTIFICADORES
         */

        id:
          normalized.id,

        refId:
          normalized.refId,

        offerId:
          normalized.offerId,


        /**
         * PRINCIPAIS
         */

        type:
          normalized.type,

        subType:
          normalized.subType,

        name:
          normalized.name,

        status:
          normalized.status,


        /**
         * PREÇOS
         */

        originalPrice:
          normalized
            .originalPrice,

        buyerPrice:
          financialData.price,

        minPrice:
          normalized
            .minDiscountedPrice,

        maxPrice:
          normalized
            .maxDiscountedPrice,

        suggestedPrice:
          normalized
            .suggestedDiscountedPrice,


        /**
         * AUDITORIA DO PRICE
         */

        officialPrice:
          normalized
            .officialPrice,

        officialPriceSource:
          normalized
            .officialPriceSource,

        priceWasCalculated:
          normalized
            .priceWasCalculated ===
          true,


        /**
         * PARTICIPAÇÕES
         */

        sellerPercentage:
          normalized
            .sellerPercentage,

        meliPercentage:
          normalized
            .meliPercentage,

        meliContributionPercentage:
          financialData
            .meliContributionPercentage,


        /**
         * BENEFÍCIO DE CUSTO
         *
         * NÃO contém meli_percentage.
         */

        campaignBenefit:
          financialData
            .feeBenefit,

        feeBenefit:
          financialData
            .feeBenefit,


        /**
         * BOOST
         */

        boostedOffer:
          normalized
            .boostedOffer ===
          true,

        boostBenefit:
          normalized
            .discountMeliBoostAmount ??
          0,

        boostPercentage:
          normalized
            .discountMeliBoostedPercentage ??
          0,

        boostedBuyerPrice:
          normalized
            .totalPriceForBoostedOffer,


        /**
         * CONTEXTO FINANCEIRO
         */

        financialContextValid:
          financialData
            .contextValid,

        financialContextReason:
          financialData
            .contextReason,

        observedDiscountAmount:
          financialData
            .observedDiscountAmount,

        observedDiscountPercentage:
          financialData
            .observedDiscountPercentage,


        /**
         * ESTOQUE
         */

        stockMin,

        stockMax,


        /**
         * DATAS
         */

        startDate:
          normalized
            .startDate,

        finishDate:
          normalized
            .finishDate,


        /**
         * ENRIQUECIMENTO
         */

        enrichmentError:
          normalized
            .enrichmentError,

        officialCampaignItem:
          normalized
            .officialCampaignItem,


        /**
         * FLAGS
         */

        knownType:
          typeSupportsAnalysis ||
          normalized.type ===
            "SELLER_COUPON_CAMPAIGN" ||
          normalized.type ===
            "PRICE_MATCHING_MELI_ALL" ||
          normalized.type ===
            "MARKETPLACE_CAMPAIGN" ||
          normalized.type ===
            "VOLUME" ||
          normalized.type ===
            "SELLER_CAMPAIGN",


        canAnalyze,

        canApply,


        /**
         * BLOQUEIO DA ANÁLISE
         */

        analysisBlockReason:
          canAnalyze
            ? null
            : (
                typeSupportsAnalysis
                  ? (
                      financialData
                        .contextReason ??
                      "Oportunidade sem contexto financeiro válido."
                    )
                  : getAnalysisBlockReason(
                      normalized.type
                    )
              ),


        /**
         * BLOQUEIO DO POST
         */

        applyBlockReason:
          canApply
            ? null
            : getApplyBlockReason(
                normalized.type
              ),


        /**
         * RAW
         */

        raw:
          promotion,
      };
    }
  );
}


/**
 * ============================================================
 * BUSCAR + ENRIQUECER + NORMALIZAR
 * ============================================================
 */

export async function getNormalizedItemPromotions(
  itemId
) {

  const enriched =
    await getEnrichedItemPromotions(
      itemId
    );


  return normalizePromotions(
    enriched
  );
}


/**
 * ============================================================
 * STATUS
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


/**
 * ============================================================
 * MOTIVOS DE BLOQUEIO DA ANÁLISE
 * ============================================================
 */

function getAnalysisBlockReason(
  type
) {

  switch (type) {

    case "BANK":

      return (
        "BANK sem price oficial ou contexto financeiro suficiente."
      );


    case "SELLER_COUPON_CAMPAIGN":

      return (
        "Cupom configurado para operação manual."
      );


    case "PRICE_MATCHING":

      return (
        "PRICE_MATCHING sem price oficial ou contexto financeiro suficiente."
      );


    case "PRICE_MATCHING_MELI_ALL":

      return (
        "PRICE_MATCHING_MELI_ALL será tratado como promoção automática do Mercado Livre."
      );


    case "UNHEALTHY_STOCK":

      return (
        "UNHEALTHY_STOCK sem price oficial ou contexto financeiro suficiente."
      );


    case "MARKETPLACE_CAMPAIGN":

      return (
        "MARKETPLACE_CAMPAIGN ainda não possui regra financeira validada."
      );


    case "VOLUME":

      return (
        "VOLUME ainda não possui regra financeira validada."
      );


    case "SELLER_CAMPAIGN":

      return (
        "SELLER_CAMPAIGN ainda não possui regra financeira validada."
      );


    default:

      return (
        "Tipo de promoção ainda não possui regra financeira validada."
      );
  }
}


/**
 * ============================================================
 * MOTIVOS DE BLOQUEIO DO POST
 * ============================================================
 */

function getApplyBlockReason(
  type
) {

  switch (type) {

    case "BANK":

      return (
        "BANK liberada somente para análise. POST automático ainda não validado."
      );


    case "SELLER_COUPON_CAMPAIGN":

      return (
        "Cupons são gerenciados manualmente."
      );


    case "PRICE_MATCHING":
      return null;


    case "PRICE_MATCHING_MELI_ALL":

      return (
        "PRICE_MATCHING_MELI_ALL é gerenciada automaticamente pelo Mercado Livre."
      );


    case "UNHEALTHY_STOCK":
      return (
        "UNHEALTHY_STOCK liberada somente para análise. POST automático ainda não validado."
      );


    case "MARKETPLACE_CAMPAIGN":

      return (
        "MARKETPLACE_CAMPAIGN ainda não está habilitada para aplicação automática."
      );


    case "VOLUME":

      return (
        "VOLUME ainda não está habilitada para aplicação automática."
      );


    case "SELLER_CAMPAIGN":

      return (
        "SELLER_CAMPAIGN ainda não está habilitada para aplicação automática."
      );


    default:

      return (
        "Tipo de promoção ainda não está habilitado para aplicação automática."
      );
  }
}