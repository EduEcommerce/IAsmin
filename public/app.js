/**
 * ============================================================
 * ML PROMO BOT — FRONTEND
 * ============================================================
 *
 * Responsabilidades:
 *
 * - Consultar status do backend
 * - Consultar configurações
 * - Atualizar dashboard
 * - Executar o bot
 * - Bloquear botão durante execução
 * - Atualizar última execução
 * - Navegação lateral
 * - Logs da interface
 *
 * ============================================================
 */


/**
 * ============================================================
 * ESTADO
 * ============================================================
 */

const state = {
  status: null,
  config: null,

  running: false,

  pollingInterval: null,
};


/**
 * ============================================================
 * ELEMENTOS
 * ============================================================
 */

const elements = {


  activateProductionButton:
  document.getElementById(
    "activateProductionButton"
  ),

activateDryRunButton:
  document.getElementById(
    "activateDryRunButton"
  ),

productionWarning:
  document.getElementById(
    "productionWarning"
  ),

marginNational:
  document.getElementById(
    "marginNational"
  ),

marginImported:
  document.getElementById(
    "marginImported"
  ),

settingsBotEnabled:
  document.getElementById(
    "settingsBotEnabled"
  ),

settingsDryRun:
  document.getElementById(
    "settingsDryRun"
  ),

settingsAutoRun:
  document.getElementById(
    "settingsAutoRun"
  ),

settingsSaveStatus:
  document.getElementById(
    "settingsSaveStatus"
  ),

saveSettingsButton:
  document.getElementById(
    "saveSettingsButton"
  ),


  serverBadge:
    document.getElementById("serverBadge"),

  sidebarSystemStatus:
    document.getElementById(
      "sidebarSystemStatus"
    ),

  sidebarStatusDot:
    document.getElementById(
      "sidebarStatusDot"
    ),

  dryRunAlert:
    document.getElementById(
      "dryRunAlert"
    ),

  botStateBadge:
    document.getElementById(
      "botStateBadge"
    ),

  botStateText:
    document.getElementById(
      "botStateText"
    ),

  botEnabledStatus:
    document.getElementById(
      "botEnabledStatus"
    ),

  botModeStatus:
    document.getElementById(
      "botModeStatus"
    ),

  botRunningStatus:
    document.getElementById(
      "botRunningStatus"
    ),

  runBotButton:
    document.getElementById(
      "runBotButton"
    ),

  runBotIcon:
    document.getElementById(
      "runBotIcon"
    ),

  runBotText:
    document.getElementById(
      "runBotText"
    ),

  runProgress:
    document.getElementById(
      "runProgress"
    ),

  metricOpportunities:
    document.getElementById(
      "metricOpportunities"
    ),

  metricApproved:
    document.getElementById(
      "metricApproved"
    ),

  metricBlocked:
    document.getElementById(
      "metricBlocked"
    ),

  metricFailures:
    document.getElementById(
      "metricFailures"
    ),

  lastRunEmpty:
    document.getElementById(
      "lastRunEmpty"
    ),

  lastRunInfo:
    document.getElementById(
      "lastRunInfo"
    ),

  lastRunResult:
    document.getElementById(
      "lastRunResult"
    ),

  lastRunMode:
    document.getElementById(
      "lastRunMode"
    ),

  lastRunDuration:
    document.getElementById(
      "lastRunDuration"
    ),

  lastRunFinished:
    document.getElementById(
      "lastRunFinished"
    ),

  enabledPromotionTypes:
    document.getElementById(
      "enabledPromotionTypes"
    ),

  campaignPriority:
    document.getElementById(
      "campaignPriority"
    ),

  promotionPageEnabled:
    document.getElementById(
      "promotionPageEnabled"
    ),

  promotionPageDisabled:
    document.getElementById(
      "promotionPageDisabled"
    ),


  logConsole:
    document.getElementById(
      "logConsole"
    ),

  clearLogsButton:
    document.getElementById(
      "clearLogsButton"
    ),

  pageTitle:
    document.getElementById(
      "pageTitle"
    ),

  sidebar:
    document.getElementById(
      "sidebar"
    ),

  sidebarToggle:
    document.getElementById(
      "sidebarToggle"
    ),

  appToast:
    document.getElementById(
      "appToast"
    ),

  toastIcon:
    document.getElementById(
      "toastIcon"
    ),

  toastTitle:
    document.getElementById(
      "toastTitle"
    ),

  toastBody:
    document.getElementById(
      "toastBody"
    ),
};


/**
 * ============================================================
 * API
 * ============================================================
 */

async function apiRequest(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          "Content-Type":
            "application/json",

          ...(options.headers ?? {}),
        },

        ...options,
      }
    );


  let data;


  try {
    data =
      await response.json();

  } catch {
    throw new Error(
      "O servidor retornou uma resposta inválida."
    );
  }


  if (!response.ok) {
    throw new Error(
      data?.error ??
      `Erro HTTP ${response.status}`
    );
  }


  return data;
}


/**
 * ============================================================
 * LOGS
 * ============================================================
 */

function addLog(
  message,
  type = "info"
) {
  if (!elements.logConsole) {
    return;
  }


  const now =
    new Date();


  const time =
    now.toLocaleTimeString(
      "pt-BR"
    );


  const entry =
    document.createElement("div");


  entry.className =
    `log-entry log-${type}`;


  const timeSpan =
    document.createElement("span");


  timeSpan.className =
    "log-time";


  timeSpan.textContent =
    `[${time}]`;


  const messageSpan =
    document.createElement("span");


  messageSpan.textContent =
    message;


  entry.appendChild(
    timeSpan
  );

  entry.appendChild(
    messageSpan
  );


  elements.logConsole.appendChild(
    entry
  );


  elements.logConsole.scrollTop =
    elements.logConsole.scrollHeight;
}


/**
 * ============================================================
 * TOAST
 * ============================================================
 */

function showToast(
  title,
  message,
  type = "info"
) {
  if (
    !elements.appToast ||
    typeof bootstrap ===
      "undefined"
  ) {
    return;
  }


  elements.toastTitle.textContent =
    title;


  elements.toastBody.textContent =
    message;


  const iconClasses = {
    success:
      "bi bi-check-circle-fill me-2 text-success",

    warning:
      "bi bi-exclamation-triangle-fill me-2 text-warning",

    error:
      "bi bi-x-circle-fill me-2 text-danger",

    info:
      "bi bi-info-circle-fill me-2 text-primary",
  };


  elements.toastIcon.className =
    iconClasses[type] ??
    iconClasses.info;


  const toast =
    bootstrap.Toast.getOrCreateInstance(
      elements.appToast
    );


  toast.show();
}


/**
 * ============================================================
 * STATUS DO SERVIDOR
 * ============================================================
 */

function setServerOnline() {
  elements.serverBadge.className =
    "badge rounded-pill text-bg-success";


  elements.serverBadge.innerHTML =
    `
      <i class="bi bi-circle-fill me-1"></i>
      Online
    `;


  elements.sidebarSystemStatus.textContent =
    "Online";


  elements.sidebarStatusDot.className =
    "status-dot online";
}


function setServerOffline() {
  elements.serverBadge.className =
    "badge rounded-pill text-bg-danger";


  elements.serverBadge.innerHTML =
    `
      <i class="bi bi-circle-fill me-1"></i>
      Offline
    `;


  elements.sidebarSystemStatus.textContent =
    "Offline";


  elements.sidebarStatusDot.className =
    "status-dot offline";
}


/**
 * ============================================================
 * STATUS DO BOT
 * ============================================================
 */

function renderBotStatus(status) {
  const bot =
    status?.bot ?? {};


  const enabled =
    bot.enabled === true;


  const dryRun =
    bot.dryRun === true;


  const running =
    bot.running === true;


  state.running =
    running;


  /**
   * MOTOR
   */

  elements.botEnabledStatus.textContent =
    enabled
      ? "Ativo"
      : "Desativado";


  /**
   * MODO
   */

  elements.botModeStatus.textContent =
    dryRun
      ? "DRY RUN"
      : "Produção";


  /**
   * ALERTA DRY RUN
   */

  if (dryRun) {
    elements.dryRunAlert.classList.remove(
      "d-none"
    );
  } else {
    elements.dryRunAlert.classList.add(
      "d-none"
    );
  }


  /**
   * EXECUÇÃO
   */

  if (running) {
    elements.botRunningStatus.textContent =
      "Executando";


    elements.botStateText.textContent =
      "Executando";


    const dot =
      elements.botStateBadge.querySelector(
        ".status-dot"
      );


    if (dot) {
      dot.className =
        "status-dot running";
    }


    elements.runBotButton.disabled =
      true;


    elements.runBotText.textContent =
      "Bot executando";


    elements.runBotIcon.className =
      "bi bi-arrow-repeat me-2";


    elements.runProgress.classList.remove(
      "d-none"
    );

  } else {

    elements.botRunningStatus.textContent =
      "Disponível";


    elements.botStateText.textContent =
      enabled
        ? "Disponível"
        : "Desativado";


    const dot =
      elements.botStateBadge.querySelector(
        ".status-dot"
      );


    if (dot) {
      dot.className =
        enabled
          ? "status-dot online"
          : "status-dot offline";
    }


    elements.runBotButton.disabled =
      !enabled;


    elements.runBotText.textContent =
      "Executar bot agora";


    elements.runBotIcon.className =
      "bi bi-play-fill me-2";


    elements.runProgress.classList.add(
      "d-none"
    );
  }


  renderLastRun(
    status?.lastRun
  );
}


/**
 * ============================================================
 * ÚLTIMA EXECUÇÃO
 * ============================================================
 */

function renderLastRun(lastRun) {
  if (!lastRun) {

    elements.lastRunEmpty.classList.remove(
      "d-none"
    );


    elements.lastRunInfo.classList.add(
      "d-none"
    );


    setMetrics(null);

    return;
  }


  elements.lastRunEmpty.classList.add(
    "d-none"
  );


  elements.lastRunInfo.classList.remove(
    "d-none"
  );


  /**
   * RESULTADO
   */

  if (lastRun.success) {

    elements.lastRunResult.textContent =
      "Concluída";


    elements.lastRunResult.className =
      "badge text-bg-success";

  } else {

    elements.lastRunResult.textContent =
      "Falhou";


    elements.lastRunResult.className =
      "badge text-bg-danger";
  }


  /**
   * MODO
   */

  elements.lastRunMode.textContent =
    lastRun.dryRun
      ? "DRY RUN"
      : "Produção";


  /**
   * DURAÇÃO
   */

  elements.lastRunDuration.textContent =
    formatDuration(
      lastRun.durationMs
    );


  /**
   * DATA
   */

  elements.lastRunFinished.textContent =
    formatDate(
      lastRun.finishedAt
    );


  /**
   * MÉTRICAS
   */

  setMetrics(
    lastRun.stats
  );
}


/**
 * ============================================================
 * MÉTRICAS
 * ============================================================
 */

function setMetrics(stats) {
  if (!stats) {

    elements.metricOpportunities.textContent =
      "—";

    elements.metricApproved.textContent =
      "—";

    elements.metricBlocked.textContent =
      "—";

    elements.metricFailures.textContent =
      "—";

    return;
  }


  elements.metricOpportunities.textContent =
    stats.received ?? 0;


  elements.metricApproved.textContent =
    stats.approvedAfterRevalidation ??
    0;


  elements.metricBlocked.textContent =
    stats.blockedRevalidation ??
    0;


  const failures =
    Number(
      stats.apiFailures ?? 0
    ) +
    Number(
      stats.unexpectedFailures ?? 0
    );


  elements.metricFailures.textContent =
    failures;
}


/**
 * ============================================================
 * CONFIGURAÇÃO
 * ============================================================
 */

function renderConfig(config) {
  if (!config) {
    return;
  }


  const enabled =
    config.promotionTypes
      ?.enabled ?? [];


  const disabled =
    config.promotionTypes
      ?.disabled ?? [];


  /**
   * DASHBOARD
   */

  elements.enabledPromotionTypes.innerHTML =
    "";


  for (
    const type
    of enabled
  ) {
    elements.enabledPromotionTypes.appendChild(
      createPromotionItem(
        type,
        true
      )
    );
  }


  /**
   * PÁGINA PROMOÇÕES
   */

  elements.promotionPageEnabled.innerHTML =
    "";


  for (
    const type
    of enabled
  ) {
    elements.promotionPageEnabled.appendChild(
      createPromotionItem(
        type,
        true
      )
    );
  }


  elements.promotionPageDisabled.innerHTML =
    "";


  for (
    const type
    of disabled
  ) {
    elements.promotionPageDisabled.appendChild(
      createPromotionItem(
        type,
        false
      )
    );
  }


  /**
   * PRIORIDADES
   */

  elements.campaignPriority.innerHTML =
    "";


  const priorities =
    config.campaignPriority ??
    [];


  priorities.forEach(
    (name, index) => {

      const item =
        document.createElement("div");


      item.className =
        "priority-item";


      const number =
        document.createElement("div");


      number.className =
        "priority-number";


      number.textContent =
        index + 1;


      const text =
        document.createElement("div");


      text.className =
        "priority-name";


      text.textContent =
        name;


      item.appendChild(
        number
      );


      item.appendChild(
        text
      );


      elements.campaignPriority.appendChild(
        item
      );
    }
  );


  /**
   * CONFIGURAÇÕES
   */

  renderSettingsForm(
    config
  );
}


function createPromotionItem(
  type,
  enabled
) {
  const item =
    document.createElement("div");


  item.className =
    enabled
      ? "promotion-item enabled"
      : "promotion-item disabled";


  const icon =
    document.createElement("i");


  icon.className =
    enabled
      ? "bi bi-check-circle-fill"
      : "bi bi-x-circle-fill";


  const text =
    document.createElement("span");


  text.textContent =
    type;


  item.appendChild(
    icon
  );


  item.appendChild(
    text
  );


  return item;
}


/**
 * ============================================================
 * VISUALIZAÇÃO DA CONFIGURAÇÃO
 * ============================================================
 */

function renderSettingsForm(
  config
) {
  if (!config) {
    return;
  }


  /**
   * MARGENS
   */

  elements.marginNational.value =
    config.margins
      ?.national ?? 9;


  elements.marginImported.value =
    config.margins
      ?.imported ?? 15;


  /**
   * EXECUÇÃO — SOMENTE LEITURA
   */

  elements.settingsBotEnabled.textContent =
    config.execution
      ?.enabled
      ? "Ativo"
      : "Desativado";


  elements.settingsDryRun.textContent =
    config.execution
      ?.dryRun
      ? "DRY RUN"
      : "PRODUÇÃO";

        /**
   * CONTROLES DRY RUN / PRODUÇÃO
   */

  const isDryRun =
    config.execution?.dryRun === true;


  if (isDryRun) {

    elements.activateProductionButton
      ?.classList.remove("d-none");

    elements.activateDryRunButton
      ?.classList.add("d-none");


    if (elements.productionWarning) {

      elements.productionWarning.className =
        "alert alert-warning mb-3";

      elements.productionWarning.innerHTML = `
        <i class="bi bi-shield-check me-2"></i>
        DRY RUN ativo. Nenhum POST real será enviado.
      `;
    }

  } else {

    elements.activateProductionButton
      ?.classList.add("d-none");

    elements.activateDryRunButton
      ?.classList.remove("d-none");


    if (elements.productionWarning) {

      elements.productionWarning.className =
        "alert alert-danger mb-3";

      elements.productionWarning.innerHTML = `
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        <strong>MODO PRODUÇÃO ATIVO.</strong>
        Promoções aprovadas podem ser aplicadas no Mercado Livre.
      `;
    }
  }


  elements.settingsAutoRun.textContent =
    config.execution
      ?.autoRunEnabled
      ? "Ativada"
      : "Desativada";


  /**
   * Após carregar do servidor,
   * não existem alterações pendentes.
   */

  markSettingsAsSaved();
}

function markSettingsAsChanged() {

  elements.saveSettingsButton.disabled =
    false;


  elements.settingsSaveStatus.textContent =
    "Existem alterações ainda não salvas.";


  elements.settingsSaveStatus.className =
    "text-warning small";
}


function markSettingsAsSaved() {

  elements.saveSettingsButton.disabled =
    true;


  elements.settingsSaveStatus.textContent =
    "Configurações sincronizadas.";


  elements.settingsSaveStatus.className =
    "text-secondary small";
}


async function saveSettings() {

  const national =
    Number(
      elements.marginNational.value
    );


  const imported =
    Number(
      elements.marginImported.value
    );


  /**
   * Validação no navegador.
   */

  if (
    !Number.isFinite(national) ||
    national < 0 ||
    national > 100
  ) {
    showToast(
      "Configuração inválida",
      "Informe uma margem Nacional entre 0% e 100%.",
      "warning"
    );

    return;
  }


  if (
    !Number.isFinite(imported) ||
    imported < 0 ||
    imported > 100
  ) {
    showToast(
      "Configuração inválida",
      "Informe uma margem de Importados entre 0% e 100%.",
      "warning"
    );

    return;
  }


  elements.saveSettingsButton.disabled =
    true;


  elements.settingsSaveStatus.textContent =
    "Salvando...";


  try {

    const result =
      await apiRequest(
        "/api/config",
        {
          method: "PUT",

          body:
            JSON.stringify({
              margins: {
                national,
                imported,
              },
            }),
        }
      );


    /**
     * Recarrega do backend.
     */

    await loadConfig();


    addLog(
      `Margens atualizadas: Nacional ${national}% | Importado ${imported}%.`,
      "success"
    );


    showToast(
      "Configurações salvas",
      "As margens mínimas foram atualizadas.",
      "success"
    );


    return result;

  } catch (err) {

    elements.saveSettingsButton.disabled =
      false;


    elements.settingsSaveStatus.textContent =
      "Não foi possível salvar.";


    elements.settingsSaveStatus.className =
      "text-danger small";


    addLog(
      `Erro ao salvar configurações: ${err.message}`,
      "error"
    );


    showToast(
      "Erro ao salvar",
      err.message,
      "error"
    );
  }
}


/**
 * ============================================================
 * BUSCAR STATUS
 * ============================================================
 */

async function loadStatus({
  silent = false,
} = {}) {
  try {

    const data =
      await apiRequest(
        "/api/status"
      );


    state.status =
      data;


    setServerOnline();


    renderBotStatus(
      data
    );


    return data;

  } catch (err) {

    setServerOffline();


    if (!silent) {

      addLog(
        `Falha ao consultar status: ${err.message}`,
        "error"
      );

    }


    throw err;
  }
}


/**
 * ============================================================
 * BUSCAR CONFIG
 * ============================================================
 */

async function loadConfig() {
  try {

    const data =
      await apiRequest(
        "/api/config"
      );


    state.config =
      data;


    renderConfig(
      data
    );


    addLog(
      "Configurações carregadas.",
      "success"
    );


    return data;

  } catch (err) {

    addLog(
      `Falha ao carregar configurações: ${err.message}`,
      "error"
    );


    throw err;
  }
}


/**
 * ============================================================
 * EXECUTAR BOT
 * ============================================================
 */

async function runBot() {
  if (state.running) {
    return;
  }


  /**
   * Confirmação.
   */

  const dryRun =
    state.status
      ?.bot
      ?.dryRun === true;


  let confirmationMessage;


  if (dryRun) {

    confirmationMessage =
      "Executar agora a varredura completa em DRY RUN?\n\nNenhuma promoção será alterada.";

  } else {

    confirmationMessage =
      "ATENÇÃO: o bot está em modo PRODUÇÃO.\n\nPromoções aprovadas poderão ser aplicadas no Mercado Livre.\n\nDeseja continuar?";
  }


  const confirmed =
    window.confirm(
      confirmationMessage
    );


  if (!confirmed) {
    return;
  }


  state.running =
    true;


  elements.runBotButton.disabled =
    true;


  elements.runBotText.textContent =
    "Executando...";


  elements.runBotIcon.className =
    "bi bi-arrow-repeat me-2";


  elements.runProgress.classList.remove(
    "d-none"
  );


  addLog(
    dryRun
      ? "Execução iniciada em DRY RUN."
      : "Execução iniciada em PRODUÇÃO.",
    dryRun
      ? "info"
      : "warning"
  );


  showToast(
    "Execução iniciada",
    "O bot começou a processar as oportunidades.",
    "info"
  );


  /**
   * Iniciar polling antes de aguardar
   * a resposta longa do POST.
   */

  startStatusPolling();


  try {

    const result =
      await apiRequest(
        "/api/run",
        {
          method:
            "POST",

          body:
            JSON.stringify({}),
        }
      );


    addLog(
      "Execução concluída com sucesso.",
      "success"
    );


    showToast(
      "Execução concluída",
      "O processamento do bot foi finalizado.",
      "success"
    );


    /**
     * Atualização imediata.
     */

    if (result?.run) {

      state.status = {
        success: true,

        bot: {
          enabled:
            state.status
              ?.bot
              ?.enabled ??
            true,

          dryRun:
            result.run
              ?.dryRun === true,

          realPosts:
            result.run
              ?.dryRun !== true,

          running:
            false,
        },

        lastRun:
          result.run,
      };


      renderBotStatus(
        state.status
      );
    }


  } catch (err) {

    /**
     * 409 pode ocorrer caso outro
     * processo já esteja rodando.
     */

    addLog(
      `Execução não concluída: ${err.message}`,
      "error"
    );


    showToast(
      "Erro",
      err.message,
      "error"
    );

  } finally {

    state.running =
      false;


    stopStatusPolling();


    try {
      await loadStatus({
        silent: true,
      });
    } catch {
      // servidor possivelmente offline
    }
  }
}


/**
 * ============================================================
 * POLLING
 * ============================================================
 */

function startStatusPolling() {
  stopStatusPolling();


  state.pollingInterval =
    setInterval(
      async () => {

        try {

          await loadStatus({
            silent: true,
          });

        } catch {
          // não gerar log repetidamente
        }

      },
      3000
    );
}


function stopStatusPolling() {
  if (
    state.pollingInterval
  ) {
    clearInterval(
      state.pollingInterval
    );


    state.pollingInterval =
      null;
  }
}


/**
 * ============================================================
 * NAVEGAÇÃO
 * ============================================================
 */

function setupNavigation() {
  const links =
    document.querySelectorAll(
      ".sidebar-link[data-page]"
    );


  links.forEach(
    (link) => {

      link.addEventListener(
        "click",
        (event) => {

          event.preventDefault();


          const page =
            link.dataset.page;


          navigateTo(
            page
          );


          /**
           * Fecha menu no celular.
           */

          elements.sidebar.classList.remove(
            "open"
          );
        }
      );
    }
  );
}


function navigateTo(page) {
  const titles = {
    dashboard:
      "Dashboard",

    executions:
      "Execuções",

    promotions:
      "Promoções",

    settings:
      "Configurações",

    logs:
      "Logs",
  };


  /**
   * Links
   */

  document
    .querySelectorAll(
      ".sidebar-link[data-page]"
    )
    .forEach(
      (link) => {

        link.classList.toggle(
          "active",
          link.dataset.page === page
        );
      }
    );


  /**
   * Páginas
   */

  document
    .querySelectorAll(
      ".page-section"
    )
    .forEach(
      (section) => {

        section.classList.remove(
          "active"
        );
      }
    );


  const target =
    document.getElementById(
      `page-${page}`
    );


  if (target) {
    target.classList.add(
      "active"
    );
  }


  elements.pageTitle.textContent =
    titles[page] ??
    "ML Promo Bot";
}


/**
 * ============================================================
 * SIDEBAR MOBILE
 * ============================================================
 */

function setupSidebar() {
  elements.sidebarToggle
    ?.addEventListener(
      "click",
      () => {

        elements.sidebar.classList.toggle(
          "open"
        );
      }
    );
}


/**
 * ============================================================
 * FORMATADORES
 * ============================================================
 */

function formatDuration(ms) {
  const value =
    Number(ms);


  if (
    !Number.isFinite(value)
  ) {
    return "—";
  }


  const seconds =
    Math.round(
      value / 1000
    );


  if (seconds < 60) {
    return `${seconds}s`;
  }


  const minutes =
    Math.floor(
      seconds / 60
    );


  const remainingSeconds =
    seconds % 60;


  return (
    `${minutes}m ${remainingSeconds}s`
  );
}


function formatMilliseconds(ms) {
  const value =
    Number(ms);


  if (
    !Number.isFinite(value)
  ) {
    return "N/D";
  }


  if (value < 1000) {
    return `${value} ms`;
  }


  return `${value / 1000} s`;
}


function formatDate(value) {
  if (!value) {
    return "—";
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }


  return date.toLocaleString(
    "pt-BR"
  );
}


/**
 * ============================================================
 * EVENTOS
 * ============================================================
 */

function setupEvents() {

  elements.activateProductionButton
  ?.addEventListener(
    "click",
    activateProduction
  );


elements.activateDryRunButton
  ?.addEventListener(
    "click",
    activateDryRun
  );

  elements.marginNational
  ?.addEventListener(
    "input",
    markSettingsAsChanged
  );


elements.marginImported
  ?.addEventListener(
    "input",
    markSettingsAsChanged
  );


elements.saveSettingsButton
  ?.addEventListener(
    "click",
    saveSettings
  );

  elements.runBotButton
    ?.addEventListener(
      "click",
      runBot
    );


  elements.clearLogsButton
    ?.addEventListener(
      "click",
      () => {

        elements.logConsole.innerHTML =
          "";


        addLog(
          "Logs da interface limpos.",
          "info"
        );
      }
    );
}


/**
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 */

async function initializeApp() {

  addLog(
    "Inicializando painel...",
    "info"
  );


  setupNavigation();

  setupSidebar();

  setupEvents();


  try {

    await Promise.all([
      loadStatus(),
      loadConfig(),
    ]);


    addLog(
      "Painel conectado ao backend.",
      "success"
    );


  } catch (err) {

    showToast(
      "Backend indisponível",
      "Não foi possível conectar ao servidor do ML Promo Bot.",
      "error"
    );

  }


  /**
   * Atualiza status periodicamente
   * mesmo sem execução iniciada
   * por esta aba.
   */

  setInterval(
    async () => {

      try {

        await loadStatus({
          silent: true,
        });

      } catch {
        // evita spam de logs
      }

    },
    5000
  );
}


/**
 * ============================================================
 * START
 * ============================================================
 */

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);

async function activateProduction() {

  const confirmation =
    window.prompt(
      'Para habilitar POSTs reais, digite exatamente:\n\nATIVAR PRODUÇÃO'
    );


  if (confirmation === null) {
    return;
  }


  if (confirmation !== "ATIVAR PRODUÇÃO") {

    showToast(
      "Confirmação incorreta",
      'Digite exatamente "ATIVAR PRODUÇÃO".',
      "warning"
    );

    return;
  }


  try {

    elements.activateProductionButton.disabled =
      true;


    await apiRequest(
      "/api/mode",
      {
        method: "POST",

        body: JSON.stringify({
          mode: "production",
          confirmation:
            "ATIVAR PRODUÇÃO",
        }),
      }
    );


    await loadConfig();


    addLog(
      "MODO PRODUÇÃO ATIVADO — POSTs reais habilitados.",
      "warning"
    );


    showToast(
      "Modo Produção ativado",
      "O bot agora pode aplicar promoções reais.",
      "warning"
    );

  } catch (err) {

    showToast(
      "Erro",
      err.message,
      "error"
    );

  } finally {

    elements.activateProductionButton.disabled =
      false;
  }
}

async function activateDryRun() {

  try {

    elements.activateDryRunButton.disabled =
      true;


    await apiRequest(
      "/api/mode",
      {
        method: "POST",

        body: JSON.stringify({
          mode: "dry-run",
        }),
      }
    );


    await loadConfig();


    addLog(
      "DRY RUN ativado — POSTs reais bloqueados.",
      "success"
    );


    showToast(
      "DRY RUN ativado",
      "Novos POSTs reais estão bloqueados.",
      "success"
    );

  } catch (err) {

    showToast(
      "Erro",
      err.message,
      "error"
    );

  } finally {

    elements.activateDryRunButton.disabled =
      false;
  }
}