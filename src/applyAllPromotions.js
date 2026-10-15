import "dotenv/config";

import { botConfig } from "./config/botConfig.js";

import {
  runPromotionBot,
  printPromotionBotResult,
  getEnabledPromotionTypes,
  getDisabledPromotionTypes,
} from "./services/promotionRunner.js";


/**
 * ============================================================
 * APLICADOR AUTOMÁTICO DE PROMOÇÕES — TERMINAL
 * ============================================================
 *
 * Este arquivo é apenas o ponto de entrada do terminal.
 *
 * Toda a lógica do bot está em:
 *
 * src/services/promotionRunner.js
 *
 * Assim, o mesmo motor poderá ser utilizado futuramente por:
 *
 * - Terminal
 * - Interface Web
 * - API
 * - Agendador
 *
 * ============================================================
 */


function printHeader() {
  console.log("");
  console.log(
    "=================================================="
  );

  console.log(
    "APLICADOR AUTOMÁTICO DE PROMOÇÕES"
  );

  console.log(
    "=================================================="
  );


  console.log(
    `BOT:                ${
      botConfig.execution?.enabled === true
        ? "ATIVO"
        : "DESATIVADO"
    }`
  );


  console.log(
    `DRY RUN:            ${
      botConfig.execution?.dryRun === true
        ? "SIM"
        : "NÃO"
    }`
  );


  console.log(
    `POSTS REAIS:        ${
      botConfig.execution?.dryRun === true
        ? "DESABILITADOS"
        : "HABILITADOS"
    }`
  );


  /**
   * ==========================================================
   * TIPOS HABILITADOS
   * ==========================================================
   */

  console.log("");
  console.log(
    "Tipos automáticos:"
  );


  const enabledTypes =
    getEnabledPromotionTypes();


  if (
    enabledTypes.length === 0
  ) {
    console.log(
      "   Nenhum tipo habilitado."
    );
  } else {
    for (
      const type
      of enabledTypes
    ) {
      console.log(
        `   ✓ ${type}`
      );
    }
  }


  /**
   * ==========================================================
   * TIPOS DESABILITADOS
   * ==========================================================
   */

  console.log("");
  console.log(
    "Tipos desabilitados:"
  );


  const disabledTypes =
    getDisabledPromotionTypes();


  if (
    disabledTypes.length === 0
  ) {
    console.log(
      "   Nenhum."
    );
  } else {
    for (
      const type
      of disabledTypes
    ) {
      console.log(
        `   - ${type}`
      );
    }
  }


  /**
   * ==========================================================
   * PRIORIDADE DAS CAMPANHAS
   * ==========================================================
   */

  console.log("");
  console.log(
    "Prioridade das campanhas:"
  );


  const priorities =
    botConfig.campaignPriority ?? [];


  if (
    priorities.length === 0
  ) {
    console.log(
      "   Nenhuma prioridade específica."
    );
  } else {
    priorities.forEach(
      (name, index) => {
        console.log(
          `   ${index + 1}. ${name}`
        );
      }
    );
  }
}


/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  printHeader();


  /**
   * Bot desabilitado.
   */

  if (
    botConfig.execution?.enabled !== true
  ) {
    console.log("");
    console.log(
      "⚠️ Bot desativado em botConfig.js."
    );

    console.log(
      "Nenhuma operação será executada."
    );

    return;
  }


  /**
   * Executa o motor central.
   */

  const result =
    await runPromotionBot();


  /**
   * Exibe o resultado no terminal.
   */

  printPromotionBotResult(
    result
  );


  console.log("");
  console.log(
    "Processamento concluído."
  );
}


/**
 * ============================================================
 * EXECUÇÃO
 * ============================================================
 */

main()
  .catch((err) => {
    console.error("");
    console.error(
      "=================================================="
    );

    console.error(
      "❌ ERRO FATAL"
    );

    console.error(
      "=================================================="
    );

    console.error(
      err?.message ??
      err
    );

    process.exitCode = 1;
  });