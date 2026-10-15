import "dotenv/config";

import express from "express";
import path from "path";

import {
  botConfig,
  reloadBotConfig,
} from "./config/botConfig.js";

import { fileURLToPath } from "url";

import {
  runPromotionBot,
  getEnabledPromotionTypes,
  getDisabledPromotionTypes,
} from "./services/promotionRunner.js";

import {
  getSettings,
  updateSettings,
  getEnabledTypes,
  getDisabledTypes,
} from "./services/settingsService.js";



/**
 * ============================================================
 * SERVIDOR WEB — BOT DE PROMOÇÕES
 * ============================================================
 *
 * Primeira API da interface.
 *
 * Rotas:
 *
 * GET  /api/status
 * GET  /api/config
 * POST /api/run
 *
 * IMPORTANTE:
 * O servidor NÃO possui lógica financeira própria.
 * Ele utiliza o mesmo promotionRunner do terminal.
 * ============================================================
 */

const app = express();

const PORT =
  Number(process.env.PORT) || 3000;

  /**
 * ============================================================
 * DIRETÓRIOS
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

const publicPath =
  path.join(
    __dirname,
    "..",
    "public"
  );


/**
 * Permite receber JSON.
 */
app.use(express.json());

app.use(
  express.static(
    publicPath
  )
);

/**
 * ============================================================
 * CONTROLE DE EXECUÇÃO
 * ============================================================
 *
 * Evita executar duas varreduras simultaneamente.
 */

let botRunning = false;

let lastRun = null;


/**
 * ============================================================
 * GET /api/status
 * ============================================================
 */

app.get(
  "/api/status",
  (req, res) => {

    res.json({
      success: true,

      bot: {
        enabled:
          botConfig.execution
            ?.enabled === true,

        dryRun:
          botConfig.execution
            ?.dryRun === true,

        realPosts:
          botConfig.execution
            ?.dryRun !== true,

        running:
          botRunning,
      },

      lastRun,
    });
  }
);


/**
 * ============================================================
 * GET /api/config
 * ============================================================
 */

/**
 * ============================================================
 * GET /api/config
 * ============================================================
 *
 * Retorna as configurações persistentes do painel.
 * ============================================================
 */

app.get(
  "/api/config",
  (req, res) => {

    try {

      const settings =
        getSettings();


      res.json({
        success: true,

        execution:
          settings.execution,

        margins:
          settings.margins,

        promotionTypes: {
          enabled:
            getEnabledTypes(),

          disabled:
            getDisabledTypes(),

          values:
            settings.promotionTypes,
        },

        campaignPriority:
          settings.campaignPriority,

        safety:
          settings.safety,
      });

    } catch (err) {

      console.error(
        "❌ Erro ao consultar configurações:"
      );

      console.error(
        err?.message ?? err
      );


      res.status(500).json({
        success: false,

        error:
          err?.message ??
          "Erro ao consultar configurações.",
      });
    }
  }
);

/**
 * ============================================================
 * PUT /api/config
 * ============================================================
 *
 * Atualiza configurações persistentes.
 *
 * IMPORTANTE:
 * Nesta etapa o painel NÃO pode alterar:
 *
 * - dryRun
 * - enabled
 * - autoRunEnabled
 *
 * Esses controles serão tratados separadamente.
 * ============================================================
 */

app.put(
  "/api/config",
  (req, res) => {

    try {

      const body =
        req.body ?? {};


      /**
       * Montamos manualmente o patch.
       *
       * Isso impede que o frontend envie campos
       * sensíveis que ainda não queremos editar.
       */

      const patch = {};


      /**
       * MARGENS
       */

      if (
        body.margins &&
        typeof body.margins === "object"
      ) {
        patch.margins = {};


        if (
          body.margins.national !==
          undefined
        ) {
          patch.margins.national =
            body.margins.national;
        }


        if (
          body.margins.imported !==
          undefined
        ) {
          patch.margins.imported =
            body.margins.imported;
        }
      }


      /**
       * TIPOS DE PROMOÇÃO
       */

      if (
        body.promotionTypes &&
        typeof body.promotionTypes ===
          "object"
      ) {
        patch.promotionTypes =
          body.promotionTypes;
      }


      /**
       * PRIORIDADES
       */

      if (
        Array.isArray(
          body.campaignPriority
        )
      ) {
        patch.campaignPriority =
          body.campaignPriority;
      }


      /**
       * SAFETY
       */

      if (
        body.safety &&
        typeof body.safety ===
          "object"
      ) {
        patch.safety = {};


        const allowedSafetyFields = [
          "requireCandidateStatus",
          "skipLightningWithoutStock",
          "continueAfterError",
        ];


        for (
          const field
          of allowedSafetyFields
        ) {
          if (
            body.safety[field] !==
            undefined
          ) {
            patch.safety[field] =
              body.safety[field];
          }
        }
      }
 
      /**
       * SALVAR
       */

      const saved =
        updateSettings(
          patch
        );


      console.log("");
      console.log(
        "⚙️ Configurações atualizadas pelo painel."
      );

      console.log(
        `Margem Nacional: ${saved.margins.national}%`
      );

      console.log(
        `Margem Importado: ${saved.margins.imported}%`
      );


      res.json({
        success: true,

        message:
          "Configurações salvas com sucesso.",

        settings: {
          execution:
            saved.execution,

          margins:
            saved.margins,

          promotionTypes: {
            enabled:
              getEnabledTypes(),

            disabled:
              getDisabledTypes(),

            values:
              saved.promotionTypes,
          },

          campaignPriority:
            saved.campaignPriority,

          safety:
            saved.safety,
        },
      });

    } catch (err) {

      console.error(
        "❌ Erro ao salvar configurações:"
      );

      console.error(
        err?.message ?? err
      );


      const status =
        err?.code ===
        "INVALID_SETTINGS"
          ? 400
          : 500;


      res.status(status).json({
        success: false,

        error:
          err?.message ??
          "Erro ao salvar configurações.",

        validationErrors:
          err?.validationErrors ??
          [],
      });
    }
  }

);

/**
 * ============================================================
 * POST /api/mode
 * ============================================================
 *
 * Alterna o bot entre DRY RUN e PRODUÇÃO.
 *
 * IMPORTANTE:
 * - Produção exige confirmação explícita.
 * - Ativar produção NÃO ativa execução automática.
 * - Voltar para DRY RUN não exige confirmação.
 * ============================================================
 */

app.post(
  "/api/mode",
  (req, res) => {

    try {

      const {
        mode,
        confirmation,
      } = req.body ?? {};


      /**
       * ======================================================
       * DRY RUN
       * ======================================================
       */

      if (mode === "dry-run") {

        const saved =
          updateSettings({
            execution: {
              dryRun: true,
            },
          });


        const config =
          reloadBotConfig();


        console.log("");
        console.log(
          "🧪 BOT ALTERADO PARA DRY RUN"
        );

        console.log(
          "POSTs reais estão DESABILITADOS."
        );


        return res.json({
          success: true,

          mode: "dry-run",

          dryRun: true,

          execution:
            saved.execution,

          botConfig: {
            enabled:
              config.execution.enabled,

            dryRun:
              config.execution.dryRun,

            autoRunEnabled:
              config.execution.autoRunEnabled,
          },
        });
      }


      /**
       * ======================================================
       * PRODUÇÃO
       * ======================================================
       */

      if (mode === "production") {

        if (
          confirmation !==
          "ATIVAR PRODUÇÃO"
        ) {

          return res
            .status(400)
            .json({
              success: false,

              error:
                'Digite exatamente "ATIVAR PRODUÇÃO".',
            });
        }


        const saved =
          updateSettings({
            execution: {
              dryRun: false,

              // Não ligar o agendamento automaticamente.
              autoRunEnabled: false,
            },
          });


        const config =
          reloadBotConfig();


        /**
         * Verificação extra.
         *
         * Só respondemos como produção se a configuração
         * recarregada realmente estiver com dryRun=false.
         */

        if (
          config.execution
            ?.dryRun !== false
        ) {

          throw new Error(
            "A configuração foi salva, mas o bot não entrou em modo Produção."
          );
        }


        console.log("");
        console.log(
          "🚨 MODO PRODUÇÃO ATIVADO"
        );

        console.log(
          "POSTs reais estão HABILITADOS."
        );

        console.log(
          "Execução automática permanece DESATIVADA."
        );


        return res.json({
          success: true,

          mode: "production",

          dryRun: false,

          execution:
            saved.execution,

          botConfig: {
            enabled:
              config.execution.enabled,

            dryRun:
              config.execution.dryRun,

            autoRunEnabled:
              config.execution.autoRunEnabled,
          },
        });
      }


      /**
       * ======================================================
       * MODO INVÁLIDO
       * ======================================================
       */

      return res
        .status(400)
        .json({
          success: false,

          error:
            'Modo inválido. Use "dry-run" ou "production".',
        });

    } catch (err) {

      console.error("");
      console.error(
        "❌ Erro ao alterar modo:"
      );

      console.error(
        err?.message ?? err
      );


      return res
        .status(500)
        .json({
          success: false,

          error:
            err?.message ??
            "Erro ao alterar modo.",
        });
    }
  }
);


/**
 * ============================================================
 * POST /api/run
 * ============================================================
 *
 * Executa exatamente o mesmo motor utilizado pelo terminal.
 *
 * Nesta fase recomendamos manter:
 *
 * dryRun: true
 *
 * em botConfig.js.
 */

app.post(
  "/api/run",
  async (req, res) => {

    /**
     * Impedir duas execuções simultâneas.
     */

    if (botRunning) {
      return res.status(409).json({
        success: false,

        error:
          "O bot já está executando.",
      });
    }


    botRunning = true;

    const startedAt =
      new Date();


    try {

      console.log("");
      console.log(
        "=================================================="
      );

      console.log(
        "EXECUÇÃO SOLICITADA PELA API"
      );

      console.log(
        "=================================================="
      );

      console.log(
        `Início: ${startedAt.toISOString()}`
      );


      /**
       * MOTOR CENTRAL
       */

      const result =
        await runPromotionBot();


      const finishedAt =
        new Date();


      lastRun = {
        success:
          result?.success === true,

        dryRun:
          result?.dryRun === true,

        startedAt:
          startedAt.toISOString(),

        finishedAt:
          finishedAt.toISOString(),

        durationMs:
          finishedAt.getTime() -
          startedAt.getTime(),

        stats:
          result?.stats ??
          null,

        scan:
          result?.scan ??
          null,
      };


      return res.json({
        success: true,

        run:
          lastRun,

        result,
      });

    } catch (err) {

      const finishedAt =
        new Date();


      lastRun = {
        success: false,

        startedAt:
          startedAt.toISOString(),

        finishedAt:
          finishedAt.toISOString(),

        durationMs:
          finishedAt.getTime() -
          startedAt.getTime(),

        error:
          err?.message ??
          String(err),
      };


      console.error("");
      console.error(
        "❌ Erro durante execução pela API:"
      );

      console.error(
        lastRun.error
      );


      return res.status(500).json({
        success: false,

        error:
          lastRun.error,

        run:
          lastRun,
      });

    } finally {

      /**
       * Sempre liberar nova execução,
       * mesmo se ocorrer erro.
       */

      botRunning = false;
    }
  }
);


/**
 * ============================================================
 * ROTA RAIZ
 * ============================================================
 */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        publicPath,
        "index.html"
      )
    );
  }
);


/**
 * ============================================================
 * 404
 * ============================================================
 */

app.use(
  (req, res) => {

    res.status(404).json({
      success: false,

      error:
        "Rota não encontrada.",
    });
  }
);


/**
 * ============================================================
 * INICIAR SERVIDOR
 * ============================================================
 */

app.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "=================================================="
    );

    console.log(
      "ML PROMO BOT — SERVIDOR WEB"
    );

    console.log(
      "=================================================="
    );

    console.log(
      `Servidor iniciado na porta ${PORT}`
    );

    console.log("");
    console.log(
      `DRY RUN: ${
        botConfig.execution
          ?.dryRun === true
          ? "SIM"
          : "NÃO"
      }`
    );

    console.log(
      `POSTS REAIS: ${
        botConfig.execution
          ?.dryRun === true
          ? "DESABILITADOS"
          : "HABILITADOS"
      }`
    );

    console.log("");
    console.log(
      "Rotas disponíveis:"
    );

    console.log(
      "GET  /"
    );

    console.log(
      "GET  /api/status"
    );

    console.log(
      "GET  /api/config"
    );

    console.log(
      "POST /api/run"
    );

    console.log(
     "PUT  /api/config"
    );

    console.log(
     "POST /api/mode"
    );

    console.log(
      "=================================================="
    );
  }
);