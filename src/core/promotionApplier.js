import { ml } from "./mlClient.js";

/**
 * ============================================================
 * PROMOTION APPLIER
 * ============================================================
 *
 * Responsável SOMENTE pelo envio da promoção ao Mercado Livre.
 *
 * Ele NÃO decide:
 *
 * - se a promoção é rentável;
 * - se deve ser aplicada;
 * - se está dentro da margem;
 * - qual promoção escolher.
 *
 * Essas decisões ficam fora deste módulo.
 *
 * ============================================================
 */


/**
 * ------------------------------------------------------------
 * FORMATAR DATA LOCAL
 * ------------------------------------------------------------
 *
 * PRICE_DISCOUNT exige datas locais sem Z / UTC.
 */

function formatLocalDateTime(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  const hours =
    String(
      date.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  const seconds =
    String(
      date.getSeconds()
    ).padStart(2, "0");

  return (
    `${year}-${month}-${day}` +
    `T${hours}:${minutes}:${seconds}`
  );
}


/**
 * ------------------------------------------------------------
 * DATAS PRICE_DISCOUNT
 * ------------------------------------------------------------
 *
 * Mantemos a duração máxima que validamos:
 *
 * 14 dias.
 */

function buildPriceDiscountDates() {
  const start =
    new Date();

  const finish =
    new Date(start);

  finish.setDate(
    finish.getDate() + 14
  );

  return {
    startDate:
      formatLocalDateTime(start),

    finishDate:
      formatLocalDateTime(finish),
  };
}


/**
 * ------------------------------------------------------------
 * ESTOQUE ATUAL
 * ------------------------------------------------------------
 */

async function getAvailableStock(
  itemId
) {
  const item =
    await ml.get(
      `/items/${itemId}`
    );

  return Number(
    item?.available_quantity ?? 0
  );
}


/**
 * ============================================================
 * APLICAR PROMOÇÃO
 * ============================================================
 */

export async function applyPromotion({
  itemId,
  promotion,
}) {

  if (!itemId) {
    throw new Error(
      "itemId não informado."
    );
  }

  if (!promotion) {
    throw new Error(
      "Promoção não informada."
    );
  }


  const type =
    promotion.type;

  const promotionId =
    promotion.id ?? null;

  const offerId =
    promotion.offerId ??
    promotion.refId ??
    promotion.ref_id ??
    null;

  const analysisPrice =
    Number(
      promotion.buyerPrice
    );


  /**
   * Proteção geral do preço.
   */

  if (
    !Number.isFinite(
      analysisPrice
    ) ||
    analysisPrice <= 0
  ) {
    throw new Error(
      `${type}: preço inválido para aplicação.`
    );
  }


  /**
   * ==========================================================
   * LIGHTNING
   * ==========================================================
   */

if (type === "LIGHTNING") {

  const minStock =
    Number(promotion.stockMin);

  const maxStock =
    Number(promotion.stockMax);

  if (
    !Number.isFinite(minStock) ||
    !Number.isFinite(maxStock)
  ) {
    throw new Error(
      "LIGHTNING sem limites de estoque válidos."
    );
  }

  const availableStock =
    await getAvailableStock(itemId);

  if (availableStock <= minStock) {
    throw new Error(
      `LIGHTNING ignorada: estoque atual ${availableStock}, ` +
      `mínimo exigido superior a ${minStock}.`
    );
  }

  if (availableStock >= maxStock) {
    throw new Error(
      `LIGHTNING ignorada: estoque atual ${availableStock}, ` +
      `máximo permitido inferior a ${maxStock}.`
    );
  }

  return await ml.post(
    `/seller-promotions/items/${itemId}`,
    {
      deal_price: analysisPrice,
      stock: availableStock,
      promotion_type: "LIGHTNING",
    }
  );
}


  /**
   * ==========================================================
   * SMART
   * ==========================================================
   */

  if (
    type === "SMART"
  ) {

    if (!promotionId) {
      throw new Error(
        "SMART sem promotion_id."
      );
    }


    if (!offerId) {
      throw new Error(
        "SMART sem offer_id/ref_id."
      );
    }


    return await ml.post(
      `/seller-promotions/items/${itemId}`,
      {
        promotion_id:
          promotionId,

        promotion_type:
          "SMART",

        offer_id:
          offerId,
      }
    );
  }


  /**
   * ==========================================================
   * PRE_NEGOTIATED
   * ==========================================================
   */

  if (
    type === "PRE_NEGOTIATED"
  ) {

    if (!promotionId) {
      throw new Error(
        "PRE_NEGOTIATED sem promotion_id."
      );
    }


    if (!offerId) {
      throw new Error(
        "PRE_NEGOTIATED sem offer_id/ref_id."
      );
    }


    return await ml.post(
      `/seller-promotions/items/${itemId}`,
      {
        promotion_id:
          promotionId,

        promotion_type:
          "PRE_NEGOTIATED",

        offer_id:
          offerId,
      }
    );
  }


  /**
   * ==========================================================
   * UNHEALTHY_STOCK
   * ==========================================================
   */

  if (
  type === "UNHEALTHY_STOCK"
) {

  if (!promotionId) {
    throw new Error(
      "UNHEALTHY_STOCK sem promotion_id."
    );
  }

  if (!offerId) {
    throw new Error(
      "UNHEALTHY_STOCK sem offer_id/ref_id."
    );
  }

  /**
   * Última trava de segurança.
   *
   * A análise financeira precisa ter utilizado
   * preço oficial retornado pelo Mercado Livre.
   *
   * O preço NÃO será enviado no POST.
   */
  if (
    promotion.priceWasCalculated === true ||
    !promotion.officialPriceSource
  ) {
    throw new Error(
      "UNHEALTHY_STOCK sem preço oficial validado pelo Mercado Livre."
    );
  }

  return await ml.post(
    `/seller-promotions/items/${itemId}`,
    {
      promotion_id:
        promotionId,

      promotion_type:
        "UNHEALTHY_STOCK",

      offer_id:
        offerId,
    }
  );
}


  /**
   * ==========================================================
   * DEAL
   * ==========================================================
   */

  if (
    type === "DEAL"
  ) {

    if (!promotionId) {
      throw new Error(
        "DEAL sem promotion_id."
      );
    }


    return await ml.post(
      `/seller-promotions/items/${itemId}`,
      {
        promotion_id:
          promotionId,

        promotion_type:
          "DEAL",

        deal_price:
          analysisPrice,
      }
    );
  }


  /**
   * ==========================================================
   * DOD
   * ==========================================================
   */

  if (
  type === "DOD"
) {

  const minStock =
    Number(promotion.stockMin);

  if (
    !Number.isFinite(minStock) ||
    minStock < 0
  ) {
    throw new Error(
      "DOD sem limite mínimo de estoque válido."
    );
  }

  const availableStock =
    await getAvailableStock(
      itemId
    );

  if (
    !Number.isFinite(availableStock) ||
    availableStock < minStock
  ) {
    throw new Error(
      `DOD bloqueada por estoque. ` +
      `Disponível: ${availableStock}. ` +
      `Mínimo exigido pelo ML: ${minStock}.`
    );
  }

    return await ml.post(
      `/seller-promotions/items/${itemId}`,
      {
        deal_price:
          analysisPrice,

        promotion_type:
          "DOD",
      }
    );
  }


  /**
   * ==========================================================
   * PRICE_DISCOUNT
   * ==========================================================
   *
   * POST validado no teste real.
   *
   * Pode vir sem:
   *
   * - promotion_id
   * - ref_id
   * - offer_id
   *
   * Por isso não dependemos desses campos.
   */

  if (
    type === "PRICE_DISCOUNT"
  ) {

    const {
      startDate,
      finishDate,
    } =
      buildPriceDiscountDates();


    console.log(
      `      Início PRICE_DISCOUNT: ${startDate}`
    );

    console.log(
      `      Fim PRICE_DISCOUNT:    ${finishDate}`
    );


    return await ml.post(
      `/seller-promotions/items/${itemId}`,
      {
        deal_price:
          analysisPrice,

        start_date:
          startDate,

        finish_date:
          finishDate,

        promotion_type:
          "PRICE_DISCOUNT",
      }
    );
  }


  /**
   * ==========================================================
   * PRICE_MATCHING
   * ==========================================================
   *
   * NÃO LIBERADO.
   */

 if (
  type === "PRICE_MATCHING"
) {

  const promotionId =
    promotion.id;

  const offerId =
    promotion.offerId ??
    promotion.refId;


  if (!promotionId) {
    throw new Error(
      "PRICE_MATCHING sem promotion_id."
    );
  }


  if (!offerId) {
    throw new Error(
      "PRICE_MATCHING sem offer_id/ref_id."
    );
  }


  return await ml.post(
    `/seller-promotions/items/${itemId}`,
    {
      promotion_id:
        promotionId,

      promotion_type:
        "PRICE_MATCHING",

      offer_id:
        offerId,
    }
  );
}


  /**
   * ==========================================================
   * BANK
   * ==========================================================
   */

  if (
    type === "BANK"
  ) {
    throw new Error(
      "BANK ainda não possui aplicação validada."
    );
  }


  /**
   * ==========================================================
   * CUPONS
   * ==========================================================
   */

  if (
    type ===
    "SELLER_COUPON_CAMPAIGN"
  ) {
    throw new Error(
      "Cupons não fazem parte desta etapa."
    );
  }


  /**
   * ==========================================================
   * TIPO DESCONHECIDO
   * ==========================================================
   */

  throw new Error(
    `Aplicação não habilitada para ${type}.`
  );
}