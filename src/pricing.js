import fs from "fs";
import { parse } from "csv-parse/sync";

// costs.csv precisa ter as colunas: item_id,custo,imposto_percent,comissao_percent,frete
let costTable = null;

function loadCostTable() {
  if (costTable) return costTable;

  const path = new URL("../costs.csv", import.meta.url);
  if (!fs.existsSync(path)) {
    console.warn(
      "[pricing] costs.csv não encontrado — nenhuma trava de margem será aplicada. " +
        "Crie o arquivo a partir de costs.example.csv."
    );
    costTable = {};
    return costTable;
  }

  const content = fs.readFileSync(path, "utf-8");
  const rows = parse(content, { columns: true, skip_empty_lines: true });

  costTable = {};
  for (const row of rows) {
    costTable[row.item_id] = {
      custo: Number(row.custo),
      impostoPercent: Number(row.imposto_percent),
      comissaoPercent: Number(row.comissao_percent),
      frete: Number(row.frete),
    };
  }
  return costTable;
}

/**
 * Calcula o preço mínimo que o item pode ter para preservar a margem alvo.
 * Retorna null se não houver dados de custo cadastrados (nesse caso, o item
 * é ignorado pelo robô por segurança — melhor não aplicar do que aplicar errado).
 */
export function minPriceFor(itemId) {
  const table = loadCostTable();
  const item = table[itemId];
  if (!item) return null;

  const marginPercent = Number(process.env.MIN_MARGIN_PERCENT || 10);
  const { custo, impostoPercent, comissaoPercent, frete } = item;

  // preço mínimo tal que: preço - comissão - imposto - frete - custo >= margem_alvo * preço
  // preço * (1 - comissaoPercent/100 - impostoPercent/100 - marginPercent/100) >= custo + frete
  const fatorLivre = 1 - (comissaoPercent + impostoPercent + marginPercent) / 100;
  if (fatorLivre <= 0) {
    console.warn(`[pricing] Custos/comissões de ${itemId} inviabilizam qualquer preço.`);
    return Infinity;
  }
  return (custo + frete) / fatorLivre;
}

/**
 * Decide se um preço de promoção é seguro de aplicar.
 */
export function isPriceSafe(itemId, dealPrice) {
  const minPrice = minPriceFor(itemId);
  if (minPrice === null) return false; // sem dados de custo → não arrisca
  return dealPrice >= minPrice;
}
