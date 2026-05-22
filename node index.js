// ============================================================
//  BOT WHATSAPP - DRA. THAYNELE  |  Z-API + Node.js
//  Hospede no Replit (funciona 100% pelo celular)
//  https://replit.com → New Repl → Node.js → cole este arquivo
// ============================================================

const express = require("express");
const app = express();
app.use(express.json());

// ─── CONFIGURAÇÃO Z-API ─────────────────────────────────────
// Preencha com seus dados do painel Z-API (zapi.io)
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE || "SEU_INSTANCE_ID";
const ZAPI_TOKEN    = process.env.ZAPI_TOKEN    || "SEU_TOKEN";
const ZAPI_URL      = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`;
// ────────────────────────────────────────────────────────────

// Sessões em memória: phone → { stage, data }
const sessions = new Map();

// ─── FLUXO DE MENSAGENS ──────────────────────────────────────
const FLOW = {
  // Etapa 0 — Boas-vindas + apresentação (tudo numa mensagem)
  welcome: {
    message:
      "Olá! 💚 Aqui é a assistente virtual da *Dra. Thaynele*, psicóloga " +
      "especializada em ansiedade, relacionamentos e autoconhecimento.\n\n" +
      "Fico feliz que você veio até aqui — esse já é o primeiro passo. 🌿\n\n" +
      "Como posso te chamar?",
    next: "motive"
  },

  // Etapa 1 — Motivo do contato
  motive: (name) => ({
    message:
      `Que nome lindo, *${name}*! 😊\n\n` +
      "Me conta, o que te trouxe até aqui? Responde com o *número*:\n\n" +
      "1️⃣ Ansiedade ou estresse\n" +
      "2️⃣ Relacionamentos\n" +
      "3️⃣ Autoconhecimento\n" +
      "4️⃣ Outro motivo",
    options: ["1", "2", "3", "4"],
    next: "turno"
  }),

  // Etapa 2 — Turno preferido
  turno: () => ({
    message:
      "Entendo... Você não está sozinho(a) nisso. 💙\n\n" +
      "A *Dra. Thaynele* atua de forma acolhedora, segura e 100% sigilosa. 🔒\n\n" +
      "Qual turno te funciona melhor? Responde com o *número*:\n\n" +
      "1️⃣ Manhã\n" +
      "2️⃣ Tarde",
    options: ["1", "2"],
    next: "done"
  }),

  // Etapa 3 — Finalização (bot não confirma horário fixo, Thaynele entra em contato)
  done: (turno) => {
    const turnos = { "1": "manhã", "2": "tarde" };
    return (
      `Anotado! Preferência: *${turnos[turno]}* 🗓️\n\n` +
      "A *Dra. Thaynele* vai entrar em contato em breve pra confirmar " +
      "o melhor horário pra você.\n\n" +
      "Qualquer dúvida é só falar aqui. Cuide-se! 💚"
    );
  }
};
// ─────────────────────────────────────────────────────────────

// ─── FUNÇÕES Z-API ───────────────────────────────────────────
async function sendMessage(phone, message) {
  try {
    const res = await fetch(`${ZAPI_URL}/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message })
    });
    const data = await res.json();
    console.log(`[SENT] ${phone}: ${message.slice(0, 60)}...`);
    return data;
  } catch (err) {
    console.error("[ERRO ao enviar]", err.message);
  }
}
// ─────────────────────────────────────────────────────────────

// ─── PROCESSADOR DO FLUXO ────────────────────────────────────
async function processMessage(phone, text) {
  const input = text.trim();

  // Recupera ou cria sessão
  let session = sessions.get(phone) || { stage: "welcome", data: {} };

  // ── Estágio: boas-vindas (envia sempre na 1ª mensagem) ──
  if (session.stage === "welcome") {
    await sendMessage(phone, FLOW.welcome.message);
    sessions.set(phone, { stage: "motive", data: {} });
    return;
  }

  // ── Estágio: receber nome ──
  if (session.stage === "motive") {
    const name = input;
    session.data.name = name;
    const flow = FLOW.motive(name);
    await sendMessage(phone, flow.message);
    sessions.set(phone, { stage: "turno", data: session.data });
    return;
  }

  // ── Estágio: receber motivo ──
  if (session.stage === "turno") {
    const valid = ["1", "2", "3", "4"];
    if (!valid.includes(input)) {
      await sendMessage(phone, "Por favor, responde com *1*, *2*, *3* ou *4*. 😊");
      return;
    }
    const motivoLabels = {
      "1": "Ansiedade/Estresse",
      "2": "Relacionamentos",
      "3": "Autoconhecimento",
      "4": "Outro motivo"
    };
    session.data.motive = motivoLabels[input];
    const flow = FLOW.turno();
    await sendMessage(phone, flow.message);
    sessions.set(phone, { stage: "confirm", data: session.data });
    return;
  }

  // ── Estágio: receber turno e finalizar ──
  if (session.stage === "confirm") {
    const valid = ["1", "2"];
    if (!valid.includes(input)) {
      await sendMessage(phone, "Por favor, responde com *1* pra Manhã ou *2* pra Tarde. 😊");
      return;
    }
    session.data.turno = input;
    const msg = FLOW.done(input);
    await sendMessage(phone, msg);

    // Loga o lead completo no console (dá pra ver no Replit)
    console.log("📋 NOVO LEAD:", {
      phone,
      nome: session.data.name,
      motivo: session.data.motive,
      turno: input === "1" ? "Manhã" : "Tarde"
    });

    // Remove sessão após conclusão
    sessions.delete(phone);
    return;
  }
}
// ─────────────────────────────────────────────────────────────

// ─── WEBHOOK (Z-API envia as mensagens recebidas aqui) ───────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Responde imediatamente pro Z-API

  const body = req.body;

  // Ignora mensagens enviadas pelo próprio bot
  if (body.fromMe) return;

  // Ignora grupos
  if (body.isGroup) return;

  const phone   = body.phone || body.from;
  const message = body.text?.message || body.body || "";

  if (!phone || !message) return;

  console.log(`[RECEBIDO] ${phone}: ${message}`);
  await processMessage(phone, message);
});

// Rota de saúde (pra manter o Replit acordado)
app.get("/", (req, res) => res.send("Bot Dra. Thaynele 🌿 rodando!"));

// ─── INICIA SERVIDOR ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Bot rodando na porta ${PORT}`);
  console.log(`📡 Configure o webhook da Z-API para: https://SEU-REPLIT-URL/webhook`);
});
        
