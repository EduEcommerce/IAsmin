import {
  getBotConfig,
} from "../config/botConfig.js";

import {
  runCycle,
} from "../promotions.js";

import {
  revalidatePromotion,
} from "../core/promotionRevalidator.js";

import {
  applyPromotion,
} from "../core/promotionApplier.js";

import {
  findBestPriceDiscount,
} from "../core/financial.js";


/**
 * ============================================================
 * PROMOTION RUNNER
 * ============================================================
 *
 * Motor principal de execução do bot.
 *
 * Pode ser chamado por:
 *
 * - Terminal
 * - Interface Web
 * - API
 * - Agendador futuro
 *
 * Este arquivo NÃO deve solicitar input pelo terminal.
 * Toda configuração vem de botConfig.
 * ============================================================
 */


/**
 * ============================================================
 * UTILIDADES
 * ============================================================
 */

function sleep(ms) {
  const delay = Number(ms);

  if (
    !Number.isFinite(delay) ||
    delay <= 0
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}


function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "N/D";
  }

  return `R$ ${number.toFixed(2)}`;
}


function percent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "N/D";
  }

  return `${number.toFixed(2)}%`;
}


function getErrorMessage(err) {
  if (!err) {
    return "Erro desconhecido";
  }

  const responseData =
    err?.response?.data;

  if (
    typeof responseData === "string"
  ) {
    return responseData;
  }

  if (responseData?.message) {
    return responseData.message;
  }

  if (err?.mlBody?.message) {
    return err.mlBody.message;
  }

  if (
    typeof err?.mlBody === "string"
  ) {
    return err.mlBody;
  }

  if (err?.message) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}


function promotionLabel(promotion) {
  if (!promotion) {
    return "N/D";
  }

  return (
    promotion.name ||
    promotion.id ||
    promotion.key ||
    promotion.type ||
    "N/D"
  );
}


/**
 * ============================================================
 * CONFIGURAÇÃO DOS TIPOS
 * ============================================================
 */

function isPromotionTypeEnabled(type) {

    const botConfig =
    getBotConfig();


  return (
    botConfig.promotionTypes?.[type] === true
  );
}


export function getEnabledPromotionTypes() {

  const botConfig =
    getBotConfig();

  return Object.entries(
    botConfig.promotionTypes ?? {}
  )
    .filter(([, enabled]) => {
      return enabled === true;
    })
    .map(([type]) => type);
}


export function getDisabledPromotionTypes() {

  const botConfig =
    getBotConfig();

  return Object.entries(
    botConfig.promotionTypes ?? {}
  )
    .filter(([, enabled]) => {
      return enabled !== true;
    })
    .map(([type]) => type);
}


/**
 * ============================================================
 * PRIORIDADE
 * ============================================================
 *
 * O nome é utilizado SOMENTE para ordenar.
 *
 * Nunca utilizamos o nome para determinar:
 *
 * - tipo da promoção
 * - endpoint
 * - payload
 * - cálculo financeiro
 * ============================================================
 */

function normalizeCampaignName(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR");

}

export function getPromotionPriority(
  promotion
) {
  const botConfig =
    getBotConfig();

  /**
   * Nome da campanha normalizado.
   *
   * promotion.name normalmente contém nomes como:
   *
   * - Aumente sua competitividade
   * - Melhore sua exposição
   * - Impulsione suas vendas
   *
   * Caso name não exista, usamos id como fallback.
   */

  const promotionName =
    normalizeCampaignName(
      promotion?.name ??
      promotion?.id ??
      ""
    );


  if (!promotionName) {
    return 1000;
  }


  const priorities =
    botConfig.campaignPriority ?? [];


  for (
    let index = 0;
    index < priorities.length;
    index++
  ) {

    const priorityName =
      normalizeCampaignName(
        priorities[index]
      );


    if (
      priorityName &&
      promotionName.includes(
        priorityName
      )
    ) {
      return index + 1;
    }
  }


  return 1000;
}


/**
 * ============================================================
 * ESTOQUE
 * ============================================================
 */

function isStockError(message) {
  const text =
    String(message ?? "")
      .toLowerCase();

  return (
    text.includes("estoque") ||
    text.includes("stock")
  );
}


/**
 * ============================================================
 * ESTATÍSTICAS
 * ============================================================
 */

function createStats() {
  return {
    received: 0,

    supported: 0,

    ignoredType: 0,

    revalidated: 0,

    approvedAfterRevalidation: 0,

    blockedRevalidation: 0,

    blockedMargin: 0,

    changedCondition: 0,

    stockSkipped: 0,

    dryRunApproved: 0,

    applied: 0,

    apiFailures: 0,

    unexpectedFailures: 0,
  };
}


/**
 * ============================================================
 * RELATÓRIO
 * ============================================================
 */

function createReport() {
  return {
    applied: [],

    dryRun: [],

    blocked: [],

    stock: [],

    ignored: [],

    failures: [],
  };
}


/**
 * ============================================================
 * REGISTRAR BLOQUEIO
 * ============================================================
 */

function registerBlocked(
  stats,
  report,
  {
    itemId,
    promotion,
    reason,
  }
) {
  stats.blockedRevalidation++;

  const lowerReason =
    String(
      reason ?? ""
    ).toLowerCase();

  if (
    lowerReason.includes("margem")
  ) {
    stats.blockedMargin++;
  } else {
    stats.changedCondition++;
  }

  report.blocked.push({
    itemId,

    type:
      promotion?.type ??
      "N/D",

    campaign:
      promotionLabel(
        promotion
      ),

    reason:
      reason ??
      "Motivo não informado",
  });
}


/**
 * ============================================================
 * VARREDURA
 * ============================================================
 *
 * Esta função será muito importante para a interface.
 *
 * Poderemos futuramente fazer:
 *
 * GET /api/opportunities
 *
 * sem executar nenhum POST.
 * ============================================================
 */

export async function scanPromotionOpportunities() {
  const cycleResult =
    await runCycle();

  if (!cycleResult) {
    throw new Error(
      "promotions.js não retornou resultado."
    );
  }

  const opportunities =
    cycleResult.eligibleOpportunities;

  if (
    !Array.isArray(opportunities)
  ) {
    throw new Error(
      "eligibleOpportunities não foi retornado pelo promotions.js."
    );
  }

  return {
    opportunities,

    total:
      opportunities.length,

    cycleResult,
  };
}


/**
 * ============================================================
 * AGRUPAR POR MLB
 * ============================================================
 */

export function groupOpportunitiesByItem(
  opportunities
) {
  const map =
    new Map();

  for (
    const opportunity
    of opportunities
  ) {
    const itemId =
      opportunity?.itemId;

    if (!itemId) {
      continue;
    }

    if (!map.has(itemId)) {
      map.set(
        itemId,
        []
      );
    }

    map
      .get(itemId)
      .push(opportunity);
  }
  
  return map;
}


/**
 * ============================================================
 * PROCESSAR UMA OPORTUNIDADE
 * ============================================================
 */

export async function processPromotionOpportunity(
  opportunity,
  {
    stats,
    report,
  }
) {

    /**
   * Sempre buscar a configuração atual.
   *
   * Isso é especialmente importante para o DRY RUN,
   * pois o modo pode ser alterado pelo painel sem
   * reiniciar o servidor.
   */

  const botConfig =
    getBotConfig();


  const itemId =
    opportunity?.itemId;

  const promotion =
    opportunity?.promotion;


  /**
   * ----------------------------------------------------------
   * ENTRADA INVÁLIDA
   * ----------------------------------------------------------
   */

  if (
    !itemId ||
    !promotion
  ) {
    stats.unexpectedFailures++;

    report.failures.push({
      itemId:
        itemId ?? "N/D",

      type:
        promotion?.type ??
        "N/D",

      stage:
        "input",

      reason:
        "Oportunidade inválida.",
    });

    return {
      status: "error",
      reason: "Oportunidade inválida.",
    };
  }


  console.log("");
  console.log(
    "=================================================="
  );

  console.log(
    `${itemId} | ${promotion.type}`
  );

  console.log(
    "=================================================="
  );

  console.log(
    `Campanha:                 ${promotionLabel(
      promotion
    )}`
  );

  console.log(
    `Status inicial:           ${
      promotion.status ??
      "N/D"
    }`
  );

  console.log(
    `Preço inicial:            ${money(
      promotion.buyerPrice
    )}`
  );

  console.log(
    `Benefício ML inicial:     ${money(
      promotion.feeBenefit ?? 0
    )}`
  );


  /**
   * ----------------------------------------------------------
   * TIPO HABILITADO?
   * ----------------------------------------------------------
   */

  if (
    !isPromotionTypeEnabled(
      promotion.type
    )
  ) {
    stats.ignoredType++;

    const reason =
      "Tipo desabilitado na configuração.";

    console.log("");
    console.log(
      `⏭ IGNORADA — ${reason}`
    );

    report.ignored.push({
      itemId,

      type:
        promotion.type,

      campaign:
        promotionLabel(
          promotion
        ),

      reason,
    });

    return {
      status: "ignored",
      reason,
    };
  }


  stats.supported++;


  /**
   * ----------------------------------------------------------
   * APLICABILIDADE
   * ----------------------------------------------------------
   */

  if (
    promotion.canApply !== true
  ) {
    stats.ignoredType++;

    const reason =
      promotion.applyBlockReason ??
      "Promoção não liberada estruturalmente para aplicação.";

    console.log("");
    console.log(
      `⏭ IGNORADA — ${reason}`
    );

    report.ignored.push({
      itemId,

      type:
        promotion.type,

      campaign:
        promotionLabel(
          promotion
        ),

      reason,
    });

    return {
      status: "ignored",
      reason,
    };
  }


  /**
   * ----------------------------------------------------------
   * REVALIDAÇÃO
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "🔄 Revalidando..."
  );


  let revalidation;


  try {
    const optimizableTypes =
  new Set([
    "PRICE_DISCOUNT",
    "LIGHTNING",
    "DEAL",
    "DOD",
  ]);

revalidation =
  await revalidatePromotion({
    itemId,
    promotion,
    structuralOnly:
      optimizableTypes.has(
        promotion.type
      ),
  });

    stats.revalidated++;

  } catch (err) {
    stats.unexpectedFailures++;

    const reason =
      getErrorMessage(err);

    console.log("");
    console.log(
      `❌ Erro na revalidação: ${reason}`
    );

    report.failures.push({
      itemId,

      type:
        promotion.type,

      campaign:
        promotionLabel(
          promotion
        ),

      stage:
        "revalidation",

      reason,
    });

    return {
      status: "error",
      reason,
    };
  }


  /**
   * ----------------------------------------------------------
   * REVALIDAÇÃO REPROVADA
   * ----------------------------------------------------------
   */

  if (
    !revalidation?.approved
  ) {
    const reason =
      revalidation?.reason ??
      "Revalidação não aprovada.";

    console.log("");
    console.log(
      `⛔ BLOQUEADA — ${reason}`
    );

    registerBlocked(
      stats,
      report,
      {
        itemId,
        promotion,
        reason,
      }
    );

    return {
      status: "blocked",
      reason,
    };
  }


  stats.approvedAfterRevalidation++;


  let currentPromotion =
    revalidation.currentPromotion;

  let financial =
    revalidation.analysis
      ?.financial;


  /**
   * ----------------------------------------------------------
   * PROMOÇÃO ATUAL
   * ----------------------------------------------------------
   */

  if (!currentPromotion) {
    stats.unexpectedFailures++;

    const reason =
      "Revalidação não retornou currentPromotion.";

    console.log("");
    console.log(
      `❌ ${reason}`
    );

    report.failures.push({
      itemId,

      type:
        promotion.type,

      campaign:
        promotionLabel(
          promotion
        ),

      stage:
        "pre-post",

      reason,
    });

    return {
      status: "error",
      reason,
    };
  }


  /**
   * ----------------------------------------------------------
   * STATUS
   * ----------------------------------------------------------
   */

  if (
    botConfig.safety
      ?.requireCandidateStatus === true &&
    currentPromotion.status !==
      "candidate"
  ) {
    const reason =
      `Status mudou para ${
        currentPromotion.status ??
        "N/D"
      }.`;

    console.log("");
    console.log(
      `⏭ IGNORADA — ${reason}`
    );

    registerBlocked(
      stats,
      report,
      {
        itemId,

        promotion:
          currentPromotion,

        reason,
      }
    );

    return {
      status: "blocked",
      reason,
    };
  }


  /**
   * ----------------------------------------------------------
   * CONTINUA APLICÁVEL?
   * ----------------------------------------------------------
   */

  if (
    currentPromotion.canApply !==
    true
  ) {
    const reason =
      currentPromotion
        .applyBlockReason ??
      "Promoção deixou de ser aplicável.";

    console.log("");
    console.log(
      `⏭ IGNORADA — ${reason}`
    );

    registerBlocked(
      stats,
      report,
      {
        itemId,

        promotion:
          currentPromotion,

        reason,
      }
    );

    return {
      status: "blocked",
      reason,
    };
  }

  /**
 * ----------------------------------------------------------
 * OTIMIZAÇÃO DE PREÇO — PRICE_DISCOUNT
 * ----------------------------------------------------------
 *
 * Somente PRICE_DISCOUNT utiliza esta regra.
 *
 * Procuramos o menor preço comercial que:
 *
 * - respeite a faixa permitida pelo Mercado Livre;
 * - mantenha a margem mínima configurada;
 * - utilize preferencialmente finais ,90 / ,50 / ,00.
 */

if (
  currentPromotion.type === "PRICE_DISCOUNT" ||
  currentPromotion.type === "LIGHTNING" ||
  currentPromotion.type === "DEAL" ||
  currentPromotion.type === "DOD"

) {

  console.log("");
console.log(
  `🎯 OTIMIZANDO PREÇO — ${currentPromotion.type}`
);

  console.log(
    "--------------------------------------------------"
  );


  const minPrice =
    Number(
      currentPromotion.minPrice
    );

  const maxPrice =
    Number(
      currentPromotion.maxPrice
    );


  console.log(
    `Faixa permitida ML:       ${money(minPrice)} → ${money(maxPrice)}`
  );


  let optimization;


  try {

    optimization =
      await findBestPriceDiscount({
        itemId,

        minPrice,

        maxPrice,

        feeBenefit:
          currentPromotion
            .feeBenefit ?? 0,

        promotionId:
          currentPromotion
            .id ?? null,

         promotionType:
         currentPromotion.type,

      });

  } catch (err) {

    const reason =
    `Falha ao otimizar ${currentPromotion.type}: ${getErrorMessage(err)}`;

    console.log("");
    console.log(
      `❌ ${reason}`
    );


    registerBlocked(
      stats,
      report,
      {
        itemId,

        promotion:
          currentPromotion,

        reason,
      }
    );


    return {
      status: "blocked",
      reason,
    };
  }


  /**
   * Nenhum preço comercial conseguiu
   * atingir a margem mínima.
   */

  if (
    optimization?.eligible !== true ||
    !Number.isFinite(
      Number(
        optimization.selectedPrice
      )
    )
  ) {

    const reason =
      `PRICE_DISCOUNT sem preço comercial elegível. ` +
      `Motivo: ${
        optimization?.reason ??
        "desconhecido"
      }`;


    console.log("");
    console.log(
      `⛔ BLOQUEADA — ${reason}`
    );


    if (
      optimization
        ?.financial
        ?.financial
    ) {

      console.log(
        `Margem no preço máximo: ${percent(
          optimization
            .financial
            .financial
            .netMargin
        )}`
      );

      console.log(
        `Margem mínima:          ${percent(
          optimization
            .financial
            .financial
            .minimumMargin
        )}`
      );
    }


    registerBlocked(
      stats,
      report,
      {
        itemId,

        promotion:
          currentPromotion,

        reason,
      }
    );


    return {
      status: "blocked",
      reason,
    };
  }


  /**
   * Preço escolhido pelo otimizador.
   */

  const optimizedPrice =
    Number(
      optimization.selectedPrice
    );


  /**
   * A análise retornada pelo otimizador
   * já corresponde exatamente ao preço
   * comercial escolhido.
   */

  const optimizedFinancial =
    optimization
      ?.financial
      ?.financial;


  if (
    !optimizedFinancial ||
    optimizedFinancial.eligible !== true
  ) {

    const reason =
      "PRICE_DISCOUNT otimizado sem análise financeira elegível.";


    console.log("");
    console.log(
      `⛔ BLOQUEADA — ${reason}`
    );


    registerBlocked(
      stats,
      report,
      {
        itemId,

        promotion:
          currentPromotion,

        reason,
      }
    );


    return {
      status: "blocked",
      reason,
    };
  }


  console.log(
    `Preço anterior:           ${money(
      currentPromotion.buyerPrice
    )}`
  );

  console.log(
    `Preço otimizado:          ${money(
      optimizedPrice
    )}`
  );

  console.log(
    `Classificação:            ${
      optimization
        ?.financial
        ?.product
        ?.classification ??
      "N/D"
    }`
  );

  console.log(
    `Margem no preço final:    ${percent(
      optimizedFinancial.netMargin
    )}`
  );

  console.log(
    `Margem mínima:            ${percent(
      optimizedFinancial.minimumMargin
    )}`
  );

  console.log(
    `Lucro líquido:            ${money(
      optimizedFinancial.netProfit
    )}`
  );


  /**
   * Criamos um novo objeto em vez de
   * modificar diretamente o objeto
   * retornado pela revalidação.
   */

currentPromotion = {
  ...currentPromotion,

  buyerPrice:
    optimizedPrice,
};


/**
 * ----------------------------------------------------------
 * REVALIDAÇÃO FINAL DO PREÇO OTIMIZADO
 * ----------------------------------------------------------
 *
 * Reconsulta o Mercado Livre imediatamente antes de seguir.
 *
 * Confirma:
 * - mesma oportunidade;
 * - continua candidate;
 * - faixa atual do ML;
 * - preço otimizado ainda dentro da faixa;
 * - nova análise financeira;
 * - margem mínima atual.
 */

console.log("");
console.log(
  `🔄 Revalidando preço otimizado — ${currentPromotion.type}...`
);

let finalRevalidation;

try {

  finalRevalidation =
    await revalidatePromotion({
      itemId,

      promotion:
        currentPromotion,

      selectedPrice:
        optimizedPrice,

      structuralOnly:
        false,
    });

} catch (err) {

  const reason =
    `Falha na revalidação final: ${getErrorMessage(err)}`;

  console.log("");
  console.log(
    `⛔ BLOQUEADA — ${reason}`
  );

  registerBlocked(
    stats,
    report,
    {
      itemId,
      promotion:
        currentPromotion,
      reason,
    }
  );

  return {
    status: "blocked",
    reason,
  };
}


if (
  finalRevalidation?.approved !== true
) {

  const reason =
    finalRevalidation?.reason ??
    "Preço otimizado não passou na revalidação final.";

  console.log("");
  console.log(
    `⛔ BLOQUEADA — ${reason}`
  );

  registerBlocked(
    stats,
    report,
    {
      itemId,
      promotion:
        currentPromotion,
      reason,
    }
  );

  return {
    status: "blocked",
    reason,
  };
}


/**
 * Daqui em diante usamos exclusivamente
 * os dados da revalidação final.
 */

currentPromotion = {
  ...finalRevalidation.currentPromotion,

  buyerPrice:
    optimizedPrice,
};

financial =
  finalRevalidation
    .analysis
    ?.financial;


console.log("");
console.log(
  `✅ PREÇO ${currentPromotion.type} OTIMIZADO E REVALIDADO.`
);

}


  /**
   * ----------------------------------------------------------
   * MARGEM
   * ----------------------------------------------------------
   */

  if (
    !financial ||
    financial.eligible !== true
  ) {
    const reason =
      "Margem revalidada não está elegível.";

    console.log("");
    console.log(
      `⛔ BLOQUEADA — ${reason}`
    );

    registerBlocked(
      stats,
      report,
      {
        itemId,

        promotion:
          currentPromotion,

        reason,
      }
    );

    return {
      status: "blocked",
      reason,
    };
  }


  /**
   * ----------------------------------------------------------
   * RESULTADO FINANCEIRO
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "REVALIDAÇÃO APROVADA"
  );

  console.log(
    "--------------------------------------------------"
  );

  console.log(
    `Preço atual:              ${money(
      currentPromotion.buyerPrice
    )}`
  );

  console.log(
    `Benefício ML atual:       ${money(
      currentPromotion.feeBenefit ?? 0
    )}`
  );

  console.log(
    `Margem atual:             ${percent(
      financial.netMargin
    )}`
  );

  console.log(
    `Margem mínima:            ${percent(
      financial.minimumMargin
    )}`
  );


  /**
   * ----------------------------------------------------------
   * DRY RUN
   * ----------------------------------------------------------
   */

  if (
    botConfig.execution
      ?.dryRun === true
  ) {
    stats.dryRunApproved++;

    console.log("");
    console.log(
      "🧪 DRY RUN — APROVADA PARA APLICAÇÃO."
    );

    console.log(
      "Nenhum POST foi enviado."
    );


    const result = {
      itemId,

      type:
        currentPromotion.type,

      campaign:
        promotionLabel(
          currentPromotion
        ),

      price:
        currentPromotion.buyerPrice,

      margin:
        financial.netMargin,

      minimumMargin:
        financial.minimumMargin,
    };


    report.dryRun.push(
      result
    );


    return {
      status: "dry-run-approved",
      ...result,
    };
  }



console.log("");
console.log(
  "🚀 Aplicando promoção..."
);


try {

  const response =
    await applyPromotion({
      itemId,

      promotion:
        currentPromotion,
    });


    stats.applied++;


    console.log("");
    console.log(
      "✅ APLICADA COM SUCESSO."
    );


    const result = {
      itemId,

      type:
        currentPromotion.type,

      campaign:
        promotionLabel(
          currentPromotion
        ),

      price:
        currentPromotion.buyerPrice,

      margin:
        financial.netMargin,

      response,
    };


    report.applied.push(
      result
    );


    await sleep(
      botConfig.execution
        ?.delayAfterPostMs
    );


    return {
      status: "applied",
      ...result,
    };

  } catch (err) {
    const reason =
      getErrorMessage(err);


    /**
     * LIGHTNING sem estoque suficiente.
     */

    if (
      currentPromotion.type ===
        "LIGHTNING" &&
      botConfig.safety
        ?.skipLightningWithoutStock ===
        true &&
      isStockError(reason)
    ) {
      stats.stockSkipped++;

      console.log("");
      console.log(
        `⏭ LIGHTNING IGNORADA — ${reason}`
      );


      report.stock.push({
        itemId,

        type:
          currentPromotion.type,

        campaign:
          promotionLabel(
            currentPromotion
          ),

        reason,
      });


      return {
        status: "stock-skipped",
        reason,
      };
    }


    /**
     * Demais erros de API.
     */

    stats.apiFailures++;

    console.log("");
    console.log(
      `❌ POST recusado — ${reason}`
    );


    report.failures.push({
      itemId,

      type:
        currentPromotion.type,

      campaign:
        promotionLabel(
          currentPromotion
        ),

      stage:
        "post",

      reason,
    });


    if (
      botConfig.safety
        ?.continueAfterError === false
    ) {
      throw err;
    }


    return {
      status: "api-error",
      reason,
    };
  }
}


/**
 * ============================================================
 * EXECUTAR O BOT
 * ============================================================
 *
 * Esta é a função principal que a futura interface
 * web utilizará.
 *
 * Exemplo futuro:
 *
 * const result = await runPromotionBot();
 *
 * ============================================================
 */

export async function runPromotionBot() {


    const botConfig =
    getBotConfig();

  /**
   * ----------------------------------------------------------
   * BOT HABILITADO?
   * ----------------------------------------------------------
   */

  if (
    botConfig.execution
      ?.enabled !== true
  ) {
    console.log("");
    console.log(
      "=================================================="
    );

    console.log(
      "BOT DESATIVADO"
    );

    console.log(
      "=================================================="
    );

    return {
      success: false,

      disabled: true,

      stats:
        createStats(),

      report:
        createReport(),
    };
  }


  /**
   * ----------------------------------------------------------
   * VARREDURA
   * ----------------------------------------------------------
   */

  console.log("");
  console.log(
    "🔎 Executando varredura financeira..."
  );


  const scanResult =
    await scanPromotionOpportunities();


  const opportunities =
    scanResult.opportunities;


  /**
   * ----------------------------------------------------------
   * ESTATÍSTICAS
   * ----------------------------------------------------------
   */

  const stats =
    createStats();

  const report =
    createReport();


  stats.received =
    opportunities.length;


  console.log("");
  console.log(
    `📦 ${opportunities.length} oportunidade(s) elegível(is) recebida(s).`
  );


  /**
   * ----------------------------------------------------------
   * AGRUPAMENTO
   * ----------------------------------------------------------
   */

  const grouped =
    groupOpportunitiesByItem(
      opportunities
    );


  console.log(
    `📦 ${grouped.size} anúncio(s) possuem oportunidades elegíveis.`
  );


  /**
   * ----------------------------------------------------------
   * PROCESSAMENTO
   * ----------------------------------------------------------
   */

  let itemCounter = 0;


  for (
    const [
      itemId,
      itemOpportunities,
    ]
    of grouped.entries()
  ) {
    itemCounter++;


    console.log("");
    console.log("");
    console.log(
      "##################################################"
    );

    console.log(
      `ANÚNCIO ${itemCounter}/${grouped.size} — ${itemId}`
    );

    console.log(
      `Oportunidades elegíveis: ${itemOpportunities.length}`
    );

    console.log(
      "##################################################"
    );


    /**
     * Mostrar prioridade.
     */

    if (
      itemOpportunities.length > 1
    ) {
      console.log("");
      console.log(
        "Ordem de processamento:"
      );


      itemOpportunities.forEach(
        (
          opportunity,
          index
        ) => {
          console.log(
            `   ${index + 1}. ${
              opportunity
                ?.promotion
                ?.type ??
              "N/D"
            } | ${promotionLabel(
              opportunity
                ?.promotion
            )}`
          );
        }
      );
    }


    /**
     * Processar oportunidades.
     */

    for (
      let i = 0;
      i < itemOpportunities.length;
      i++
    ) {
      const opportunity =
        itemOpportunities[i];


      console.log("");
      console.log(
        `Oportunidade ${i + 1}/${itemOpportunities.length}`
      );


      try {
        await processPromotionOpportunity(
          opportunity,
          {
            stats,
            report,
          }
        );

      } catch (err) {
        stats.unexpectedFailures++;

        const reason =
          getErrorMessage(err);


        console.log("");
        console.log(
          `❌ ERRO NÃO TRATADO — ${reason}`
        );


        report.failures.push({
          itemId,

          type:
            opportunity
              ?.promotion
              ?.type ??
            "N/D",

          campaign:
            promotionLabel(
              opportunity
                ?.promotion
            ),

          stage:
            "unexpected",

          reason,
        });


        if (
          botConfig.safety
            ?.continueAfterError ===
            false
        ) {
          throw err;
        }
      }


      await sleep(
        botConfig.execution
          ?.delayBetweenPromotionsMs
      );
    }
  }


  /**
   * ----------------------------------------------------------
   * RESULTADO
   * ----------------------------------------------------------
   *
   * Muito importante:
   *
   * Em vez de somente imprimir no terminal,
   * agora DEVOLVEMOS os resultados.
   *
   * A interface poderá consumir esse objeto.
   */
console.log("");
console.log(
  "✅ PROMOTION RUNNER FINALIZADO."
);
console.log(
  `Anúncios processados: ${grouped.size}`
);
console.log(
  `Oportunidades processadas: ${opportunities.length}`
);

  return {
    success: true,

    dryRun:
      botConfig.execution
        ?.dryRun === true,

    stats,

    report,

    scan: {
      opportunities:
        opportunities.length,

      items:
        grouped.size,
    },
  };
}


/**
 * ============================================================
 * RELATÓRIO PARA TERMINAL
 * ============================================================
 *
 * A interface web não precisa usar esta função.
 * Ela poderá renderizar os dados retornados pelo runner.
 * ============================================================
 */

export function printPromotionBotResult(
  result
) {
  if (!result) {
    return;
  }


  const stats =
    result.stats ??
    createStats();


  console.log("");
  console.log("");
  console.log(
    "=================================================="
  );

  console.log(
    "RESULTADO FINAL — APLICAÇÃO DE PROMOÇÕES"
  );

  console.log(
    "=================================================="
  );


  console.log(
    `Oportunidades recebidas:       ${stats.received}`
  );

  console.log(
    `Tipos suportados:              ${stats.supported}`
  );

  console.log(
    `Tipos ignorados:               ${stats.ignoredType}`
  );

  console.log(
    `Revalidadas:                   ${stats.revalidated}`
  );

  console.log(
    `Aprovadas após revalidação:    ${stats.approvedAfterRevalidation}`
  );

  console.log(
    `Bloqueadas na revalidação:     ${stats.blockedRevalidation}`
  );

  console.log(
    `Bloqueadas por margem:         ${stats.blockedMargin}`
  );

  console.log(
    `Condição/status mudou:         ${stats.changedCondition}`
  );

  console.log(
    `LIGHTNING ignorada/estoque:    ${stats.stockSkipped}`
  );


  if (
    result.dryRun === true
  ) {
    console.log(
      `Aprovadas no DRY RUN:          ${stats.dryRunApproved}`
    );
  }


  console.log(
    `Aplicadas:                     ${stats.applied}`
  );

  console.log(
    `Falhas de API:                 ${stats.apiFailures}`
  );

  console.log(
    `Falhas inesperadas:            ${stats.unexpectedFailures}`
  );


  console.log("");
  console.log(
    "--------------------------------------------------"
  );


  if (
    result.dryRun === true
  ) {
    console.log(
      "🧪 MODO DRY RUN ATIVO"
    );

    console.log(
      "Nenhuma promoção foi alterada."
    );

  } else {
    console.log(
      "🚀 MODO PRODUÇÃO ATIVO"
    );

    console.log(
      "Promoções aprovadas podem ter sido enviadas ao Mercado Livre."
    );
  }


  console.log(
    "=================================================="
  );
}