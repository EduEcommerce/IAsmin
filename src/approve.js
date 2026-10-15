import "dotenv/config";
import readline from "readline";

import {
  getAvailableStock,
} from "./core/mlClient.js";

import {
  getBotConfig,
} from "./config/botConfig.js";

import {
  getPending,
  removeFromQueue,
} from "./queue.js";

import {
  applyPromotion,
} from "./core/promotionApplier.js";

import {
  analyzeFinancial,
} from "./core/financial.js";

import {
  getNormalizedItemPromotions,
} from "./services/promotionAnalyzer.js";


// ─────────────────────────────────────────────
// TERMINAL
// ─────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question) =>
  new Promise((resolve) => {
    rl.question(question, resolve);
  });


// ─────────────────────────────────────────────
// FORMATADORES
// ─────────────────────────────────────────────

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


// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  const pending = getPending();

  if (pending.length === 0) {
    console.log(
      "Nenhum candidato pendente na fila."
    );

    rl.close();
    return;
  }

  console.log(
    `\n${pending.length} candidato(s) aguardando aprovação.`
  );

  console.log(
    "\nCada candidato será recalculado antes da aprovação."
  );


  // ───────────────────────────────────────────
  // ANALISA CADA CANDIDATO
  // ───────────────────────────────────────────

  for (const candidate of pending) {

    console.log(
      "\n=================================================="
    );

    console.log("CANDIDATO");

    console.log(
      "=================================================="
    );

    console.log(
      `Item:              ${candidate.itemId}`
    );

    console.log(
      `Promoção:          ${candidate.promotionId}`
    );

    console.log(
      `Tipo promoção:     ${candidate.promotionType}`
    );

    console.log(
      `Preço original:    ${
        candidate.originalPrice != null
          ? money(candidate.originalPrice)
          : "N/D"
      }`
    );

    console.log(
      `Preço promoção:    ${money(candidate.dealPrice)}`
    );

    console.log(
      `Adicionado à fila: ${candidate.queuedAt ?? "N/D"}`
    );


    // ─────────────────────────────────────────
    // REVALIDAÇÃO
    // ─────────────────────────────────────────

    console.log(
      "\n🔄 Recalculando condições financeiras..."
    );

    // ─────────────────────────────────────────
// PREÇO OFICIAL PARA REVALIDAÇÃO
// ─────────────────────────────────────────

let revalidationPrice =
  candidate.dealPrice;

let revalidatedPromotion =
  null;


/**
 * UNHEALTHY_STOCK possui uma regra mais rígida.
 *
 * NÃO reutilizamos simplesmente o preço salvo
 * anteriormente na fila.
 *
 * Consultamos novamente o Mercado Livre.
 */
if (
  candidate.promotionType ===
  "UNHEALTHY_STOCK"
) {

  console.log(
    "\n🔎 Reconsultando oportunidade UNHEALTHY_STOCK no Mercado Livre..."
  );


  let currentPromotions;

  try {

    currentPromotions =
      await getNormalizedItemPromotions(
        candidate.itemId
      );

  } catch (err) {

    console.log(
      "\n⛔ Não foi possível consultar novamente a oportunidade no Mercado Livre."
    );

    console.log(
      `Motivo: ${
        err?.response?.data?.message ||
        err?.mlBody?.message ||
        err?.message ||
        "erro desconhecido"
      }`
    );

    console.log(
      "Por segurança, nenhum POST será realizado."
    );

    console.log(
      "O candidato continuará na fila."
    );

    continue;
  }


  /**
   * Procuramos EXATAMENTE:
   *
   * - UNHEALTHY_STOCK
   * - mesma promotion_id
   * - status candidate
   */

  const matchingPromotions =
    currentPromotions.filter(
      (promotion) =>
        promotion?.type ===
          "UNHEALTHY_STOCK" &&

        String(
          promotion?.id
        ) ===
        String(
          candidate.promotionId
        ) &&

        promotion?.status ===
          "candidate"
    );


  if (
    matchingPromotions.length === 0
  ) {

    console.log(
      "\n⛔ A oportunidade UNHEALTHY_STOCK original não está mais disponível."
    );

    console.log(
      `promotion_id esperado: ${candidate.promotionId}`
    );

    console.log(
      "Nenhum POST será realizado."
    );

    console.log(
      "O candidato continuará na fila."
    );

    continue;
  }


  /**
   * Precisamos encontrar a MESMA oferta.
   *
   * Não aceitamos trocar silenciosamente
   * por outro offer_id.
   */

  const expectedOfferId =
    candidate.promotionData
      ?.offerId ??
    candidate.promotionData
      ?.offer_id ??
    candidate.offerId ??
    null;


  if (!expectedOfferId) {

    console.log(
      "\n⛔ Candidato da fila não possui offer_id original."
    );

    console.log(
      "Rode novamente a detecção para reconstruir esse candidato."
    );

    console.log(
      "Nenhum POST será realizado."
    );

    continue;
  }


  revalidatedPromotion =
    matchingPromotions.find(
      (promotion) => {

        const currentOfferId =
          promotion?.offerId ??
          promotion?.offer_id ??
          promotion?.refId ??
          promotion?.ref_id ??
          null;

        return (
          String(
            currentOfferId
          ) ===
          String(
            expectedOfferId
          )
        );
      }
    );


  if (!revalidatedPromotion) {

    console.log(
      "\n⛔ O offer_id original não está mais disponível."
    );

    console.log(
      `offer_id esperado: ${expectedOfferId}`
    );

    console.log(
      "O bot NÃO substituirá por outra oferta."
    );

    console.log(
      "Nenhum POST será realizado."
    );

    continue;
  }


  /**
   * PRICE:
   *
   * somente o preço oficial retornado agora
   * pelo Mercado Livre.
   */

  const currentOfficialPrice =
    Number(
      revalidatedPromotion.buyerPrice
    );


  if (
    revalidatedPromotion
      .priceWasCalculated ===
      true ||

    !revalidatedPromotion
      .officialPriceSource ||

    !Number.isFinite(
      currentOfficialPrice
    ) ||

    currentOfficialPrice <= 0
  ) {

    console.log(
      "\n⛔ O Mercado Livre não retornou um price oficial válido na revalidação."
    );

    console.log(
      "O bot NÃO calculará nem inferirá um preço."
    );

    console.log(
      "Nenhum POST será realizado."
    );

    continue;
  }


  revalidationPrice =
    currentOfficialPrice;


  console.log(
    `Preço salvo na fila:     ${money(candidate.dealPrice)}`
  );

  console.log(
    `Preço oficial atual ML:  ${money(revalidationPrice)}`
  );

  console.log(
    `Origem do price:         ${revalidatedPromotion.officialPriceSource}`
  );

  console.log(
    `offer_id confirmado:     ${expectedOfferId}`
  );
}

    let currentAnalysis;

    try {

      /*
       * Benefício de redução da tarifa informado
       * pelo Mercado Livre quando a oportunidade
       * disponibilizar esse campo.
       */
      const feeBenefit = Number(
        candidate.promotionData
          ?.discountMeliBoostAmount ?? 0
      );


      currentAnalysis =
        await analyzeFinancial({
          itemId: candidate.itemId,

          price: revalidationPrice,

          feeBenefit,

          promotionId:
            candidate.promotionId,

          promotionType:
            candidate.promotionType,
        });

    } catch (err) {

      console.log(
        `\n⛔ Não foi possível revalidar ${candidate.itemId}.`
      );

      console.log(
        `Motivo: ${
          err.response?.data?.message ||
          err.mlBody?.message ||
          err.message ||
          "erro desconhecido"
        }`
      );

      console.log(
        "Por segurança, esta promoção NÃO será aplicada."
      );

      console.log(
        "O candidato continuará na fila."
      );

      continue;
    }


    // ─────────────────────────────────────────
    // DADOS DA NOVA ANÁLISE
    // ─────────────────────────────────────────

    const oldFinancial =
      candidate.financial || null;

    const currentFinancial =
      currentAnalysis.financial;

    const product =
      currentAnalysis.product;


    // ─────────────────────────────────────────
    // IDENTIFICAÇÃO
    // ─────────────────────────────────────────

    console.log(
      "\n=================================================="
    );

    console.log(
      "REVALIDAÇÃO FINANCEIRA"
    );

    console.log(
      "=================================================="
    );

    console.log(
      `MLB:                 ${candidate.itemId}`
    );

    console.log(
      `SKU:                 ${currentAnalysis.sku}`
    );

    console.log(
      `Produto:             ${product.name}`
    );

    console.log(
      `EAN:                 ${product.ean || "N/D"}`
    );

    console.log(
      `Origem:              ${
        product.origin ?? "N/D"
      }`
    );

    console.log(
      `Classificação:       ${product.classification}`
    );


    // ─────────────────────────────────────────
    // COMPARAÇÃO DE MARGEM
    // ─────────────────────────────────────────

    console.log(
      "\nMARGEM"
    );

    console.log(
      "--------------------------------------------------"
    );

    if (oldFinancial) {
      console.log(
        `Margem na detecção:  ${percent(
          oldFinancial.netMargin
        )}`
      );
    }

    console.log(
      `Margem atual:         ${percent(
        currentFinancial.netMargin
      )}`
    );

    console.log(
      `Margem mínima:        ${percent(
        currentFinancial.minimumMargin
      )}`
    );

    console.log(
      `Folga atual:          ${
        currentFinancial.marginGap >= 0
          ? "+"
          : ""
      }${currentFinancial.marginGap.toFixed(2)} p.p.`
    );


    // ─────────────────────────────────────────
    // COMPOSIÇÃO FINANCEIRA
    // ─────────────────────────────────────────

    console.log(
      "\nCOMPOSIÇÃO ATUAL"
    );

    console.log(
      "--------------------------------------------------"
    );

    console.log(
      `Preço promoção:       ${money(
        currentFinancial.price
      )}`
    );

    console.log(
      `Último custo:         ${money(
        currentFinancial.productCost
      )}`
    );

    console.log(
      `Tarifa ML normal:     ${money(
        currentFinancial.normalSaleFee
      )}`
    );

    console.log(
      `Benefício informado:  ${money(
        currentFinancial.requestedFeeBenefit
      )}`
    );

    console.log(
      `Benefício utilizado:  ${money(
        currentFinancial.appliedFeeBenefit
      )}`
    );

    console.log(
      `Tarifa ML efetiva:    ${money(
        currentFinancial.effectiveSaleFee
      )}`
    );


    /*
     * Se o benefício for maior que a tarifa,
     * mostramos o excedente apenas para auditoria.
     *
     * Esse valor NÃO entra como receita.
     */
    if (
      currentFinancial.unusedFeeBenefit > 0
    ) {
      console.log(
        `Benefício excedente:  ${money(
          currentFinancial.unusedFeeBenefit
        )} (não vira receita)`
      );
    }


    console.log(
      `Frete:                ${money(
        currentFinancial.shippingCost
      )}`
    );

    console.log(
      `Imposto (${
        currentFinancial.taxPercent
      }%):          ${money(
        currentFinancial.taxAmount
      )}`
    );

    console.log(
      "--------------------------------------------------"
    );

    console.log(
      `Lucro líquido:        ${money(
        currentFinancial.netProfit
      )}`
    );

    console.log(
      `Margem líquida:       ${percent(
        currentFinancial.netMargin
      )}`
    );

    console.log(
      "=================================================="
    );


    // ─────────────────────────────────────────
    // SEGUNDA TRAVA DE SEGURANÇA
    // ─────────────────────────────────────────

    if (!currentFinancial.eligible) {

      console.log(
        "\n⚠️ CONDIÇÕES NÃO SÃO MAIS SEGURAS"
      );

      if (oldFinancial) {
        console.log(
          `Margem na detecção:  ${percent(
            oldFinancial.netMargin
          )}`
        );
      }

      console.log(
        `Margem atual:         ${percent(
          currentFinancial.netMargin
        )}`
      );

      console.log(
        `Margem mínima:        ${percent(
          currentFinancial.minimumMargin
        )}`
      );

      console.log(
        `Diferença:            ${
          currentFinancial.marginGap >= 0
            ? "+"
            : ""
        }${currentFinancial.marginGap.toFixed(2)} p.p.`
      );

      console.log(
        "\n⛔ PROMOÇÃO BLOQUEADA."
      );

      console.log(
        "Ela NÃO será enviada ao Mercado Livre."
      );

      console.log(
        "O candidato continuará na fila para nova análise."
      );

      continue;
    }


    // ─────────────────────────────────────────
    // ALTERAÇÃO DESDE A DETECÇÃO
    // ─────────────────────────────────────────

    if (oldFinancial) {

      const marginDifference =
        currentFinancial.netMargin -
        Number(oldFinancial.netMargin);

      if (Math.abs(marginDifference) >= 0.01) {

        console.log(
          "\nℹ️ A margem mudou desde a detecção."
        );

        console.log(
          `Margem anterior:     ${percent(
            oldFinancial.netMargin
          )}`
        );

        console.log(
          `Margem atual:        ${percent(
            currentFinancial.netMargin
          )}`
        );

        console.log(
          `Variação:            ${
            marginDifference >= 0
              ? "+"
              : ""
          }${marginDifference.toFixed(2)} p.p.`
        );
      }
    }


    // ─────────────────────────────────────────
    // APROVAÇÃO MANUAL
    // ─────────────────────────────────────────

    console.log(
      "\n✅ Margem revalidada."
    );

    console.log(
      "A promoção continua dentro da margem mínima."
    );

    const answer = (
      await ask(
        "\nAprovar esta promoção? [s/N/q para sair] "
      )
    )
      .trim()
      .toLowerCase();


    // SAIR
    if (answer === "q") {

      console.log(
        "\nSaindo."
      );

      console.log(
        "Os demais candidatos continuam pendentes."
      );

      break;
    }


    // APROVAR
    if (answer === "s") {

      console.log(
  "\n🚀 Enviando promoção ao Mercado Livre..."
);

try {

  // ─────────────────────────────────────────
  // LIGHTNING — VALIDAÇÃO FINAL DE ESTOQUE
  // ─────────────────────────────────────────

  if (
    candidate.promotionType ===
    "LIGHTNING"
  ) {

    /**
     * Somente LIGHTNING exige os limites
     * específicos de estoque da campanha.
     *
     * Outros tipos de promoção NÃO devem
     * passar por esta validação.
     */

    if (
      !candidate.promotionStock ||
      !Number.isFinite(
        Number(
          candidate.promotionStock.min
        )
      )
    ) {
      throw new Error(
        `Candidato LIGHTNING sem limites de estoque da campanha. ` +
        `Rode novamente a detecção para atualizar a fila.`
      );
    }


    console.log(
      "\n⚡ Verificando estoque atual para Oferta Relâmpago..."
    );


    const stockInfo =
      await getAvailableStock(
        candidate.itemId
      );


    const availableStock =
      Number(
        stockInfo.availableQuantity
      );


    const minStock =
      Number(
        candidate.promotionStock?.min
      );


    const maxStock =
      Number(
        candidate.promotionStock?.max
      );


    console.log(
      `Estoque disponível:   ${availableStock}`
    );


    if (
      Number.isFinite(
        minStock
      )
    ) {
      console.log(
        `Limite mínimo ML:     > ${minStock}`
      );
    }


    if (
      Number.isFinite(
        maxStock
      )
    ) {
      console.log(
        `Limite máximo ML:     < ${maxStock}`
      );
    }


    if (
      !Number.isFinite(
        availableStock
      ) ||
      availableStock <= 0
    ) {
      throw new Error(
        `Anúncio ${candidate.itemId} sem estoque disponível.`
      );
    }


    /**
     * Comportamento validado anteriormente:
     *
     * stock > min
     * stock < max
     */

    const highestAllowedStock =
      Number.isFinite(
        maxStock
      )
        ? maxStock - 1
        : availableStock;


    const selectedStock =
      Math.min(
        availableStock,
        highestAllowedStock
      );


    /**
     * Também precisamos garantir:
     *
     * selectedStock > min
     */

    if (
      Number.isFinite(
        minStock
      ) &&
      selectedStock <= minStock
    ) {
      throw new Error(
        `Estoque insuficiente para LIGHTNING. ` +
        `Disponível=${availableStock}, ` +
        `mínimo exigido=>${minStock}, ` +
        `máximo=<${maxStock}`
      );
    }


    if (
      selectedStock <= 0
    ) {
      throw new Error(
        `Nenhuma quantidade válida para LIGHTNING ${candidate.itemId}.`
      );
    }


    candidate.promotionStock = {
      ...(
        candidate.promotionStock ||
        {}
      ),

      selected:
        selectedStock,
    };


    console.log(
      `📦 Estoque que será reservado: ${selectedStock} unidades`
    );
  }

  if (
  candidate.promotionType ===
    "UNHEALTHY_STOCK" &&
  revalidatedPromotion
) {

  const currentOfferId =
    revalidatedPromotion.offerId ??
    revalidatedPromotion.offer_id ??
    revalidatedPromotion.refId ??
    revalidatedPromotion.ref_id ??
    null;


  /**
   * Atualizamos somente com valores
   * OFICIAIS que acabamos de revalidar.
   */

  candidate.dealPrice =
    revalidationPrice;


  candidate.promotionData = {
    ...(
      candidate.promotionData ||
      {}
    ),

    ...revalidatedPromotion,

    offerId:
      currentOfferId,
  };
}

const botConfig =
  getBotConfig();

if (
  botConfig.execution?.dryRun === true
) {
  console.log("");
  console.log(
    "🧪 DRY RUN — promoção aprovada, mas NÃO aplicada."
  );
  console.log(
    "Nenhum POST foi enviado ao Mercado Livre."
  );

  continue;
}

await applyPromotion({
  itemId: candidate.itemId,
  promotion: candidate.promotionData,
});

        console.log(
          "✅ Promoção aplicada com sucesso."
        );

        removeFromQueue(
          candidate.itemId,
          candidate.promotionId
        );

      } catch (err) {

        console.error(
          "\n❌ Falha ao aplicar promoção:",
          err.mlBody ||
          err.response?.data ||
          err.message
        );

        console.log(
          "O candidato foi mantido na fila para nova tentativa."
        );
      }

      continue;
    }


    // REJEITAR
    console.log(
      "\n⏭️ Promoção rejeitada manualmente."
    );

    removeFromQueue(
      candidate.itemId,
      candidate.promotionId
    );

    console.log(
      "Candidato removido da fila."
    );
  }


  // ───────────────────────────────────────────
  // FINALIZAÇÃO
  // ───────────────────────────────────────────

  rl.close();
}


// ─────────────────────────────────────────────
// EXECUÇÃO
// ─────────────────────────────────────────────

main().catch((err) => {

  console.error(
    "\n❌ Erro inesperado no processo de aprovação:",
    err.response?.data ||
    err.mlBody ||
    err.message ||
    err
  );

  rl.close();

  process.exitCode = 1;
});