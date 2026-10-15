import fs from "fs";

const QUEUE_PATH = new URL("../pending.json", import.meta.url);


// ─────────────────────────────────────────────
// LEITURA / GRAVAÇÃO
// ─────────────────────────────────────────────

function load() {
  if (!fs.existsSync(QUEUE_PATH)) {
    return [];
  }

  return JSON.parse(
    fs.readFileSync(QUEUE_PATH, "utf-8")
  );
}


function save(list) {
  fs.writeFileSync(
    QUEUE_PATH,
    JSON.stringify(list, null, 2)
  );
}


// ─────────────────────────────────────────────
// ADICIONAR / ATUALIZAR CANDIDATO
// ─────────────────────────────────────────────

/**
 * Adiciona um candidato novo ou atualiza um
 * candidato que já esteja na fila.
 *
 * A chave considerada é:
 *
 * itemId + promotionId
 *
 * Isso permite atualizar:
 * - preço
 * - dados financeiros
 * - offerId
 * - promotionStock
 * - benefícios ML
 * - demais informações da oportunidade
 *
 * sem duplicar o candidato.
 */
export function enqueue(candidate) {
  const pending = load();

  const index = pending.findIndex(
    (c) =>
      c.itemId === candidate.itemId &&
      c.promotionId === candidate.promotionId
  );


  // ─────────────────────────────────────────
  // CANDIDATO JÁ EXISTE
  // ─────────────────────────────────────────

  if (index !== -1) {
    const existing = pending[index];

    pending[index] = {
      ...existing,
      ...candidate,

      // Preserva quando entrou originalmente
      queuedAt:
        existing.queuedAt ??
        new Date().toISOString(),

      // Atualiza sempre que uma nova detecção ocorrer
      updatedAt:
        new Date().toISOString(),
    };

    save(pending);

    // false = não foi criado um novo registro,
    // apenas atualizado.
    return false;
  }


  // ─────────────────────────────────────────
  // NOVO CANDIDATO
  // ─────────────────────────────────────────

  pending.push({
    ...candidate,

    queuedAt:
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString(),
  });

  save(pending);

  return true;
}


// ─────────────────────────────────────────────
// CONSULTAR FILA
// ─────────────────────────────────────────────

export function getPending() {
  return load();
}


// ─────────────────────────────────────────────
// REMOVER DA FILA
// ─────────────────────────────────────────────

export function removeFromQueue(
  itemId,
  promotionId
) {
  const list = load().filter(
    (c) =>
      !(
        c.itemId === itemId &&
        c.promotionId === promotionId
      )
  );

  save(list);
}