import "dotenv/config";

import axios from "axios";
import fs from "fs";


/**
 * ============================================================
 * CONFIGURAÇÃO
 * ============================================================
 */

const ENV_PATH =
  new URL("../.env", import.meta.url);

const TOKEN_URL =
  "https://api.mercadolibre.com/oauth/token";


/**
 * ============================================================
 * CACHE
 * ============================================================
 */

let cachedToken = null;

let expiresAt = 0;


/**
 * Se várias chamadas pedirem token ao mesmo tempo,
 * todas aguardam a MESMA renovação.
 *
 * Isso evita consumir o mesmo refresh_token
 * duas vezes simultaneamente dentro do processo.
 */

let refreshPromise = null;


/**
 * ============================================================
 * VALIDAÇÃO DAS CREDENCIAIS
 * ============================================================
 */

function getCredentials() {

  const clientId =
    String(
      process.env.ML_CLIENT_ID ?? ""
    ).trim();

  const clientSecret =
    String(
      process.env.ML_CLIENT_SECRET ?? ""
    ).trim();

  const refreshToken =
    String(
      process.env.ML_REFRESH_TOKEN ?? ""
    ).trim();


  if (!clientId) {
    throw new Error(
      "[auth] ML_CLIENT_ID não configurado."
    );
  }


  if (!clientSecret) {
    throw new Error(
      "[auth] ML_CLIENT_SECRET não configurado."
    );
  }


  if (!refreshToken) {
    throw new Error(
      "[auth] ML_REFRESH_TOKEN não configurado."
    );
  }


  return {
    clientId,
    clientSecret,
    refreshToken,
  };
}


/**
 * ============================================================
 * SALVAR REFRESH TOKEN
 * ============================================================
 */

function saveRefreshToken(
  newRefreshToken
) {

  if (!newRefreshToken) {
    throw new Error(
      "[auth] Novo refresh_token inválido."
    );
  }


  if (
    !fs.existsSync(
      ENV_PATH
    )
  ) {
    throw new Error(
      "[auth] .env não encontrado."
    );
  }


  let envContent =
    fs.readFileSync(
      ENV_PATH,
      "utf-8"
    );


  if (
    /^ML_REFRESH_TOKEN=.*$/m.test(
      envContent
    )
  ) {

    envContent =
      envContent.replace(
        /^ML_REFRESH_TOKEN=.*$/m,
        `ML_REFRESH_TOKEN=${newRefreshToken}`
      );

  } else {

    envContent +=
      `\nML_REFRESH_TOKEN=${newRefreshToken}\n`;

  }


  /**
   * Primeiro grava no disco.
   */

  fs.writeFileSync(
    ENV_PATH,
    envContent,
    "utf-8"
  );


  /**
   * Depois sincroniza o processo atual.
   */

  process.env.ML_REFRESH_TOKEN =
    newRefreshToken;


  console.log(
    "[auth] Novo refresh_token salvo no .env."
  );
}


/**
 * ============================================================
 * RENOVAR ACCESS TOKEN
 * ============================================================
 */

async function refreshAccessToken() {

  const {
    clientId,
    clientSecret,
    refreshToken,
  } =
    getCredentials();


  /**
   * Construção explícita do BODY.
   *
   * É o mesmo formato que funcionou no
   * diagnóstico dentro do oauth.js.
   */

  const body =
    new URLSearchParams();


  body.set(
    "grant_type",
    "refresh_token"
  );

  body.set(
    "client_id",
    clientId
  );

  body.set(
    "client_secret",
    clientSecret
  );

  body.set(
    "refresh_token",
    refreshToken
  );


  console.log(
    "[auth] Renovando access_token..."
  );


  try {

    const {
      data,
    } =
      await axios.post(
        TOKEN_URL,

        body.toString(),

        {
          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/x-www-form-urlencoded",
          },
        }
      );


    /**
     * --------------------------------------------------------
     * VALIDA RESPOSTA
     * --------------------------------------------------------
     */

    if (
      !data?.access_token
    ) {
      throw new Error(
        "[auth] Mercado Livre não retornou access_token."
      );
    }


    /**
     * --------------------------------------------------------
     * CACHE ACCESS TOKEN
     * --------------------------------------------------------
     */

    cachedToken =
      data.access_token;


    /**
     * --------------------------------------------------------
     * ROTAÇÃO DO REFRESH TOKEN
     * --------------------------------------------------------
     */

    if (
      data?.refresh_token
    ) {

      const returnedRefreshToken =
        String(
          data.refresh_token
        ).trim();


      if (
        returnedRefreshToken &&
        returnedRefreshToken !==
          refreshToken
      ) {

        saveRefreshToken(
          returnedRefreshToken
        );
      }
    }


    /**
     * --------------------------------------------------------
     * EXPIRAÇÃO
     * --------------------------------------------------------
     */

    const expiresIn =
      Number(
        data?.expires_in ?? 21600
      );


    /**
     * Renova cinco minutos antes.
     */

    const safeExpiresIn =
      Math.max(
        expiresIn - 300,
        60
      );


    expiresAt =
      Date.now() +
      safeExpiresIn * 1000;


    console.log(
      `[auth] Access token renovado. Validade informada: ${expiresIn}s.`
    );


    return cachedToken;

  } catch (err) {

    /**
     * Não mostramos:
     *
     * - client_secret
     * - refresh_token
     * - access_token
     */

    console.error("");
    console.error(
      "[auth] ❌ Falha ao renovar access_token."
    );


    if (
      err?.response
    ) {

      console.error(
        `[auth] HTTP ${err.response.status}`
      );


      console.error(
        "[auth] Resposta Mercado Livre:"
      );


      console.dir(
        err.response.data,
        {
          depth: null,
          colors: true,
        }
      );

    } else {

      console.error(
        "[auth]",
        err?.message ?? err
      );
    }


    throw err;
  }
}


/**
 * ============================================================
 * GET ACCESS TOKEN
 * ============================================================
 */

export async function getAccessToken() {

  const now =
    Date.now();


  /**
   * ----------------------------------------------------------
   * CACHE AINDA VÁLIDO
   * ----------------------------------------------------------
   */

  if (
    cachedToken &&
    now < expiresAt
  ) {

    return cachedToken;
  }


  /**
   * ----------------------------------------------------------
   * REFRESH JÁ EM ANDAMENTO
   * ----------------------------------------------------------
   *
   * Se duas ou mais requisições chegarem juntas,
   * apenas UMA fará o refresh.
   */

  if (
    refreshPromise
  ) {

    return await refreshPromise;
  }


  /**
   * ----------------------------------------------------------
   * INICIA REFRESH
   * ----------------------------------------------------------
   */

  refreshPromise =
    refreshAccessToken();


  try {

    return await refreshPromise;

  } finally {

    refreshPromise =
      null;
  }
}


/**
 * ============================================================
 * INVALIDAR CACHE
 * ============================================================
 *
 * Pode ser útil futuramente caso alguma chamada retorne 401.
 */

export function invalidateAccessToken() {

  cachedToken =
    null;

  expiresAt =
    0;
}