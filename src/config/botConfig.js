import {
  getSettings,
} from "../services/settingsService.js";


/**
 * ============================================================
 * BOT CONFIG
 * ============================================================
 *
 * Configuração utilizada pelo motor do bot.
 *
 * As configurações operacionais são carregadas de:
 *
 * data/bot-settings.json
 *
 * através de:
 *
 * settingsService.js
 *
 * Configurações técnicas continuam definidas neste arquivo.
 *
 * ============================================================
 */


/**
 * ============================================================
 * CONFIGURAÇÕES TÉCNICAS
 * ============================================================
 *
 * Estes valores ainda não são editáveis pelo painel.
 */

const TECHNICAL_CONFIG = {

  execution: {

    /**
     * Intervalo entre o processamento
     * de oportunidades.
     */
    delayBetweenPromotionsMs: 800,


    /**
     * Espera depois de um POST real.
     */
    delayAfterPostMs: 1500,
  },


  safety: {

    /**
     * Sempre revalidar imediatamente
     * antes de aplicar uma promoção.
     *  
     * Mantemos esta proteção fixa.
     */
    revalidateBeforePost: true,
  },
};


/**
 * ============================================================
 * CRIAR CONFIGURAÇÃO
 * ============================================================
 */

function buildBotConfig() {

  const settings =
    getSettings();


  return {

    /**
     * ========================================================
     * EXECUÇÃO
     * ========================================================
     */

    execution: {

      enabled:
        settings.execution.enabled,

      dryRun:
        settings.execution.dryRun,

      autoRunEnabled:
        settings.execution.autoRunEnabled,

      intervalMinutes:
        settings.execution.intervalMinutes,

      delayBetweenPromotionsMs:
        TECHNICAL_CONFIG
          .execution
          .delayBetweenPromotionsMs,

      delayAfterPostMs:
        TECHNICAL_CONFIG
          .execution
          .delayAfterPostMs,
    },


    /**
     * ========================================================
     * MARGENS
     * ========================================================
     */

    margins: {

      national:
        settings.margins.national,

      imported:
        settings.margins.imported,
    },


    /**
     * ========================================================
     * TIPOS DE PROMOÇÃO
     * ========================================================
     */

    promotionTypes: {
      ...settings.promotionTypes,
    },


    /**
     * ========================================================
     * PRIORIDADE
     * ========================================================
     */

    campaignPriority: [
      ...settings.campaignPriority,
    ],


    /**
     * ========================================================
     * SEGURANÇA
     * ========================================================
     */

    safety: {

      /**
       * Esta proteção permanece fixa.
       */

      revalidateBeforePost:
        TECHNICAL_CONFIG
          .safety
          .revalidateBeforePost,


      /**
       * Estas vêm das configurações persistentes.
       */

      requireCandidateStatus:
        settings
          .safety
          .requireCandidateStatus,

      skipLightningWithoutStock:
        settings
          .safety
          .skipLightningWithoutStock,

      continueAfterError:
        settings
          .safety
          .continueAfterError,
    },
  };
}


/**
 * ============================================================
 * CONFIGURAÇÃO INICIAL
 * ============================================================
 *
 * Mantemos este export por compatibilidade com os arquivos
 * existentes que já fazem:
 *
 * import { botConfig } from "./config/botConfig.js";
 */

export let botConfig =
  buildBotConfig();


/**
 * ============================================================
 * RECARREGAR CONFIGURAÇÕES
 * ============================================================
 *
 * Depois que o painel salvar alguma alteração, podemos chamar
 * esta função para atualizar o bot sem reiniciar o servidor.
 */

export function reloadBotConfig() {

  botConfig =
    buildBotConfig();


  return botConfig;
}


/**
 * ============================================================
 * CONSULTAR CONFIGURAÇÃO ATUAL
 * ============================================================
 */

export function getBotConfig() {

  return botConfig;
}