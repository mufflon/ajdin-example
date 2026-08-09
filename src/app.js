/* Brew Picker — a tiny offline PWA for choosing coffee or tea.
 * No frameworks, no dependencies. State lives in memory + localStorage.
 */
(function () {
  "use strict";

  // ---- Menu definition: drives the customization screen ----------------
  const MENU = {
    coffee: {
      label: "Coffee",
      emoji: "☕",
      options: [
        { key: "style", label: "Style", choices: ["Espresso", "Latte", "Cappuccino", "Americano", "Cold brew"] },
        { key: "strength", label: "Strength", choices: ["Mild", "Regular", "Strong"] },
        { key: "milk", label: "Milk", choices: ["None", "Whole", "Oat", "Almond"] },
        { key: "sweet", label: "Sweetness", choices: ["None", "1 sugar", "2 sugar", "Syrup"] },
      ],
    },
    tea: {
      label: "Tea",
      emoji: "🍵",
      options: [
        { key: "style", label: "Type", choices: ["Green", "Black", "Oolong", "Herbal", "Chai"] },
        { key: "temp", label: "Serve", choices: ["Hot", "Iced"] },
        { key: "milk", label: "Milk", choices: ["None", "Whole", "Oat", "Almond"] },
        { key: "sweet", label: "Sweetness", choices: ["None", "Honey", "1 sugar", "Lemon"] },
      ],
    },
  };

  const LOG_KEY = "brew-picker.log.v1";
  const THEME_KEY = "brew-picker.theme.v1";

  // ---- Tiny DOM helpers -------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");

  const screens = {
    choose: $("#screen-choose"),
    customize: $("#screen-customize"),
    result: $("#screen-result"),
  };

  const state = { drink: null, selections: {} };

  function goTo(name) {
    Object.values(screens).forEach(hide);
    show(screens[name]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  }

  // ---- Step 1: choose ---------------------------------------------------
  document.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => startDrink(btn.dataset.drink));
  });

  $("#decideForMe").addEventListener("click", () => {
    const keys = Object.keys(MENU);
    const pick = keys[Math.floor(Math.random() * keys.length)];
    const card = document.querySelector(`.choice.${pick}`);
    card.classList.add("flash");
    toast(`The dice say… ${MENU[pick].label}!`);
    setTimeout(() => {
      card.classList.remove("flash");
      startDrink(pick);
    }, 650);
  });

  function startDrink(drink) {
    state.drink = drink;
    state.selections = {};
    const menu = MENU[drink];
    $("#drinkName").textContent = menu.label.toLowerCase();
    document.documentElement.style.setProperty(
      "--accent",
      drink === "tea" ? "var(--tea)" : "var(--coffee)"
    );
    buildOptions(menu);
    goTo("customize");
  }

  // ---- Step 2: customize ------------------------------------------------
  function buildOptions(menu) {
    const form = $("#customizeForm");
    form.innerHTML = "";
    menu.options.forEach((group) => {
      // Default to the first choice so a valid brew always exists.
      state.selections[group.key] = group.choices[0];

      const fieldset = document.createElement("fieldset");
      fieldset.className = "opt-group";
      const legend = document.createElement("legend");
      legend.textContent = group.label;
      fieldset.appendChild(legend);

      const pills = document.createElement("div");
      pills.className = "pills";
      group.choices.forEach((choice, i) => {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "pill";
        pill.textContent = choice;
        pill.setAttribute("aria-pressed", String(i === 0));
        pill.addEventListener("click", () => {
          state.selections[group.key] = choice;
          pills.querySelectorAll(".pill").forEach((p) =>
            p.setAttribute("aria-pressed", String(p === pill))
          );
        });
        pills.appendChild(pill);
      });
      fieldset.appendChild(pills);
      form.appendChild(fieldset);
    });
  }

  $("#backBtn").addEventListener("click", () => goTo("choose"));
  $("#brewBtn").addEventListener("click", showResult);

  // ---- Step 3: result ---------------------------------------------------
  function describe() {
    const menu = MENU[state.drink];
    const s = state.selections;
    const style = s.style || menu.label;
    const extras = menu.options
      .filter((o) => o.key !== "style")
      .map((o) => s[o.key])
      .filter((v) => v && v !== "None");
    return { menu, style, extras };
  }

  function showResult() {
    const { menu, style, extras } = describe();
    $("#brewEmoji").textContent = menu.emoji;
    $("#brewTitle").textContent = `${style} ${menu.label}`;
    const meta = $("#brewMeta");
    meta.innerHTML = "";
    if (extras.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Straight up";
      meta.appendChild(li);
    } else {
      extras.forEach((v) => {
        const li = document.createElement("li");
        li.textContent = v;
        meta.appendChild(li);
      });
    }
    goTo("result");
  }

  $("#againBtn").addEventListener("click", () => {
    state.drink = null;
    state.selections = {};
    goTo("choose");
  });

  $("#saveBtn").addEventListener("click", () => {
    const { menu, style, extras } = describe();
    const entry = {
      emoji: menu.emoji,
      title: `${style} ${menu.label}`,
      sub: extras.length ? extras.join(" · ") : "Straight up",
      at: new Date().toISOString(),
    };
    const log = loadLog();
    log.unshift(entry);
    saveLog(log.slice(0, 50));
    renderLog();
    toast("Added to your brew log ☕");
    goTo("choose");
  });

  // ---- Brew log (localStorage) -----------------------------------------
  function loadLog() {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveLog(log) {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
    } catch {
      /* storage full or blocked — non-fatal */
    }
  }

  function renderLog() {
    const log = loadLog();
    const section = $("#logSection");
    const list = $("#logList");
    section.hidden = log.length === 0;
    list.innerHTML = "";
    log.forEach((e) => {
      const li = document.createElement("li");
      li.className = "log-item";
      const when = new Date(e.at);
      const timeStr = isNaN(when) ? "" : when.toLocaleString();
      li.innerHTML =
        `<span class="li-emoji" aria-hidden="true"></span>` +
        `<span class="li-body"><span class="li-title"></span>` +
        `<span class="li-sub"></span></span>`;
      li.querySelector(".li-emoji").textContent = e.emoji;
      li.querySelector(".li-title").textContent = e.title;
      li.querySelector(".li-sub").textContent = [e.sub, timeStr].filter(Boolean).join(" — ");
      list.appendChild(li);
    });
  }

  $("#clearLog").addEventListener("click", () => {
    saveLog([]);
    renderLog();
    toast("Log cleared");
  });

  // ---- Theme toggle -----------------------------------------------------
  function applyTheme(theme) {
    // theme is "light" | "dark" | null (null = follow system)
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }
  applyTheme(localStorage.getItem(THEME_KEY));
  $("#themeToggle").addEventListener("click", () => {
    const current = document.documentElement.dataset.theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = current ? (current === "dark" ? "light" : "dark")
                         : (prefersDark ? "light" : "dark");
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });

  // ---- Online/offline indicator ----------------------------------------
  function updateNet() {
    const el = $("#netStatus");
    el.classList.toggle("offline", !navigator.onLine);
    el.title = navigator.onLine ? "Online" : "Offline — still fully usable";
  }
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  // ---- Service worker: makes the app installable & offline -------------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* SW unsupported (e.g. file://) — app still works online */
      });
    });
  }

  // ---- Boot -------------------------------------------------------------
  renderLog();
})();
