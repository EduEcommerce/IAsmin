import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";


/**
 * ============================================================
 * SETTINGS SERVICE
 * ============================================================
 *
 * Responsável por:
 *
 * - Ler data/bot-settings.json
 * - Validar configurações
 * - Salvar configurações
 * - Fornecer valores padrão
 * - Impedir configurações inválidas
 *
 * IMPORTANTE:
 * Este serviço NÃO aplica promoções.
 *
 * ============================================================
 */


/**
 * ============================================================
 * CAMINHOS
 * ============================================================
 */

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const SETTINGS_PATH =
  path.join(
    __dirname,
    "..",
    "..",
    "data",
    "bot-settings.json"
  );


/**
 * ============================================================
 * TIPOS CONHECIDOS
 * ============================================================
 */

export const KNOWN_PROMOTION_TYPES = [
  "SMART",
  "DEAL",
  "LIGHTNING",
  "PRICE_DISCOUNT",
  "DOD",
  "PRE_NEGOTIATED",
  "BANK",
  "PRICE_MATCHING",
  "SELLER_COUPON_CAMPAIGN",
  "UNHEALTHY_STOCK",
];


/**
 * ============================================================
 * CONFIGURAÇÃO PADRÃO
 * ============================================================
 */

const DEFAULT_SETTINGS = {
  version: 1,

  execution: {
    enabled: true,

    /**
     * Segurança:
     * padrão sempre DRY RUN.
     */
    dryRun: true,

    autoRunEnabled: false,

    intervalMinutes: 15,
  },

  margins: {
    national: 9,
    imported: 15,
  },

  promotionTypes: {
    SMART: true,
    DEAL: true,
    LIGHTNING: true,
    PRICE_DISCOUNT: true,
    DOD: true,
    PRE_NEGOTIATED: true,

    BANK: false,
    PRICE_MATCHING: false,
    SELLER_COUPON_CAMPAIGN: false,
    UNHEALTHY_STOCK: false,
  },

  campaignPriority: [
    "Aumente sua competitividade",
    "Melhore sua exposição",
    "Impulsione suas vendas",
  ],

  safety: {
    requireCandidateStatus: true,
    skipLightningWithoutStock: true,
    continueAfterError: true,
  },
};


/**
 * ============================================================
 * UTILITÁRIOS
 * ============================================================
 */

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function toFiniteNumber(
  value,
  fallback
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function toBoolean(
  value,
  fallback
) {
  return typeof value === "boolean"
    ? value
    : fallback;
}


/**
 * ============================================================
 * GARANTIR DIRETÓRIO
 * ============================================================
 */

function ensureDataDirectory() {
  const directory =
    path.dirname(
      SETTINGS_PATH
    );

  if (
    !fs.existsSync(directory)
  ) {
    fs.mkdirSync(
      directory,
      {
        recursive: true,
      }
    );
  }
}


/**
 * ============================================================
 * NORMALIZAÇÃO
 * ============================================================
 */

export function normalizeSettings(
  input = {}
) {
  const source =
    isObject(input)
      ? input
      : {};


  const normalized =
    clone(
      DEFAULT_SETTINGS
    );


  /**
   * VERSION
   */

  normalized.version =
    toFiniteNumber(
      source.version,
      DEFAULT_SETTINGS.version
    );


  /**
   * EXECUTION
   */

  const execution =
    isObject(source.execution)
      ? source.execution
      : {};


  normalized.execution.enabled =
    toBoolean(
      execution.enabled,
      DEFAULT_SETTINGS
        .execution
        .enabled
    );


  normalized.execution.dryRun =
    toBoolean(
      execution.dryRun,
      DEFAULT_SETTINGS
        .execution
        .dryRun
    );


  normalized.execution.autoRunEnabled =
    toBoolean(
      execution.autoRunEnabled,
      DEFAULT_SETTINGS
        .execution
        .autoRunEnabled
    );


  normalized.execution.intervalMinutes =
    Math.max(
      1,
      Math.round(
        toFiniteNumber(
          execution.intervalMinutes,
          DEFAULT_SETTINGS
            .execution
            .intervalMinutes
        )
      )
    );


  /**
   * MARGENS
   */

  const margins =
    isObject(source.margins)
      ? source.margins
      : {};


  normalized.margins.national =
    Math.max(
      0,
      Math.min(
        100,
        toFiniteNumber(
          margins.national,
          DEFAULT_SETTINGS
            .margins
            .national
        )
      )
    );


  normalized.margins.imported =
    Math.max(
      0,
      Math.min(
        100,
        toFiniteNumber(
          margins.imported,
          DEFAULT_SETTINGS
            .margins
            .imported
        )
      )
    );


  /**
   * TIPOS DE PROMOÇÃO
   */

  const promotionTypes =
    isObject(source.promotionTypes)
      ? source.promotionTypes
      : {};


  for (
    const type
    of KNOWN_PROMOTION_TYPES
  ) {
    normalized
      .promotionTypes[type] =
        toBoolean(
          promotionTypes[type],
          DEFAULT_SETTINGS
            .promotionTypes[type]
        );
  }


  /**
   * PRIORIDADE
   */

  if (
    Array.isArray(
      source.campaignPriority
    )
  ) {
    normalized.campaignPriority =
      source.campaignPriority
        .filter(
          (item) =>
            typeof item ===
              "string" &&
            item.trim().length > 0
        )
        .map(
          (item) =>
            item.trim()
        );
  }


  /**
   * SAFETY
   */

  const safety =
    isObject(source.safety)
      ? source.safety
      : {};


  normalized
    .safety
    .requireCandidateStatus =
      toBoolean(
        safety.requireCandidateStatus,
        DEFAULT_SETTINGS
          .safety
          .requireCandidateStatus
      );


  normalized
    .safety
    .skipLightningWithoutStock =
      toBoolean(
        safety.skipLightningWithoutStock,
        DEFAULT_SETTINGS
          .safety
          .skipLightningWithoutStock
      );


  normalized
    .safety
    .continueAfterError =
      toBoolean(
        safety.continueAfterError,
        DEFAULT_SETTINGS
          .safety
          .continueAfterError
      );


  return normalized;
}


/**
 * ============================================================
 * VALIDAÇÃO
 * ============================================================
 */

export function validateSettings(
  settings
) {
  const errors = [];


  if (!isObject(settings)) {
    errors.push(
      "Configuração inválida."
    );

    return {
      valid: false,
      errors,
    };
  }


  /**
   * MARGEM NACIONAL
   */

  if (
    !Number.isFinite(
      Number(
        settings
          ?.margins
          ?.national
      )
    )
  ) {
    errors.push(
      "Margem nacional inválida."
    );
  }


  /**
   * MARGEM IMPORTADO
   */

  if (
    !Number.isFinite(
      Number(
        settings
          ?.margins
          ?.imported
      )
    )
  ) {
    errors.push(
      "Margem de importados inválida."
    );
  }


  /**
   * INTERVALO
   */

  const interval =
    Number(
      settings
        ?.execution
        ?.intervalMinutes
    );


  if (
    !Number.isFinite(interval) ||
    interval < 1
  ) {
    errors.push(
      "O intervalo automático deve ser de pelo menos 1 minuto."
    );
  }


  /**
   * PRIORIDADE
   */

  if (
    !Array.isArray(
      settings.campaignPriority
    )
  ) {
    errors.push(
      "A prioridade das campanhas deve ser uma lista."
    );
  }


  return {
    valid:
      errors.length === 0,

    errors,
  };
}


/**
 * ============================================================
 * LER CONFIGURAÇÕES
 * ============================================================
 */

export function getSettings() {
  ensureDataDirectory();


  /**
   * Se não existir, cria com padrão.
   */

  if (
    !fs.existsSync(
      SETTINGS_PATH
    )
  ) {
    const defaults =
      clone(
        DEFAULT_SETTINGS
      );


    fs.writeFileSync(
      SETTINGS_PATH,
      JSON.stringify(
        defaults,
        null,
        2
      ),
      "utf8"
    );


    return defaults;
  }


  try {

    const content =
      fs.readFileSync(
        SETTINGS_PATH,
        "utf8"
      );


    const parsed =
      JSON.parse(
        content
      );


    return normalizeSettings(
      parsed
    );

  } catch (err) {

    console.error(
      "❌ Erro ao ler bot-settings.json:"
    );

    console.error(
      err?.message ??
      err
    );


    /**
     * Segurança:
     *
     * Se o arquivo estiver quebrado,
     * NÃO ativamos produção por engano.
     */

    const fallback =
      clone(
        DEFAULT_SETTINGS
      );


    fallback.execution.dryRun =
      true;


    fallback.execution.autoRunEnabled =
      false;


    return fallback;
  }
}


/**
 * ============================================================
 * SALVAR CONFIGURAÇÕES
 * ============================================================
 */

export function saveSettings(
  input
) {
  ensureDataDirectory();


  const normalized =
    normalizeSettings(
      input
    );


  const validation =
    validateSettings(
      normalized
    );


  if (
    !validation.valid
  ) {
    const error =
      new Error(
        validation.errors.join(
          " "
        )
      );


    error.code =
      "INVALID_SETTINGS";


    error.validationErrors =
      validation.errors;


    throw error;
  }


  /**
   * Grava primeiro em arquivo temporário.
   *
   * Evita deixar o JSON parcialmente
   * escrito caso algo dê errado.
   */

  const temporaryPath =
    `${SETTINGS_PATH}.tmp`;


  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(
      normalized,
      null,
      2
    ),
    "utf8"
  );


  fs.renameSync(
    temporaryPath,
    SETTINGS_PATH
  );


  return normalized;
}


/**
 * ============================================================
 * ATUALIZAÇÃO PARCIAL
 * ============================================================
 */

export function updateSettings(
  patch = {}
) {
  const current =
    getSettings();


  const next =
    clone(
      current
    );


  /**
   * EXECUTION
   */

  if (
    isObject(
      patch.execution
    )
  ) {
    next.execution = {
      ...next.execution,
      ...patch.execution,
    };
  }


  /**
   * MARGINS
   */

  if (
    isObject(
      patch.margins
    )
  ) {
    next.margins = {
      ...next.margins,
      ...patch.margins,
    };
  }


  /**
   * PROMOTION TYPES
   */

  if (
    isObject(
      patch.promotionTypes
    )
  ) {
    next.promotionTypes = {
      ...next.promotionTypes,
      ...patch.promotionTypes,
    };
  }


  /**
   * SAFETY
   */

  if (
    isObject(
      patch.safety
    )
  ) {
    next.safety = {
      ...next.safety,
      ...patch.safety,
    };
  }


  /**
   * PRIORIDADES
   */

  if (
    Array.isArray(
      patch.campaignPriority
    )
  ) {
    next.campaignPriority =
      patch.campaignPriority;
  }


  return saveSettings(
    next
  );
}


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

export function getEnabledTypes() {
  const settings =
    getSettings();


  return Object
    .entries(
      settings.promotionTypes
    )
    .filter(
      ([, enabled]) =>
        enabled === true
    )
    .map(
      ([type]) =>
        type
    );
}


export function getDisabledTypes() {
  const settings =
    getSettings();


  return Object
    .entries(
      settings.promotionTypes
    )
    .filter(
      ([, enabled]) =>
        enabled !== true
    )
    .map(
      ([type]) =>
        type
    );
}


/**
 * ============================================================
 * MARGEM MÍNIMA
 * ============================================================
 */

export function getMinimumMargin(
  classification
) {
  const settings =
    getSettings();


  const value =
    String(
      classification ??
      ""
    )
      .trim()
      .toUpperCase();


  if (
    value === "IMPORTADO" ||
    value === "IMPORTED"
  ) {
    return settings
      .margins
      .imported;
  }


  return settings
    .margins
    .national;
}


/**
 * ============================================================
 * EXPORTAR CAMINHO
 *
 * Útil apenas para diagnóstico.
 * ============================================================
 */

export function getSettingsPath() {
  return SETTINGS_PATH;
}