const PEOPLE = ["Мухаммад 1", "Мухаммад 2", "Идрис"];
const GROUPS = [["Готовка", "Сумка с едой на работу"], ["Уборка", "Вынос мусора"], ["Посуда"]];
const START = Date.UTC(2026, 10, 5);
const UTC_OFFSET = 5;
const APP_URL = "https://mgm200620060-beep.github.io/chistyi-dom/";
const BTN = { inline_keyboard: [[{ text: "Открыть очередь", web_app: { url: APP_URL } }]] };

function assign(day) {
  const res = {};
  PEOPLE.forEach((p) => (res[p] = []));
  GROUPS.forEach((g, c) => res[PEOPLE[(((c + day) % 3) + 3) % 3]].push(...g));
  return res;
}

function dayIndex() {
  const n = new Date(Date.now() + UTC_OFFSET * 3600e3);
  return Math.round((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - START) / 864e5);
}

async function tg(env, method, params) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return r.json();
}

async function secretOf(env) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.BOT_TOKEN));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function todayText(p) {
  const day = Math.max(dayIndex(), 0);
  const a = assign(day);
  const all = PEOPLE.map((x) => `${x}: ${a[x].join(", ")}`).join("\n");
  return `Сегодня на тебе: ${a[p].join(" + ")}\n\nВсе дела:\n${all}`;
}

async function handle(u, env) {
  const m = u.message;
  if (!m || m.chat.type !== "private") return;
  const text = (m.text || "").trim();
  const chat = m.chat.id;
  if (PEOPLE.includes(text)) {
    await env.KV.put("chat:" + text, String(chat));
    await tg(env, "sendMessage", { chat_id: chat, text: `Готово, ${text}! Буду писать тебе каждое утро.`, reply_markup: BTN });
    return;
  }
  if (text === "/today") {
    let who = null;
    for (const p of PEOPLE) if ((await env.KV.get("chat:" + p)) === String(chat)) who = p;
    if (who) {
      await tg(env, "sendMessage", { chat_id: chat, text: todayText(who), reply_markup: BTN });
      return;
    }
  }
  await tg(env, "sendMessage", {
    chat_id: chat,
    text: "Привет! Выбери, кто ты:",
    reply_markup: { keyboard: PEOPLE.map((p) => [{ text: p }]), resize_keyboard: true },
  });
}

async function morning(env) {
  if (dayIndex() < 0) return;
  for (const p of PEOPLE) {
    const chat = await env.KV.get("chat:" + p);
    if (!chat) continue;
    await tg(env, "sendMessage", { chat_id: chat, text: `Доброе утро, ${p}!\n` + todayText(p), reply_markup: BTN });
  }
}

const TXT = { "content-type": "text/plain; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/setup") {
      const a = await tg(env, "setWebhook", { url: url.origin + "/tg", secret_token: await secretOf(env), allowed_updates: ["message"] });
      const b = await tg(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "Очередь", web_app: { url: APP_URL } } });
      return new Response(`webhook: ${a.ok}, menu: ${b.ok}`, { headers: TXT });
    }
    if (url.pathname === "/tg" && request.method === "POST") {
      if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== (await secretOf(env))) return new Response("no", { status: 403 });
      await handle(await request.json(), env);
      return new Response("ok");
    }
    return new Response("Чистый дом: бот работает", { headers: TXT });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(morning(env));
  },
};
