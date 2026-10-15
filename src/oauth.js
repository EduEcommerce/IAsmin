import "dotenv/config";
import http from "http";
import axios from "axios";
import fs from "fs";

const PORT = 3000;

const {
  ML_CLIENT_ID,
  ML_CLIENT_SECRET,
  ML_REDIRECT_URI,
} = process.env;

const ENV_PATH =
  new URL("../.env", import.meta.url);


/**
 * ============================================================
 * VALIDAÇÃO
 * ============================================================
 */

if (!ML_CLIENT_ID) {
  throw new Error(
    "ML_CLIENT_ID não configurado no .env."
  );
}

if (!ML_CLIENT_SECRET) {
  throw new Error(
    "ML_CLIENT_SECRET não configurado no .env."
  );
}

if (!ML_REDIRECT_URI) {
  throw new Error(
    "ML_REDIRECT_URI não configurado no .env."
  );
}


/**
 * ============================================================
 * SALVAR REFRESH TOKEN
 * ============================================================
 */

function saveRefreshToken(
  refreshToken
) {

  if (!refreshToken) {
    throw new Error(
      "refresh_token inválido."
    );
  }

  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(
      ".env não encontrado."
    );
  }

  let content =
    fs.readFileSync(
      ENV_PATH,
      "utf8"
    );

  if (
    /^ML_REFRESH_TOKEN=.*$/m.test(
      content
    )
  ) {

    content =
      content.replace(
        /^ML_REFRESH_TOKEN=.*$/m,
        `ML_REFRESH_TOKEN=${refreshToken}`
      );

  } else {

    content +=
      `\nML_REFRESH_TOKEN=${refreshToken}\n`;

  }

  fs.writeFileSync(
    ENV_PATH,
    content,
    "utf8"
  );

  process.env.ML_REFRESH_TOKEN =
    refreshToken;
}


/**
 * ============================================================
 * URL DE AUTORIZAÇÃO
 * ============================================================
 */

function buildAuthorizationUrl() {

  const url =
    new URL(
      "https://auth.mercadolivre.com.br/authorization"
    );

  url.searchParams.set(
    "response_type",
    "code"
  );

  url.searchParams.set(
    "client_id",
    ML_CLIENT_ID
  );

  url.searchParams.set(
    "redirect_uri",
    ML_REDIRECT_URI
  );

  return url.toString();
}


/**
 * ============================================================
 * TESTE DE REFRESH
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Este teste usa DIRETAMENTE o refresh_token que acabou
 * de ser devolvido pelo Authorization Code.
 *
 * Não lê ML_REFRESH_TOKEN do .env para fazer o teste.
 *
 * Assim eliminamos:
 *
 * - dotenv
 * - token antigo
 * - cópia manual
 * - outro processo Node
 * - cache
 */

async function testImmediateRefresh(
  freshRefreshToken
) {

  console.log("");
  console.log(
    "=============================================="
  );
  console.log(
    "TESTE IMEDIATO DE REFRESH TOKEN"
  );
  console.log(
    "=============================================="
  );

  console.log(
    "Usando refresh_token recém-retornado pelo ML."
  );

  console.log(
    "Client ID presente:",
    Boolean(ML_CLIENT_ID)
  );

  console.log(
    "Client Secret presente:",
    Boolean(ML_CLIENT_SECRET)
  );

  console.log(
    "Refresh Token presente:",
    Boolean(freshRefreshToken)
  );

  console.log(
    "Enviando refresh..."
  );


  try {

    const {
      data,
    } =
      await axios.post(
        "https://api.mercadolibre.com/oauth/token",

        new URLSearchParams({
          grant_type:
            "refresh_token",

          client_id:
            ML_CLIENT_ID,

          client_secret:
            ML_CLIENT_SECRET,

          refresh_token:
            freshRefreshToken,
        }),

        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
        }
      );


    console.log("");
    console.log(
      "✅ REFRESH IMEDIATO FUNCIONOU"
    );

    console.log(
      "Access token recebido:",
      Boolean(data?.access_token)
    );

    console.log(
      "Novo refresh token recebido:",
      Boolean(data?.refresh_token)
    );

    console.log(
      "Expires in:",
      data?.expires_in ?? "N/D"
    );


    /**
     * Se o refresh funcionou, o token original
     * pode ter sido rotacionado.
     *
     * Portanto salvamos o NOVO refresh_token.
     */

    if (data?.refresh_token) {

      saveRefreshToken(
        data.refresh_token
      );

      console.log(
        "✅ Refresh token FINAL salvo no .env."
      );

    } else {

      /**
       * Situação inesperada:
       * refresh funcionou mas não retornou novo token.
       */

      saveRefreshToken(
        freshRefreshToken
      );

      console.log(
        "⚠️ ML não retornou novo refresh_token."
      );

      console.log(
        "Token original mantido no .env."
      );
    }


    console.log(
      "=============================================="
    );

    return true;

  } catch (err) {

    console.log("");
    console.log(
      "❌ REFRESH IMEDIATO FALHOU"
    );

    console.log(
      "Status:",
      err.response?.status ??
      "N/D"
    );

    console.log(
      "Resposta ML:"
    );

    console.dir(
      err.response?.data ??
      err.message,
      {
        depth: null,
        colors: true,
      }
    );


    /**
     * Como o refresh falhou,
     * salvamos o refresh_token ORIGINAL,
     * recém-recebido pelo Authorization Code.
     */

    saveRefreshToken(
      freshRefreshToken
    );

    console.log("");
    console.log(
      "🔒 Refresh token recém-gerado foi mantido no .env."
    );

    console.log(
      "Nenhum token foi calculado ou alterado manualmente."
    );

    console.log(
      "=============================================="
    );

    return false;
  }
}


/**
 * ============================================================
 * SERVIDOR
 * ============================================================
 */

const server =
  http.createServer(
    async (req, res) => {

      const url =
        new URL(
          req.url,
          `http://localhost:${PORT}`
        );


      /**
       * HOME
       */

      if (
        url.pathname === "/"
      ) {

        const authorizationUrl =
          buildAuthorizationUrl();

        res.writeHead(
          200,
          {
            "Content-Type":
              "text/html; charset=utf-8",
          }
        );

        res.end(`
          <!DOCTYPE html>

          <html lang="pt-BR">

          <head>
            <meta charset="UTF-8">

            <title>
              Diagnóstico OAuth Mercado Livre
            </title>
          </head>

          <body>

            <h2>
              Diagnóstico OAuth Mercado Livre
            </h2>

            <p>
              Este teste fará:
            </p>

            <ol>
              <li>
                Authorization Code
              </li>

              <li>
                Receber access_token e refresh_token
              </li>

              <li>
                Testar imediatamente o refresh_token
              </li>

              <li>
                Salvar o último refresh_token válido
              </li>
            </ol>

            <p>
              <a href="${authorizationUrl}">
                Iniciar diagnóstico
              </a>
            </p>

          </body>

          </html>
        `);

        return;
      }


      /**
       * CALLBACK
       */

      if (
        url.pathname === "/callback"
      ) {

        const code =
          url.searchParams.get(
            "code"
          );

        const oauthError =
          url.searchParams.get(
            "error"
          );

        const oauthErrorDescription =
          url.searchParams.get(
            "error_description"
          );


        if (oauthError) {

          console.error(
            "❌ Mercado Livre retornou erro:",
            oauthError,
            oauthErrorDescription ?? ""
          );

          res.writeHead(
            400,
            {
              "Content-Type":
                "text/plain; charset=utf-8",
            }
          );

          res.end(
            "Mercado Livre retornou erro."
          );

          return;
        }


        if (!code) {

          res.writeHead(
            400,
            {
              "Content-Type":
                "text/plain; charset=utf-8",
            }
          );

          res.end(
            "Authorization code não recebido."
          );

          return;
        }


        console.log("");
        console.log(
          "🔑 Authorization code recebido."
        );

        console.log(
          "🔄 Trocando authorization code por tokens..."
        );


        try {

          /**
           * ================================================
           * ETAPA 1
           * AUTHORIZATION CODE
           * ================================================
           */

          const {
            data,
          } =
            await axios.post(
              "https://api.mercadolibre.com/oauth/token",

              new URLSearchParams({
                grant_type:
                  "authorization_code",

                client_id:
                  ML_CLIENT_ID,

                client_secret:
                  ML_CLIENT_SECRET,

                code,

                redirect_uri:
                  ML_REDIRECT_URI,
              }),

              {
                headers: {
                  "Content-Type":
                    "application/x-www-form-urlencoded",
                },
              }
            );


          if (!data?.access_token) {
            throw new Error(
              "ML não retornou access_token."
            );
          }

          if (!data?.refresh_token) {
            throw new Error(
              "ML não retornou refresh_token."
            );
          }


          console.log("");
          console.log(
            "=============================================="
          );

          console.log(
            "AUTHORIZATION CODE — SUCESSO"
          );

          console.log(
            "=============================================="
          );

          console.log(
            "User ID:",
            data.user_id
          );

          console.log(
            "Access token recebido: SIM"
          );

          console.log(
            "Refresh token recebido: SIM"
          );

          console.log(
            "Expires in:",
            data.expires_in ?? "N/D"
          );

          console.log(
            "Scope:",
            data.scope ?? "NÃO INFORMADO"
          );

          console.log(
            "Token type:",
            data.token_type ?? "N/D"
          );

          console.log(
            "=============================================="
          );


          /**
           * Salva primeiro o token recém-gerado.
           *
           * Se o refresh funcionar, ele será substituído
           * pelo token rotacionado.
           */

          saveRefreshToken(
            data.refresh_token
          );


          /**
           * ================================================
           * ETAPA 2
           * REFRESH IMEDIATO
           * ================================================
           */

          const refreshWorked =
            await testImmediateRefresh(
              data.refresh_token
            );


          /**
           * ================================================
           * RESPOSTA
           * ================================================
           */

          res.writeHead(
            refreshWorked
              ? 200
              : 500,
            {
              "Content-Type":
                "text/html; charset=utf-8",
            }
          );


          res.end(`
            <!DOCTYPE html>

            <html lang="pt-BR">

            <head>
              <meta charset="UTF-8">

              <title>
                Diagnóstico concluído
              </title>
            </head>

            <body>

              <h1>
                Diagnóstico concluído
              </h1>

              <p>
                Authorization Code:
                <strong>
                  SUCESSO
                </strong>
              </p>

              <p>
                Refresh imediato:
                <strong>
                  ${
                    refreshWorked
                      ? "SUCESSO"
                      : "FALHOU"
                  }
                </strong>
              </p>

              <p>
                Consulte o terminal para os detalhes.
              </p>

            </body>

            </html>
          `);


          setTimeout(
            () => {
              server.close();
            },
            500
          );


        } catch (err) {

          console.error("");
          console.error(
            "❌ ERRO NO AUTHORIZATION CODE"
          );

          console.dir(
            err.response?.data ??
            err.message,
            {
              depth: null,
              colors: true,
            }
          );


          res.writeHead(
            500,
            {
              "Content-Type":
                "text/plain; charset=utf-8",
            }
          );

          res.end(
            "Falha no diagnóstico OAuth."
          );
        }


        return;
      }


      res.writeHead(
        404,
        {
          "Content-Type":
            "text/plain; charset=utf-8",
        }
      );

      res.end(
        "Not found"
      );
    }
  );


/**
 * ============================================================
 * ERRO DE PORTA
 * ============================================================
 */

server.on(
  "error",
  (err) => {

    if (
      err?.code === "EADDRINUSE"
    ) {

      console.error("");
      console.error(
        `❌ Porta ${PORT} já está em uso.`
      );

      console.error(
        "Encerre o processo que está usando a porta e tente novamente."
      );

      process.exit(1);
    }

    throw err;
  }
);


/**
 * ============================================================
 * START
 * ============================================================
 */

server.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "=============================================="
    );

    console.log(
      "DIAGNÓSTICO OAUTH — MERCADO LIVRE"
    );

    console.log(
      "=============================================="
    );

    console.log(
      `Servidor: http://localhost:${PORT}`
    );

    console.log(
      `Callback: ${ML_REDIRECT_URI}`
    );

    console.log("");

    console.log(
      "Abra no navegador:"
    );

    console.log(
      `http://localhost:${PORT}`
    );

    console.log("");
  }
);