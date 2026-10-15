import { ml } from "./core/mlClient.js";
import { analyzeFinancial } from "./core/financial.js";

import {
  enqueue,
} from "./queue.js";

import {
  getNormalizedItemPromotions,
  isCandidatePromotion,
  isActivePromotion,
} from "./services/promotionAnalyzer.js";

/**
 * ============================================================
 * PROMOTIONS.JS — ETAPA 2
 * ============================================================
 *
 * OBJETIVO:
 *
 * 1. Listar todas as campanhas disponíveis na conta.
 * 2. Descobrir todos os MLBs vinculados às campanhas.
 * 3. Remover MLBs duplicados.
 * 4. Consultar todas as promoções de cada MLB.
 * 5. Normalizar as promoções.
 * 6. Identificar oportunidades candidatas.
 * 7. Calcular financeiramente as promoções suportadas.
 * 8. Separar:
 *      - dentro da margem;
 *      - abaixo da margem;
 *      - não suportadas;
 *      - já ativas/programadas.
 * 9. Gerar relatório das oportunidades elegíveis.
 *
 * ============================================================
 * IMPORTANTE
 * ============================================================
 *
 * ESTA ETAPA É SOMENTE LEITURA.
 *
 * NÃO:
 * - aplica promoção;
 * - envia POST;
 * - altera anúncio;
 * - remove promoção;
 * - adiciona promoção;
 * - modifica preço.
 *
 * ============================================================
 */


/**
 * ============================================================
 * LISTAR CAMPANHAS DISPONÍVEIS
 * ============================================================
 */

export async function listAvailablePromotions() {
  const data = await ml.get(
    `/seller-promotions/users/${process.env.ML_USER_ID}`
  );

  if (!data || typeof data !== "object") {
    return [];
  }

  return Object.entries(data)
    .filter(([, value]) =>
      Array.isArray(value)
    )
    .flatMap(([, arr]) => arr);
}


/**
 * ============================================================
 * LISTAR ITENS DE UMA CAMPANHA
 * ============================================================
 */

export async function listPromotionItems(
  promotionId,
  promotionType
) {
  if (!promotionId) {
    return [];
  }

  const allItems = [];

  let searchAfter = null;
  let page = 1;

  const seenCursors = new Set();

  while (true) {
    const params = {
      promotion_type: promotionType,
      status_item: "active",
    };

    if (searchAfter) {
      params.search_after = searchAfter;
    }

    const data = await ml.get(
      `/seller-promotions/promotions/${promotionId}/items`,
      params
    );

    const results =
      Array.isArray(data?.results)
        ? data.results
        : [];

    const total =
      Number(data?.paging?.total);

    const nextSearchAfter =
      data?.paging?.searchAfter ?? null;

    allItems.push(...results);

    console.log(
      `      Página ${page}: ${results.length} item(ns) | ` +
      `acumulado: ${allItems.length}` +
      (
        Number.isFinite(total)
          ? `/${total}`
          : ""
      )
    );

    /*
     * 1. API não retornou mais resultados.
     */
    if (results.length === 0) {
      break;
    }

    /*
     * 2. Atingimos o total oficial informado pelo ML.
     */
    if (
      Number.isFinite(total) &&
      total >= 0 &&
      allItems.length >= total
    ) {
      break;
    }

    /*
     * 3. ML não forneceu cursor para próxima página.
     */
    if (!nextSearchAfter) {
      break;
    }

    /*
     * 4. Proteção absoluta contra cursor repetido.
     */
    if (
      nextSearchAfter === searchAfter ||
      seenCursors.has(nextSearchAfter)
    ) {
      console.warn(
        `      ⚠️ Cursor repetido em ${promotionType} ${promotionId}. ` +
        `Paginação interrompida por segurança.`
      );

      break;
    }

    seenCursors.add(nextSearchAfter);

    /*
     * MUITO IMPORTANTE:
     * o cursor retornado pelo ML vira search_after
     * da PRÓXIMA requisição.
     */
    searchAfter = nextSearchAfter;

    page++;

    await sleep(100);
  }

  return allItems;
}

/**
 * ============================================================
 * CONSULTAR PROMOÇÕES DE UM MLB
 * ============================================================
 */

export async function listItemPromotions(
  itemId
) {
  const data = await ml.get(
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
 * NOME AMIGÁVEL
 * ============================================================
 */

function getPromotionName(promotion) {
  return (
    promotion?.name ||
    promotion?.id ||
    promotion?.type ||
    "SEM NOME"
  );
}


/**
 * ============================================================
 * EXTRAIR MLB
 * ============================================================
 */

function getItemId(item) {
  return (
    item?.id ||
    item?.item_id ||
    item?.itemId ||
    null
  );
}


/**
 * ============================================================
 * PAUSA ENTRE REQUISIÇÕES
 * ============================================================
 */

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}


/**
 * ============================================================
 * RUN CYCLE
 * ============================================================
 */

export async function runCycle() {

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "ANÁLISE FINANCEIRA GERAL DE PROMOÇÕES — ETAPA 2"
  );
  console.log(
    "=================================================="
  );

  console.log("");
  console.log(
    "⚠️ MODO SOMENTE LEITURA"
  );
  console.log(
    "Nenhuma promoção será aplicada ou alterada."
  );


  /**
   * ========================================================
   * 1. CONSULTAR CAMPANHAS
   * ========================================================
   */

  console.log("");
  console.log(
    "🔎 Consultando campanhas da conta..."
  );

  const promotions =
    await listAvailablePromotions();

  console.log("");
  console.log(
    `${promotions.length} campanha(s) encontrada(s).`
  );


  /**
   * ========================================================
   * 2. DESCOBRIR MLBs
   * ========================================================
   */

  const uniqueItemIds =
    new Set();

  let campaignsProcessed = 0;
  let campaignsIgnored = 0;
  let campaignErrors = 0;

  let campaignItemOccurrences = 0;


  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "DESCOBRINDO ANÚNCIOS"
  );
  console.log(
    "=================================================="
  );


  for (const promo of promotions) {

    const promotionId =
      promo?.id ?? null;

    const promotionType =
      promo?.type ?? "UNKNOWN";

    const promotionStatus =
      promo?.status ?? "N/D";

    const promotionName =
      getPromotionName(promo);


    console.log("");

    console.log(
      `📣 ${promotionType} | ${promotionName}`
    );

    console.log(
      `   ID:     ${promotionId ?? "N/D"}`
    );

    console.log(
      `   Status: ${promotionStatus}`
    );


    /**
     * Campanha sem ID não consegue usar
     * /promotions/{id}/items
     */

    if (!promotionId) {

      console.log(
        "   ⏭️ Ignorada na descoberta — campanha sem ID."
      );

      campaignsIgnored++;

      continue;
    }


    /**
     * Estados relevantes para descoberta.
     */

    if (
      promotionStatus !== "started" &&
      promotionStatus !== "candidate" &&
      promotionStatus !== "pending"
    ) {

      console.log(
        "   ⏭️ Ignorada — status não relevante."
      );

      campaignsIgnored++;

      continue;
    }


    try {

      const items =
        await listPromotionItems(
          promotionId,
          promotionType
        );


      console.log(
        `   📦 ${items.length} item(ns) encontrado(s).`
      );


      campaignsProcessed++;

      campaignItemOccurrences +=
        items.length;


      for (const item of items) {

        const itemId =
          getItemId(item);

        if (!itemId) {
          continue;
        }

        /**
         * Set elimina automaticamente
         * MLBs duplicados.
         */

        uniqueItemIds.add(
          String(itemId)
        );
      }

    } catch (err) {

      campaignErrors++;

      console.log(
        `   ❌ Falha ao consultar itens: ${
          err?.response?.data?.message ||
          err?.mlBody?.message ||
          err?.message ||
          "erro desconhecido"
        }`
      );
    }


    await sleep(100);
  }


  const itemIds =
    Array.from(
      uniqueItemIds
    );


  /**
   * ========================================================
   * RESULTADO DA DESCOBERTA
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "DESCOBERTA CONCLUÍDA"
  );
  console.log(
    "=================================================="
  );

  console.log(
    `Campanhas processadas:       ${campaignsProcessed}`
  );

  console.log(
    `Campanhas ignoradas:         ${campaignsIgnored}`
  );

  console.log(
    `Erros em campanhas:          ${campaignErrors}`
  );

  console.log(
    `Ocorrências de itens:        ${campaignItemOccurrences}`
  );

  console.log(
    `MLBs únicos encontrados:     ${itemIds.length}`
  );


  /**
   * ========================================================
   * 3. CONTADORES DA VARREDURA
   * ========================================================
   */

  let itemsConsulted = 0;
  let itemErrors = 0;

  let totalItemPromotions = 0;


  const statusCounter = {};
  const typeCounter = {};


  /**
   * ========================================================
   * CONTADORES FINANCEIROS
   * ========================================================
   */

  let activePromotions = 0;
  let candidatePromotions = 0;

  let financiallyAnalyzed = 0;
  let financiallyEligible = 0;
  let financiallyBlocked = 0;

  let queuedForApproval = 0;

  let ignoredPromotions = 0;
  let financialErrors = 0;
  let invalidPrices = 0;


  /**
   * Resultado por tipo.
   */

  const eligibleByType = {};
  const blockedByType = {};
  const ignoredByType = {};


  /**
   * Lista das oportunidades que passaram
   * na análise financeira.
   *
   * IMPORTANTE:
   *
   * Elas NÃO serão aplicadas nesta etapa.
   */

  const eligibleOpportunities = [];


  /**
   * ========================================================
   * 4. CONSULTAR CADA MLB
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "CONSULTANDO E ANALISANDO PROMOÇÕES DOS ANÚNCIOS"
  );
  console.log(
    "=================================================="
  );


  for (
    let index = 0;
    index < itemIds.length;
    index++
  ) {

    const itemId =
      itemIds[index];


    console.log("");
    console.log(
      "--------------------------------------------------"
    );

    console.log(
      `[${index + 1}/${itemIds.length}] ${itemId}`
    );

    console.log(
      "--------------------------------------------------"
    );


    try {

  /**
 * ====================================================
 * CONSULTAR + ENRIQUECER + NORMALIZAR
 * ====================================================
 *
 * IMPORTANTE:
 *
 * getNormalizedItemPromotions() executa:
 *
 * 1. GET /seller-promotions/items/{MLB}
 * 2. identifica UNHEALTHY_STOCK
 * 3. consulta o endpoint oficial da campanha
 * 4. obtém price e offer_id oficiais
 * 5. NÃO calcula nem infere preço
 * 6. normaliza somente depois do enriquecimento
 */

const normalizedPromotions =
  await getNormalizedItemPromotions(
    itemId
  );


itemsConsulted++;

totalItemPromotions +=
  normalizedPromotions.length;


      console.log(
        `${normalizedPromotions.length} promoção(ões).`
      );


      if (
        normalizedPromotions.length === 0
      ) {

        console.log(
          "   Nenhuma promoção retornada."
        );

        continue;
      }


      /**
       * ====================================================
       * 5. ANALISAR CADA PROMOÇÃO
       * ====================================================
       */

      for (
        const promotion
        of normalizedPromotions
      ) {

        const type =
          promotion?.type ??
          "UNKNOWN";

        const status =
          promotion?.status ??
          "N/D";

        const name =
          getPromotionName(
            promotion
          );


        /**
         * Contadores gerais.
         */

        typeCounter[type] =
          (typeCounter[type] || 0) + 1;

        statusCounter[status] =
          (statusCounter[status] || 0) + 1;


        /**
         * ==================================================
         * PROMOÇÃO ATIVA / PROGRAMADA
         * ==================================================
         */

        if (
          isActivePromotion(
            promotion
          )
        ) {

          activePromotions++;

          console.log(
            `   ✅ ${type.padEnd(22)} | ` +
            `${String(status).padEnd(9)} | ` +
            `${name}`
          );

          continue;
        }


        /**
         * ==================================================
         * STATUS DIFERENTE DE CANDIDATE
         * ==================================================
         */

        if (
          !isCandidatePromotion(
            promotion
          )
        ) {

          ignoredPromotions++;

          ignoredByType[type] =
            (ignoredByType[type] || 0) + 1;


          console.log(
            `   ⏭️ ${type.padEnd(22)} | ` +
            `${String(status).padEnd(9)} | ` +
            `status ignorado`
          );

          continue;
        }


        candidatePromotions++;


        /**
         * ==================================================
         * PROMOÇÃO NÃO SUPORTADA FINANCEIRAMENTE
         * ==================================================
         *
         * Aqui podem entrar:
         *
         * BANK
         * SELLER_COUPON_CAMPAIGN
         * outros tipos ainda não validados
         */

        if (
          !promotion.canAnalyze
        ) {

          ignoredPromotions++;

          ignoredByType[type] =
            (ignoredByType[type] || 0) + 1;


          /**
           * Não vamos poluir o console
           * mostrando cada cupom individualmente.
           *
           * Cupons ficam fora desta etapa.
           */

          if (
            type !==
            "SELLER_COUPON_CAMPAIGN"
          ) {

            console.log(
              `   ⚠️ ${type.padEnd(22)} | ` +
              `não analisada | ${
                promotion.analysisBlockReason ??
                "regra financeira não validada"
              }`
            );
          }


          continue;
        }


        /**
         * ==================================================
         * PREÇO PARA ANÁLISE
         * ==================================================
         */

        const analysisPrice =
          Number(
            promotion.buyerPrice
          );


        if (
          !Number.isFinite(
            analysisPrice
          ) ||
          analysisPrice <= 0
        ) {

          invalidPrices++;

          ignoredPromotions++;

          ignoredByType[type] =
            (ignoredByType[type] || 0) + 1;


          console.log(
            `   ⚠️ ${type.padEnd(22)} | preço inválido`
          );

          continue;
        }


        /**
         * ==================================================
         * 6. ANÁLISE FINANCEIRA
         * ==================================================
         */

        let analysis;


        try {

          analysis =
            await analyzeFinancial({

              itemId,

              price:
                analysisPrice,

              /**
               * Benefício do ML será tratado
               * pelo financial.js como redução
               * da tarifa.
               */

              feeBenefit:
                promotion.feeBenefit,

              promotionId:
                promotion.id,

              promotionType:
                promotion.type,
            });


        } catch (err) {

          financialErrors++;


          console.log(
            `   ❌ ${type.padEnd(22)} | erro financeiro: ${
              err?.response?.data?.message ||
              err?.mlBody?.message ||
              err?.mlBody ||
              err?.message ||
              "erro desconhecido"
            }`
          );


          continue;
        }


        financiallyAnalyzed++;


        const f =
          analysis.financial;


        /**
         * ==================================================
         * 7. BLOQUEIO POR MARGEM
         * ==================================================
         */

        if (
          !f?.eligible
        ) {

          financiallyBlocked++;


          blockedByType[type] =
            (blockedByType[type] || 0) + 1;


          console.log(
            `   ⛔ ${type.padEnd(22)} | ` +
            `R$ ${analysisPrice.toFixed(2)} | ` +
            `margem ${Number(
              f?.netMargin ?? 0
            ).toFixed(2)}% | ` +
            `mín. ${Number(
              f?.minimumMargin ?? 0
            ).toFixed(2)}%`
          );


          continue;
        }


        /**
         * ==================================================
         * 8. DENTRO DA MARGEM
         * ==================================================
         */

        financiallyEligible++;


        eligibleByType[type] =
          (eligibleByType[type] || 0) + 1;


        /**
         * Apenas guardamos em memória.
         *
         * NÃO existe POST aqui.
         */

        eligibleOpportunities.push({
          itemId,
          promotion,
          analysis,
        });

        /**
 * ==================================================
 * FILA DE APROVAÇÃO
 * ==================================================
 *
 * Somente promoções que:
 *
 * 1. passaram pela análise financeira;
 * 2. possuem aplicação liberada;
 * 3. possuem price oficial válido;
 *
 * entram no pending.json.
 *
 * IMPORTANTE:
 *
 * enqueue() NÃO aplica promoção.
 * Apenas registra/atualiza o candidato.
 */

if (
  promotion.canApply === true
) {

  const queuedCandidate = {
    itemId,

    promotionId:
      promotion.id ?? null,

    promotionType:
      promotion.type,

    promotionName:
      promotion.name ??
      promotion.id ??
      promotion.type,

    originalPrice:
      Number(
        promotion.originalPrice ?? 0
      ),

    dealPrice:
      analysisPrice,

    /**
     * Guardamos a promoção normalizada completa.
     *
     * Isso preserva:
     *
     * - offerId
     * - refId
     * - buyerPrice
     * - officialPriceSource
     * - stockMin / stockMax
     * - feeBenefit
     * - demais dados oficiais
     */
    promotionData: {
      ...promotion,
    },

    /**
     * Dados financeiros da detecção.
     */
    financial:
      analysis.financial,

    /**
     * Informações do produto para auditoria.
     */
    product:
      analysis.product,

    sku:
      analysis.sku,

    /**
     * LIGHTNING:
     *
     * Mantemos os limites oficiais da campanha.
     */
    promotionStock: {
      min:
        promotion.stockMin ??
        null,

      max:
        promotion.stockMax ??
        null,
    },
  };
  
queuedForApproval++;


  const created =
    enqueue(
      queuedCandidate
    );


  console.log(
    created
      ? `      📥 Adicionada à fila de aprovação.`
      : `      🔄 Candidato atualizado na fila.`
  );
}


        console.log(
          `   💰 ${type.padEnd(22)} | ` +
          `R$ ${analysisPrice.toFixed(2)} | ` +
          `margem ${Number(
            f.netMargin
          ).toFixed(2)}% | ` +
          `mín. ${Number(
            f.minimumMargin
          ).toFixed(2)}% | ` +
          `ELEGÍVEL`
        );
      }


    } catch (err) {

      itemErrors++;


      console.log(
        `❌ Falha ao consultar ${itemId}: ${
          err?.response?.data?.message ||
          err?.mlBody?.message ||
          err?.message ||
          "erro desconhecido"
        }`
      );
    }


    /**
     * Pausa entre anúncios.
     */

    await sleep(100);
  }


  /**
   * ========================================================
   * 9. RESUMO POR TIPO
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "PROMOÇÕES ENCONTRADAS POR TIPO"
  );
  console.log(
    "=================================================="
  );


  const sortedTypes =
    Object.entries(
      typeCounter
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );


  if (
    sortedTypes.length === 0
  ) {

    console.log(
      "Nenhuma promoção encontrada."
    );

  } else {

    for (
      const [type, count]
      of sortedTypes
    ) {

      console.log(
        `${type.padEnd(30)} ${count}`
      );
    }
  }


  /**
   * ========================================================
   * 10. RESUMO POR STATUS
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "PROMOÇÕES ENCONTRADAS POR STATUS"
  );
  console.log(
    "=================================================="
  );


  const sortedStatuses =
    Object.entries(
      statusCounter
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );


  if (
    sortedStatuses.length === 0
  ) {

    console.log(
      "Nenhum status encontrado."
    );

  } else {

    for (
      const [status, count]
      of sortedStatuses
    ) {

      console.log(
        `${String(status).padEnd(30)} ${count}`
      );
    }
  }


  /**
   * ========================================================
   * 11. RESULTADO FINANCEIRO
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "RESULTADO FINANCEIRO DO LOTE"
  );
  console.log(
    "=================================================="
  );


  console.log(
    `Promoções ativas/programadas:     ${activePromotions}`
  );

  console.log(
    `Candidatas encontradas:           ${candidatePromotions}`
  );

  console.log(
    `Analisadas financeiramente:       ${financiallyAnalyzed}`
  );

  console.log(
    `Dentro da margem:                 ${financiallyEligible}`
  );

  console.log(
    `Abaixo da margem:                 ${financiallyBlocked}`
  );

  console.log(
    `Ignoradas/não suportadas:         ${ignoredPromotions}`
  );

  console.log(
    `Preços inválidos:                 ${invalidPrices}`
  );

  console.log(
    `Erros financeiros:                ${financialErrors}`
  );


  /**
   * ========================================================
   * 12. ELEGÍVEIS POR TIPO
   * ========================================================
   */

  console.log("");
  console.log(
    "ELEGÍVEIS POR TIPO"
  );
  console.log(
    "--------------------------------------------------"
  );


  const eligibleTypes =
    Object.entries(
      eligibleByType
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );


  if (
    eligibleTypes.length === 0
  ) {

    console.log(
      "Nenhuma oportunidade elegível."
    );

  } else {

    for (
      const [type, count]
      of eligibleTypes
    ) {

      console.log(
        `${type.padEnd(30)} ${count}`
      );
    }
  }


  /**
   * ========================================================
   * 13. BLOQUEADAS POR TIPO
   * ========================================================
   */

  console.log("");
  console.log(
    "BLOQUEADAS POR MARGEM"
  );
  console.log(
    "--------------------------------------------------"
  );


  const blockedTypes =
    Object.entries(
      blockedByType
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );


  if (
    blockedTypes.length === 0
  ) {

    console.log(
      "Nenhuma promoção bloqueada."
    );

  } else {

    for (
      const [type, count]
      of blockedTypes
    ) {

      console.log(
        `${type.padEnd(30)} ${count}`
      );
    }
  }


  /**
   * ========================================================
   * 14. IGNORADAS / NÃO SUPORTADAS
   * ========================================================
   */

  console.log("");
  console.log(
    "IGNORADAS / NÃO SUPORTADAS"
  );
  console.log(
    "--------------------------------------------------"
  );


  const ignoredTypes =
    Object.entries(
      ignoredByType
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );


  if (
    ignoredTypes.length === 0
  ) {

    console.log(
      "Nenhuma promoção ignorada."
    );

  } else {

    for (
      const [type, count]
      of ignoredTypes
    ) {

      console.log(
        `${type.padEnd(30)} ${count}`
      );
    }
  }


  /**
   * ========================================================
   * 15. OPORTUNIDADES ELEGÍVEIS
   * ========================================================
   *
   * ATENÇÃO:
   *
   * Este relatório NÃO significa que a promoção
   * foi aplicada.
   *
   * Apenas mostra o que passou na análise financeira.
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "OPORTUNIDADES ELEGÍVEIS — SOMENTE RELATÓRIO"
  );
  console.log(
    "=================================================="
  );


  if (
    eligibleOpportunities.length === 0
  ) {

    console.log(
      "Nenhuma oportunidade dentro da margem."
    );

  } else {

    for (
      const opportunity
      of eligibleOpportunities
    ) {

      const {
        itemId,
        promotion,
        analysis,
      } = opportunity;


      const f =
        analysis.financial;


      console.log(
        `${itemId} | ` +
        `${promotion.type} | ` +
        `${promotion.name ?? promotion.id ?? ""} | ` +
        `R$ ${Number(
          promotion.buyerPrice
        ).toFixed(2)} | ` +
        `margem ${Number(
          f.netMargin
        ).toFixed(2)}% | ` +
        `mín. ${Number(
          f.minimumMargin
        ).toFixed(2)}%`
      );
    }
  }


  /**
   * ========================================================
   * 16. RESUMO FINAL DA VARREDURA
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "RESUMO DA VARREDURA"
  );
  console.log(
    "=================================================="
  );


  console.log(
    `Campanhas disponíveis:       ${promotions.length}`
  );

  console.log(
    `Campanhas processadas:       ${campaignsProcessed}`
  );

  console.log(
    `Campanhas ignoradas:         ${campaignsIgnored}`
  );

  console.log(
    `MLBs únicos encontrados:     ${itemIds.length}`
  );

  console.log(
    `MLBs consultados:            ${itemsConsulted}`
  );

  console.log(
    `Promoções encontradas:       ${totalItemPromotions}`
  );

  console.log(
    `Erros em campanhas:          ${campaignErrors}`
  );

  console.log(
    `Erros em anúncios:           ${itemErrors}`
  );

  console.log(
  `Enfileiradas para aprovação: ${queuedForApproval}`
);


  /**
   * ========================================================
   * CONFIRMAÇÃO DE SEGURANÇA
   * ========================================================
   */

  console.log("");
  console.log(
    "=================================================="
  );
  console.log(
    "⚠️ ETAPA 2 — SOMENTE LEITURA"
  );
  console.log(
    "Nenhuma promoção foi aplicada ou alterada."
  );
  console.log(
    "As oportunidades elegíveis acima são apenas relatório."
  );
  console.log(
    "=================================================="
  );


  /**
   * Retorno útil para utilização futura.
   *
   * Ainda não existe aplicação automática.
   */

  return {
    campaigns: {
      available:
        promotions.length,

      processed:
        campaignsProcessed,

      ignored:
        campaignsIgnored,

      errors:
        campaignErrors,
    },

    items: {
      found:
        itemIds.length,

      consulted:
        itemsConsulted,

      errors:
        itemErrors,
    },

    promotions: {
      total:
        totalItemPromotions,

      active:
        activePromotions,

      candidates:
        candidatePromotions,

      analyzed:
        financiallyAnalyzed,

      eligible:
        financiallyEligible,

      blocked:
        financiallyBlocked,

      ignored:
        ignoredPromotions,

      invalidPrices,
      financialErrors,
    },

    eligibleOpportunities,
  };
}