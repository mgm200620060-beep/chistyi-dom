import json, os, datetime, urllib.request

TOKEN = os.environ["BOT_TOKEN"]
API = "https://api.telegram.org/bot%s/" % TOKEN
UTC_OFFSET = 5   # часовой пояс: часы от UTC
SEND_HOUR = 8    # во сколько присылать утром
START = datetime.date(2026, 11, 5)
APP_URL = "https://mgm200620060-beep.github.io/chistyi-dom/"
PEOPLE = ["Мухаммад 1", "Мухаммад 2", "Идрис"]
GROUPS = [["Готовка", "Сумка с едой на работу"], ["Уборка", "Вынос мусора"], ["Посуда"]]


def call(method, **params):
    req = urllib.request.Request(API + method, json.dumps(params).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def send(chat, text, markup=None):
    p = {"chat_id": chat, "text": text}
    if markup:
        p["reply_markup"] = markup
    try:
        call("sendMessage", **p)
    except Exception as e:
        print("send error", type(e).__name__)


def assign(day):
    res = {p: [] for p in PEOPLE}
    for c, g in enumerate(GROUPS):
        res[PEOPLE[(c + day) % 3]] += g
    return res


state = json.load(open("state.json"))
state.setdefault("chats", {})
kb = {"keyboard": [[{"text": p}] for p in PEOPLE], "resize_keyboard": True}
btn = {"inline_keyboard": [[{"text": "Открыть очередь", "web_app": {"url": APP_URL}}]]}

try:
    call("setChatMenuButton", menu_button={"type": "web_app", "text": "Очередь", "web_app": {"url": APP_URL}})
except Exception as e:
    print("menu error", type(e).__name__)

for u in call("getUpdates", offset=state.get("offset", 0), timeout=0)["result"]:
    state["offset"] = u["update_id"] + 1
    m = u.get("message")
    if not m or m["chat"].get("type") != "private":
        continue
    text = (m.get("text") or "").strip()
    chat = m["chat"]["id"]
    if text in PEOPLE:
        state["chats"][text] = chat
        send(chat, "Готово, %s! Буду писать тебе каждое утро." % text, btn)
    else:
        send(chat, "Привет! Выбери, кто ты:", kb)

now = datetime.datetime.utcnow() + datetime.timedelta(hours=UTC_OFFSET)
today = now.date()
if today >= START and now.hour >= SEND_HOUR and state.get("last_sent") != str(today):
    a = assign((today - START).days)
    allv = "\n".join("%s: %s" % (p, ", ".join(a[p])) for p in PEOPLE)
    for p, chat in state["chats"].items():
        send(chat, "Доброе утро, %s!\nСегодня на тебе: %s\n\nВсе дела:\n%s" % (p, " + ".join(a[p]), allv), btn)
    state["last_sent"] = str(today)

json.dump(state, open("state.json", "w"), ensure_ascii=False)
