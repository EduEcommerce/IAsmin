import "dotenv/config";
import { runCycle } from "./promotions.js";

const intervalMinutes = Number(process.env.POLL_INTERVAL_MINUTES || 15);

console.log(
  `Robô de detecção de promoções ML iniciado. Intervalo=${intervalMinutes}min. ` +
    "Nada é aplicado automaticamente — use `npm run review` para aprovar."
);

async function loop() {
  try {
    await runCycle();
  } catch (err) {
    console.error("[index] Erro no ciclo:", err.response?.data || err.message);
  } finally {
    setTimeout(loop, intervalMinutes * 60 * 1000);
  }
}

loop();
