import axios from "axios";

const BASE_URL = "https://api.tiny.com.br/api2";

async function request(endpoint, params = {}) {
  const body = new URLSearchParams({
    token: process.env.TINY_API_TOKEN,
    formato: "JSON",
    ...params,
  });

  const { data } = await axios.post(
    `${BASE_URL}/${endpoint}`,
    body,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  const retorno = data?.retorno;

  if (!retorno) {
    throw new Error("Resposta inesperada da API do Tiny.");
  }

  if (retorno.status !== "OK") {
    const mensagem =
      retorno.erros?.map((e) => e.erro).join("; ") ||
      `Erro Tiny ${retorno.codigo_erro || "desconhecido"}`;

    throw new Error(mensagem);
  }

  return retorno;
}

/**
 * Pesquisa um produto pelo SKU/código.
 */
export async function findProductBySku(sku) {
  const retorno = await request("produtos.pesquisa.php", {
    pesquisa: String(sku),
  });

  const produtos = retorno.produtos || [];

  // A pesquisa pode encontrar códigos parcialmente iguais.
  // Por segurança procuramos correspondência EXATA do SKU.
  const resultado = produtos.find(
    (p) => String(p.produto?.codigo) === String(sku)
  );

  if (!resultado?.produto) {
    return null;
  }

  return resultado.produto;
}

/**
 * Obtém cadastro completo pelo ID interno do Tiny.
 */
export async function getProduct(id) {
  const retorno = await request("produto.obter.php", {
    id: String(id),
  });

  return retorno.produto || null;
}

/**
 * Pesquisa pelo SKU e depois busca o cadastro completo.
 */
export async function getProductBySku(sku) {
  const encontrado = await findProductBySku(sku);

  if (!encontrado) {
    return null;
  }

  const produto = await getProduct(encontrado.id);

  return {
    id: produto.id,
    sku: produto.codigo,
    nome: produto.nome,

    // IMPORTANTE: usamos último custo, não custo médio
    custo: Number(produto.preco_custo || 0),

    ean: produto.gtin || null,
    eanEmbalagem: produto.gtin_embalagem || null,

    origem: produto.origem ?? null,
    ncm: produto.ncm || null,

    precoVenda: Number(produto.preco || 0),
    precoPromocional: Number(produto.preco_promocional || 0),

    situacao: produto.situacao,
  };
}