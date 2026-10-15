import { analyzeFinancial } from "./financial.js";

import {
  getNormalizedItemPromotions,
  isCandidatePromotion,
} from "../services/promotionAnalyzer.js";


/**
 * ============================================================
 * PROMOTION REVALIDATOR
 * ============================================================
 *
 * OBJETIVO:
 *
 * Reconsultar uma oportunidade imediatamente antes do POST.
 *
 * O fato de uma promoção ter passado na análise inicial NÃO
 * significa que ela continua válida alguns segundos depois.
 *
 * Este módulo:
 *
 * 1. Reconsulta todas as promoções do MLB.
 * 2. Localiza novamente a oportunidade.
 * 3. Confirma que ainda é candidate.
 * 4. Confirma que continua analisável.
 * 5. Confirma que continua aplicável.
 * 6. Obtém preço atualizado.
 * 7. Obtém benefício ML atualizado.
 * 8. Executa financial.js novamente.
 * 9. Libera ou bloqueia o POST.
 *
 * IMPORTANTE:
 *
 * ESTE ARQUIVO NÃO APLICA PROMOÇÕES.
 *
 * REGRA ESPECIAL UNHEALTHY_STOCK:
 *
 * - exige a MESMA offer_id;
 * - não substitui silenciosamente por outra oferta;
 * - exige preço oficial retornado pelo Mercado Livre;
 * - nunca aceita preço calculado/inferido pelo bot.
 *
 * ============================================================
 */


/**
 * ============================================================
 * COMPARAR NÚMEROS
 * ============================================================
 */

function sameNumber(a, b) {

  const numberA =
    Number(a);

  const numberB =
    Number(b);

  if (
    !Number.isFinite(numberA) ||
    !Number.isFinite(numberB)
  ) {
    return false;
  }

  return (
    Math.abs(
      numberA - numberB
    ) < 0.001
  );
}


/**
 * ============================================================
 * LOCALIZAR NOVAMENTE A PROMOÇÃO
 * ============================================================
 *
 * REGRA GERAL:
 *
 * 1. refId
 * 2. offerId
 * 3. key
 * 4. id + type
 * 5. fallback estrutural
 *
 * EXCEÇÃO:
 *
 * UNHEALTHY_STOCK exige correspondência EXATA
 * da offer_id original.
 *
 * ============================================================
 */

function findCurrentPromotion(
  previousPromotion,
  currentPromotions
) {

  /**
   * ----------------------------------------------------------
   * REGRA ESTRITA — UNHEALTHY_STOCK
   * ----------------------------------------------------------
   *
   * UNHEALTHY_STOCK foi validada com offer_id.
   *
   * Se a oportunidade original possuía offerId,
   * SOMENTE a mesma offerId pode ser considerada
   * na revalidação.
   *
   * Não fazemos fallback por:
   *
   * - key
   * - promotion_id
   * - type
   * - preço
   *
   * Se a oferta original desapareceu, bloqueamos.
   */

  if (
    previousPromotion.type ===
      "UNHEALTHY_STOCK"
  ) {

    const previousOfferId =
      previousPromotion.offerId ??
      previousPromotion.refId ??
      previousPromotion.ref_id ??
      null;


    if (!previousOfferId) {
      return null;
    }


    const exactMatch =
      currentPromotions.find(
        (promotion) => {

          const currentOfferId =
            promotion.offerId ??
            promotion.refId ??
            promotion.ref_id ??
            null;


          return (
            promotion.type ===
              "UNHEALTHY_STOCK" &&

            String(currentOfferId) ===
              String(previousOfferId)
          );
        }
      );


    return exactMatch ?? null;
  }


  /**
   * ----------------------------------------------------------
   * 1. REF ID
   * ----------------------------------------------------------
   */

  if (
    previousPromotion.refId
  ) {

    const match =
      currentPromotions.find(
        (promotion) =>
          promotion.refId ===
          previousPromotion.refId
      );

    if (match) {
      return match;
    }
  }


  /**
   * ----------------------------------------------------------
   * 2. OFFER ID
   * ----------------------------------------------------------
   */

  if (
    previousPromotion.offerId
  ) {

    const match =
      currentPromotions.find(
        (promotion) =>
          promotion.offerId ===
          previousPromotion.offerId
      );

    if (match) {
      return match;
    }
  }


  /**
   * ----------------------------------------------------------
   * 3. KEY
   * ----------------------------------------------------------
   */

  if (
    previousPromotion.key
  ) {

    const match =
      currentPromotions.find(
        (promotion) =>
          promotion.key ===
          previousPromotion.key
      );

    if (match) {
      return match;
    }
  }


  /**
   * ----------------------------------------------------------
   * 4. ID + TYPE
   * ----------------------------------------------------------
   *
   * Só usamos quando existe ID.
   */

  if (
    previousPromotion.id &&
    previousPromotion.type
  ) {

    const matches =
      currentPromotions.filter(
        (promotion) =>
          promotion.id ===
            previousPromotion.id &&
          promotion.type ===
            previousPromotion.type
      );


    /**
     * Se existir somente uma, é seguro.
     */

    if (
      matches.length === 1
    ) {
      return matches[0];
    }


    /**
     * Se existirem várias com mesmo ID,
     * tentamos preço.
     *
     * Isso é especialmente importante porque já vimos
     * várias LIGHTNING com o mesmo promotion.id.
     */

    if (
      matches.length > 1
    ) {

      const priceMatch =
        matches.find(
          (promotion) =>
            sameNumber(
              promotion.buyerPrice,
              previousPromotion.buyerPrice
            )
        );

      if (priceMatch) {
        return priceMatch;
      }
    }
  }


  /**
   * ----------------------------------------------------------
   * 5. FALLBACK ESTRUTURAL
   * ----------------------------------------------------------
   *
   * Para promoções sem ID/ref.
   *
   * Exemplo:
   *
   * PRICE_DISCOUNT
   */

  const structuralMatches =
    currentPromotions.filter(
      (promotion) =>
        promotion.type ===
        previousPromotion.type
    );


  /**
   * Nenhuma do mesmo tipo.
   */

  if (
    structuralMatches.length === 0
  ) {
    return null;
  }


  /**
   * Apenas uma promoção do tipo.
   */

  if (
    structuralMatches.length === 1
  ) {
    return structuralMatches[0];
  }


  /**
   * Mais de uma:
   *
   * tentamos preço original.
   */

  const originalPriceMatches =
    structuralMatches.filter(
      (promotion) =>
        sameNumber(
          promotion.originalPrice,
          previousPromotion.originalPrice
        )
    );


  if (
    originalPriceMatches.length === 1
  ) {
    return originalPriceMatches[0];
  }


  /**
   * Última tentativa:
   *
   * preço comprador.
   */

  const buyerPriceMatches =
    structuralMatches.filter(
      (promotion) =>
        sameNumber(
          promotion.buyerPrice,
          previousPromotion.buyerPrice
        )
    );


  if (
    buyerPriceMatches.length === 1
  ) {
    return buyerPriceMatches[0];
  }


  /**
   * Ambiguidade.
   *
   * Por segurança NÃO escolhemos nenhuma.
   */

  return null;
}


/**
 * ============================================================
 * RESULTADO BLOQUEADO
 * ============================================================
 */

function blockedResult({
  reason,
  previousPromotion,
  currentPromotion = null,
  analysis = null,
}) {

  return {
    approved: false,
    reason,

    previousPromotion,
    currentPromotion,

    analysis,
  };
}


/**
 * ============================================================
 * REVALIDAR PROMOÇÃO
 * ============================================================
 */

export async function revalidatePromotion({
  itemId,
  promotion,
  selectedPrice = null,
  structuralOnly = false,
}) {

  if (!itemId) {
    throw new Error(
      "revalidatePromotion: itemId não informado."
    );
  }


  if (!promotion) {
    throw new Error(
      "revalidatePromotion: promoção não informada."
    );
  }


  /**
   * ==========================================================
   * 1. RECONSULTAR MERCADO LIVRE
   * ==========================================================
   */
/**
 * ==========================================================
 * 1. RECONSULTAR + ENRIQUECER + NORMALIZAR
 * ==========================================================
 *
 * IMPORTANTE:
 *
 * getNormalizedItemPromotions() executa novamente:
 *
 * 1. consulta das promoções atuais do MLB;
 * 2. enriquecimento de UNHEALTHY_STOCK pelo endpoint
 *    oficial da campanha;
 * 3. obtenção de price + offer_id oficiais;
 * 4. normalização.
 *
 * Nenhum preço de UNHEALTHY_STOCK é calculado
 * ou inferido pelo bot.
 */

const currentPromotions =
  await getNormalizedItemPromotions(
    itemId
  );


  /**
   * ==========================================================
   * 3. LOCALIZAR MESMA OPORTUNIDADE
   * ==========================================================
   */

  const currentPromotion =
    findCurrentPromotion(
      promotion,
      currentPromotions
    );


  if (!currentPromotion) {

    const reason =
      promotion.type ===
        "UNHEALTHY_STOCK"
        ? (
          "UNHEALTHY_STOCK original não foi localizada novamente " +
          "com a mesma offer_id."
        )
        : (
          "A oportunidade não foi localizada novamente ou ficou ambígua."
        );


    return blockedResult({
      reason,

      previousPromotion:
        promotion,
    });
  }


  /**
   * ==========================================================
   * 4. CONFIRMAR STATUS
   * ==========================================================
   */

  if (
    !isCandidatePromotion(
      currentPromotion
    )
  ) {

    return blockedResult({
      reason:
        `A promoção não é mais candidate. ` +
        `Status atual: ${
          currentPromotion.status ??
          "N/D"
        }.`,

      previousPromotion:
        promotion,

      currentPromotion,
    });
  }


  /**
   * ==========================================================
   * 5. CONFIRMAR ANÁLISE
   * ==========================================================
   */

  if (
    !currentPromotion.canAnalyze
  ) {

    return blockedResult({
      reason:
        currentPromotion.analysisBlockReason ??
        "A promoção não pode mais ser analisada financeiramente.",

      previousPromotion:
        promotion,

      currentPromotion,
    });
  }


  /**
   * ==========================================================
   * 6. CONFIRMAR CAPACIDADE DE POST
   * ==========================================================
   */

  if (
    !currentPromotion.canApply
  ) {

    return blockedResult({
      reason:
        currentPromotion.applyBlockReason ??
        "A promoção não está liberada para aplicação.",

      previousPromotion:
        promotion,

      currentPromotion,
    });
  }


  /**
   * ==========================================================
   * 7. PROTEÇÃO DO PREÇO OFICIAL — UNHEALTHY_STOCK
   * ==========================================================
   *
   * Para UNHEALTHY_STOCK:
   *
   * - nunca calculamos price;
   * - nunca inferimos price;
   * - nunca reutilizamos um price sem origem oficial;
   * - priceWasCalculated não pode ser true;
   * - officialPriceSource precisa existir.
   */

  if (
    currentPromotion.type ===
      "UNHEALTHY_STOCK"
  ) {

    if (
      currentPromotion.priceWasCalculated ===
        true ||
      !currentPromotion.officialPriceSource
    ) {

      return blockedResult({
        reason:
          "UNHEALTHY_STOCK sem price oficial válido retornado pelo Mercado Livre.",

        previousPromotion:
          promotion,

        currentPromotion,
      });
    }
  }


  /**
   * ==========================================================
   * 8. PREÇO ATUAL
   * ==========================================================
   */

 const optimizedTypes =
  new Set([
    "PRICE_DISCOUNT",
    "LIGHTNING",
    "DEAL",
    "DOD",
  ]);

const hasSelectedPrice =
  Number.isFinite(
    Number(selectedPrice)
  ) &&
  Number(selectedPrice) > 0;

const currentPrice =
  optimizedTypes.has(
    currentPromotion.type
  ) &&
  hasSelectedPrice
    ? Number(selectedPrice)
    : Number(
        currentPromotion.buyerPrice
      );

      if (
  optimizedTypes.has(
    currentPromotion.type
  ) &&
  hasSelectedPrice
) {

  const currentMinPrice =
    Number(
      currentPromotion.minPrice
    );

  const currentMaxPrice =
    Number(
      currentPromotion.maxPrice
    );

  if (
    !Number.isFinite(currentMinPrice) ||
    !Number.isFinite(currentMaxPrice) ||
    currentPrice < currentMinPrice ||
    currentPrice > currentMaxPrice
  ) {
    return blockedResult({
      reason:
        `Preço otimizado não pertence mais à faixa atual do Mercado Livre. ` +
        `Preço: ${currentPrice}. ` +
        `Faixa atual: ${currentMinPrice} → ${currentMaxPrice}.`,

      previousPromotion:
        promotion,

      currentPromotion,
    });
  }
}


  if (
    !Number.isFinite(
      currentPrice
    ) ||
    currentPrice <= 0
  ) {

    return blockedResult({
      reason:
        "Preço atualizado inválido.",

      previousPromotion:
        promotion,

      currentPromotion,
    });
  }


  /**
   * ==========================================================
   * 9. BENEFÍCIO ML ATUAL
   * ==========================================================
   */

  const currentFeeBenefit =
    Number(
      currentPromotion.feeBenefit ?? 0
    );


  /**
   * ==========================================================
   * 10. RECALCULAR FINANCEIRO
   * ==========================================================
   */

  let analysis;


  try {

    analysis =
      await analyzeFinancial({

        itemId,

        price:
          currentPrice,

        feeBenefit:
          Number.isFinite(
            currentFeeBenefit
          )
            ? currentFeeBenefit
            : 0,

        promotionId:
          currentPromotion.id,

        promotionType:
          currentPromotion.type,
      });


  } catch (err) {

    return blockedResult({
      reason:
        `Erro na reanálise financeira: ${
          err?.response?.data?.message ||
          err?.mlBody?.message ||
          err?.mlBody ||
          err?.message ||
          "erro desconhecido"
        }`,

      previousPromotion:
        promotion,

      currentPromotion,
    });
  }


  /**
   * ==========================================================
   * 11. VALIDAR RETORNO FINANCEIRO
   * ==========================================================
   */

  const financial =
    analysis?.financial;


  if (!financial) {

    return blockedResult({
      reason:
        "financial.js não retornou composição financeira.",

      previousPromotion:
        promotion,

      currentPromotion,

      analysis,
    });
  }


  /**
   * ==========================================================
   * 12. VALIDAR MARGEM
   * ==========================================================
   */

if (
  !financial.eligible &&
  structuralOnly !== true
) {

    return blockedResult({
      reason:
        `Margem revalidada insuficiente: ` +
        `${Number(
          financial.netMargin ?? 0
        ).toFixed(2)}% ` +
        `(mínimo ${Number(
          financial.minimumMargin ?? 0
        ).toFixed(2)}%).`,

      previousPromotion:
        promotion,

      currentPromotion,

      analysis,
    });
  }


  /**
   * ==========================================================
   * 13. APROVADO
   * ==========================================================
   */

  return {
    approved: true,

    reason: null,

    previousPromotion:
      promotion,

    currentPromotion,

    analysis,

    changes: {

      priceChanged:
        !sameNumber(
          promotion.buyerPrice,
          currentPromotion.buyerPrice
        ),

      feeBenefitChanged:
        !sameNumber(
          promotion.feeBenefit ?? 0,
          currentPromotion.feeBenefit ?? 0
        ),

      previousPrice:
        Number(
          promotion.buyerPrice
        ),

      currentPrice:
        Number(
          currentPromotion.buyerPrice
        ),

      previousFeeBenefit:
        Number(
          promotion.feeBenefit ?? 0
        ),

      currentFeeBenefit:
        Number(
          currentPromotion.feeBenefit ?? 0
        ),
    },
  };
}


/**
 * ============================================================
 * EXIBIR REVALIDAÇÃO
 * ============================================================
 */

export function printRevalidation(
  result
) {

  console.log("");
  console.log(
    "=================================================="
  );

  console.log(
    "REVALIDAÇÃO PRÉ-POST"
  );

  console.log(
    "=================================================="
  );


  if (!result) {

    console.log(
      "❌ Resultado de revalidação inválido."
    );

    return;
  }


  const previous =
    result.previousPromotion;

  const current =
    result.currentPromotion;


  console.log(
    `Tipo:                    ${
      current?.type ??
      previous?.type ??
      "N/D"
    }`
  );


  console.log(
    `Campanha:                ${
      current?.name ??
      previous?.name ??
      "N/D"
    }`
  );


  console.log(
    `Status atual:            ${
      current?.status ??
      "N/D"
    }`
  );


  /**
   * BLOQUEADO
   */

  if (
    !result.approved
  ) {

    console.log("");

    console.log(
      "⛔ REVALIDAÇÃO BLOQUEADA"
    );

    console.log(
      `Motivo: ${result.reason}`
    );


    if (
      result.analysis?.financial
    ) {

      const f =
        result.analysis.financial;


      console.log(
        `Margem atual:            ${Number(
          f.netMargin ?? 0
        ).toFixed(2)}%`
      );

      console.log(
        `Margem mínima:           ${Number(
          f.minimumMargin ?? 0
        ).toFixed(2)}%`
      );
    }


    return;
  }


  /**
   * APROVADO
   */

  const f =
    result.analysis.financial;


  console.log("");

  console.log(
    "COMPARAÇÃO"
  );

  console.log(
    "--------------------------------------------------"
  );


  console.log(
    `Preço análise inicial:    R$ ${Number(
      result.changes.previousPrice
    ).toFixed(2)}`
  );

  console.log(
    `Preço revalidado:         R$ ${Number(
      result.changes.currentPrice
    ).toFixed(2)}`
  );


  console.log(
    `Benefício inicial:        R$ ${Number(
      result.changes.previousFeeBenefit
    ).toFixed(2)}`
  );

  console.log(
    `Benefício revalidado:     R$ ${Number(
      result.changes.currentFeeBenefit
    ).toFixed(2)}`
  );


  console.log("");

  console.log(
    "RESULTADO FINANCEIRO ATUAL"
  );

  console.log(
    "--------------------------------------------------"
  );


  console.log(
    `Margem líquida:           ${Number(
      f.netMargin
    ).toFixed(2)}%`
  );

  console.log(
    `Margem mínima:            ${Number(
      f.minimumMargin
    ).toFixed(2)}%`
  );

  console.log(
    `Folga:                    ${
      Number(
        f.netMargin -
        f.minimumMargin
      ) >= 0
        ? "+"
        : ""
    }${Number(
      f.netMargin -
      f.minimumMargin
    ).toFixed(2)} p.p.`
  );


  if (
    result.changes.priceChanged
  ) {

    console.log("");

    console.log(
      "⚠️ O preço da oportunidade mudou desde a análise inicial."
    );
  }


  if (
    result.changes.feeBenefitChanged
  ) {

    console.log(
      "⚠️ O benefício ML mudou desde a análise inicial."
    );
  }


  console.log("");

  console.log(
    "✅ REVALIDAÇÃO APROVADA"
  );

  console.log(
    "A promoção continua dentro da margem."
  );
}