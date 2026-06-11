(() => {
  const D = window.SZOC_DATA;
  const app = document.getElementById("app");
  const themeToggle = document.getElementById("themeToggle");
  const shortcutDialog = document.getElementById("shortcutDialog");
  const closeShortcuts = document.getElementById("closeShortcuts");

  if (!D || !Array.isArray(D.temak) || !Array.isArray(D.kartyak)) {
    app.innerHTML = '<div class="empty-state">Az adatok nem tölthetők be. Ellenőrizd, hogy a data.js az index.html mellett van-e.</div>';
    return;
  }

  const topicNames = Object.fromEntries(D.temak.map((t) => [t.id, t.cim]));
  topicNames.potlolagos = "Pótlólagos";
  topicNames.szakemberek = "Szakemberek";

  const store = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
      localStorage.removeItem(key);
    },
  };

  const state = {
    topicSearch: "",
    topFilter: "osszes",
    topQuiz: false,
    topRevealed: new Set(),
    cardFilter: "osszes",
    cardWeakOnly: false,
    cardIndex: 0,
    cardFlipped: false,
    cardOrder: null,
    quizMode: store.get("szoc.kviz.mod", "egyenkent"),
    quizIndex: 0,
    quizAnswers: store.get("szoc.kviz.valaszok", {}),
    quizReview: store.get("szoc.kviz.eredmenyek", { correct: {} }).correct || {},
    quizSubmitted: false,
    quizOnlyIds: null,
  };

  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const slug = (value) =>
    stripMd(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ő/g, "o")
      .replace(/ű/g, "u")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  function stripMd(value) {
    return String(value ?? "")
      .replace(/^#+\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/\|/g, " ")
      .trim();
  }

  function inlineMd(value) {
    return esc(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function mdToHtml(markdown) {
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let i = 0;

    const isBlockStart = (line) =>
      /^(#{1,4}\s+|---+$|>\s?|\|.*\||[-*]\s+|\d+\.\s+)/.test(line.trim());

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) {
        i += 1;
        continue;
      }

      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const text = heading[2].trim();
        html.push(`<h${level} id="${slug(text)}">${inlineMd(text)}</h${level}>`);
        i += 1;
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        html.push("<hr>");
        i += 1;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quote.push(lines[i].trim().replace(/^>\s?/, ""));
          i += 1;
        }
        html.push(`<blockquote><p>${inlineMd(quote.join(" "))}</p></blockquote>`);
        continue;
      }

      if (/^\|.*\|$/.test(trimmed) && lines[i + 1] && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[i + 1].trim())) {
        const header = trimmed.split("|").slice(1, -1).map((c) => c.trim());
        i += 2;
        const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
          rows.push(lines[i].trim().split("|").slice(1, -1).map((c) => c.trim()));
          i += 1;
        }
        html.push(
          `<div class="table-scroll"><table><thead><tr>${header.map((c) => `<th>${inlineMd(c)}</th>`).join("")}</tr></thead><tbody>${rows
            .map((r) => `<tr>${r.map((c) => `<td>${inlineMd(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table></div>`
        );
        continue;
      }

      if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        const ordered = /^\d+\.\s+/.test(trimmed);
        const tag = ordered ? "ol" : "ul";
        const items = [];
        const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
        while (i < lines.length && re.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(re, ""));
          i += 1;
        }
        html.push(`<${tag}>${items.map((item) => `<li>${inlineMd(item)}</li>`).join("")}</${tag}>`);
        continue;
      }

      const parts = [trimmed];
      i += 1;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
        parts.push(lines[i].trim());
        i += 1;
      }
      html.push(`<p>${inlineMd(parts.join(" "))}</p>`);
    }

    return html.join("\n");
  }

  function markNumbers(root) {
    const re = /(\d+(?:[.,]\d+)*(?:[-–]\d+(?:[.,]\d+)*)?(?:\s?(?:%|‰|Ft|fő|ezer|millió|nap|év|óra|hó|db|M|l|e|\/100e|\/100 ezer|l\/fő\/év))?|\d+\/\d+)/gu;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (!parent || parent.closest("button,a,input,textarea,select,code,.num,.no-num")) continue;
      const text = node.nodeValue;
      if (!re.test(text)) {
        re.lastIndex = 0;
        continue;
      }
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const match of text.matchAll(re)) {
        const index = match.index ?? 0;
        if (index > last) frag.append(document.createTextNode(text.slice(last, index)));
        const span = document.createElement("span");
        span.className = "num";
        span.textContent = match[0];
        frag.append(span);
        last = index + match[0].length;
      }
      if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
      node.replaceWith(frag);
    }
  }

  function enhanceMinimum(root) {
    root.querySelectorAll(".article h3").forEach((h3) => {
      if (stripMd(h3.textContent).toUpperCase().includes("MIT KELL MINIMUM TUDNOD")) {
        const quote = h3.nextElementSibling;
        if (quote?.tagName === "BLOCKQUOTE") quote.classList.add("minimum");
      }
    });
  }

  function highlightTerm(html, term) {
    if (!term) return html;
    const safe = esc(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return html.replace(new RegExp(safe, "gi"), (m) => `<mark>${m}</mark>`);
  }

  function page(path = "") {
    return (path || location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
  }

  function backHome() {
    return '<a class="back-home" href="#/">Vissza a kezdőlapra</a>';
  }

  function setActiveNav() {
    const first = page()[0] || "";
    document.querySelectorAll(".top-nav a").forEach((a) => {
      const target = a.getAttribute("href").replace(/^#\/?/, "").split("/")[0];
      a.classList.toggle("active", target === first);
    });
  }

  function render(html, after) {
    app.innerHTML = html;
    enhanceMinimum(app);
    after?.();
    markNumbers(app);
    setActiveNav();
    app.focus({ preventScroll: true });
  }

  function fiveDayPlan() {
    const table = D.utmutato.fullMd.match(/\| Nap \| Mit csinálj \|[\s\S]*?(?=\n\n)/);
    if (!table) return [];
    return [...table[0].matchAll(/^\|\s*(\d+\.\s*nap)\s*\|\s*(.*?)\s*\|$/gm)].map((m) => ({ nap: m[1], text: m[2] }));
  }

  function renderHome() {
    const quick = [
      ["AKTÍV FELIDÉZÉS", "A passzív olvasás nem tanulás."],
      ["ISMÉTLÉSI REND", "A felejtési görbe miatt az időzítés legalább olyan fontos, mint a tanulás."],
      ["Csoportosítás (chunking)", "Ne próbálj megjegyezni 20 különálló számot."],
      ["Tier 1 – KÖTELEZŐ", "Fogalmak definíciói; Tendencia irány; Kulcs-szakértők nevei."],
    ];
    render(`
      <section class="page-head">
        <h1>Szociológia tanuló</h1>
        <p>A Puska, a Kártyák, a Kvíz és a Tanulási útmutató egy helyen.</p>
      </section>
      <div class="home-grid">
        ${[
          ["#/utmutato", "Hogyan tanulj?", "01_Tanulasi_utmutato.md"],
          ["#/temak", "Témák", "02_Puska_temankent.md"],
          ["#/kartyak", "Kártyák", "Aktív felidézés gyakorlására"],
          ["#/kviz", "Kvíz", "04_Onellenorzo_kviz.md"],
        ]
          .map(([href, title, text]) => `<a class="card" href="${href}"><strong>${title}</strong><span>${text}</span></a>`)
          .join("")}
      </div>
      <div class="section-title">
        <h2>Gyors tipp panel</h2>
        <a href="#/top25">25 legfontosabb szám</a>
      </div>
      <div class="quick-grid">
        ${quick.map(([title, text]) => `<div class="quick-item"><strong>${inlineMd(title)}</strong><span>${inlineMd(text)}</span></div>`).join("")}
      </div>
      <div class="section-title"><h2>5 napos tanulási terv</h2></div>
      <div class="plan-grid">
        ${fiveDayPlan().map((row) => `<div class="plan-day"><strong>${row.nap}</strong><span>${inlineMd(row.text)}</span></div>`).join("")}
      </div>
    `);
  }

  function renderGuide() {
    render(`
      <div class="two-column">
        <nav class="toc" aria-label="Tartalomjegyzék">
          ${D.utmutato.toc.map((s) => `<a href="#/utmutato" data-toc="${s.id}">${inlineMd(s.title)}</a>`).join("")}
        </nav>
        <article class="article">${mdToHtml(D.utmutato.fullMd)}${backHome()}</article>
      </div>
    `, bindToc);
  }

  function bindToc() {
    const links = [...app.querySelectorAll(".toc a")];
    links.forEach((a) => {
      a.addEventListener("click", (event) => {
        event.preventDefault();
        document.getElementById(a.dataset.toc)?.scrollIntoView({ block: "start" });
      });
    });
    const heads = links.map((a) => document.getElementById(a.dataset.toc)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        links.forEach((a) => a.classList.toggle("active", a.dataset.toc === visible.target.id));
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0.1, 0.4, 0.8] }
    );
    heads.forEach((head) => observer.observe(head));
  }

  function topicCardsHtml(query = "") {
    const q = query.trim().toLowerCase();
    const cards = D.temak.filter((t) => !q || stripMd(t.tartalom).toLowerCase().includes(q));
    if (!cards.length) return '<div class="empty-state">Nincs találat.</div>';
    return cards
      .map((t) => {
        const plain = stripMd(t.tartalom).replace(/\s+/g, " ");
        const hitAt = q ? plain.toLowerCase().indexOf(q) : -1;
        const snippet = hitAt >= 0 ? `...${plain.slice(Math.max(0, hitAt - 70), hitAt + q.length + 110)}...` : t.lenyeg;
        return `<article class="topic-card">
          <h2>${inlineMd(t.cim)}</h2>
          <p class="snippet">${highlightTerm(inlineMd(snippet), query.trim())}</p>
          <div class="meta">Kulcsszámok darabszáma: ${t.kulcsszamok}</div>
          <a class="button" href="#/temak/${t.id}">Megnyitás</a>
        </article>`;
      })
      .join("");
  }

  function renderTopics() {
    render(`
      <section class="page-head">
        <h1>Témák</h1>
        <p>7 téma a Puska sorrendjében.</p>
      </section>
      <div class="controls">
        <input class="search-input" id="topicSearch" type="search" value="${esc(state.topicSearch)}" placeholder="Keresés a témák teljes szövegében" aria-label="Keresés a témák teljes szövegében">
      </div>
      <div class="topic-grid" id="topicCards">${topicCardsHtml(state.topicSearch)}</div>
      ${backHome()}
    `, () => {
      const input = document.getElementById("topicSearch");
      const target = document.getElementById("topicCards");
      input.addEventListener("input", () => {
        state.topicSearch = input.value;
        target.innerHTML = topicCardsHtml(state.topicSearch);
        markNumbers(target);
      });
    });
  }

  function renderTopic(id) {
    const index = D.temak.findIndex((t) => t.id === id);
    const topic = D.temak[index];
    if (!topic) return renderNotFound();
    const prev = D.temak[(index + D.temak.length - 1) % D.temak.length];
    const next = D.temak[(index + 1) % D.temak.length];
    render(`
      <nav class="topic-nav" aria-label="Témanavigáció">
        <a class="button secondary" href="#/temak/${prev.id}">← Előző téma</a>
        <a class="button secondary" href="#/temak">Témák</a>
        <a class="button secondary" href="#/temak/${next.id}">Következő téma →</a>
      </nav>
      <article class="article">${mdToHtml(topic.tartalom)}${backHome()}</article>
    `);
  }

  function renderTop25() {
    const topics = [...new Set(D.top25.map((row) => row.tema))];
    const rows = D.top25.filter((row) => state.topFilter === "osszes" || row.tema === state.topFilter);
    render(`
      <section class="page-head">
        <h1>Top 25 szám</h1>
        <p>A 25 legfontosabb szám interaktív listája.</p>
      </section>
      <div class="chip-row" aria-label="Témaszűrő">
        <button class="chip ${state.topFilter === "osszes" ? "active" : ""}" type="button" data-top-filter="osszes">Összes</button>
        ${topics.map((id) => `<button class="chip ${state.topFilter === id ? "active" : ""}" type="button" data-top-filter="${id}">${inlineMd(topicNames[id] || id)}</button>`).join("")}
      </div>
      <div class="controls">
        <label class="toggle-line"><input id="topQuiz" type="checkbox" ${state.topQuiz ? "checked" : ""}> Kvíz mód</label>
      </div>
      <div class="top-grid">
        ${rows
          .map((row) => {
            const revealed = !state.topQuiz || state.topRevealed.has(row.szam);
            const value = inlineMd(row.ertek);
            const valueHtml = state.topQuiz
              ? `<button type="button" class="top-value ${revealed ? "" : "masked"}" data-reveal="${row.szam}" aria-label="Felfedés">${value}</button>`
              : `<div class="top-value">${value}</div>`;
            return `<article class="top-card">
              <h2>${row.szam}. ${inlineMd(row.adat)}</h2>
              ${valueHtml}
              <div class="quiz-meta">${inlineMd(topicNames[row.tema] || row.tema)}</div>
            </article>`;
          })
          .join("")}
      </div>
      ${backHome()}
    `, bindTop25);
  }

  function bindTop25() {
    app.querySelectorAll("[data-top-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.topFilter = button.dataset.topFilter;
        renderTop25();
      });
    });
    document.getElementById("topQuiz").addEventListener("change", (event) => {
      state.topQuiz = event.target.checked;
      state.topRevealed.clear();
      renderTop25();
    });
    app.querySelectorAll("[data-reveal]").forEach((button) => {
      button.addEventListener("click", () => {
        state.topRevealed.add(Number(button.dataset.reveal));
        renderTop25();
      });
    });
  }

  function weakSet() {
    return new Set(store.get("szoc.kartyak.gyengek", []));
  }

  function saveWeak(set) {
    store.set("szoc.kartyak.gyengek", [...set]);
  }

  function cardTopics() {
    return [...new Map(D.kartyak.map((c) => [c.tema, c.temaCim || topicNames[c.tema] || c.tema])).entries()];
  }

  function cardDeck() {
    const weak = weakSet();
    let deck = D.kartyak.filter((c) => state.cardFilter === "osszes" || c.tema === state.cardFilter);
    if (state.cardWeakOnly) deck = deck.filter((c) => weak.has(c.id));
    if (state.cardOrder) {
      const byId = new Map(deck.map((c) => [c.id, c]));
      const ordered = state.cardOrder.map((id) => byId.get(id)).filter(Boolean);
      const used = new Set(ordered.map((c) => c.id));
      deck = ordered.concat(deck.filter((c) => !used.has(c.id)));
    }
    return deck;
  }

  function resetCards() {
    state.cardIndex = 0;
    state.cardFlipped = false;
    state.cardOrder = null;
  }

  function renderCards() {
    const deck = cardDeck();
    const card = deck[state.cardIndex] || null;
    const weak = weakSet();
    render(`
      <section class="page-head">
        <h1>Kártyák</h1>
        <p>Aktív felidézés gyakorlására.</p>
      </section>
      <div class="controls">
        <select id="cardFilter" aria-label="Téma szűrő">
          <option value="osszes" ${state.cardFilter === "osszes" ? "selected" : ""}>Összes téma</option>
          ${cardTopics().map(([id, title]) => `<option value="${id}" ${state.cardFilter === id ? "selected" : ""}>${inlineMd(title)}</option>`).join("")}
        </select>
        <label class="toggle-line"><input id="weakOnly" type="checkbox" ${state.cardWeakOnly ? "checked" : ""}> Csak a gyengék</label>
        <button id="shuffleCards" type="button" class="secondary">Keverés</button>
      </div>
      ${
        card
          ? `<section class="flash-layout">
              <div class="progress">${state.cardIndex + 1}/${deck.length} · ${inlineMd(topicNames[card.tema] || card.temaCim || card.tema)}</div>
              <button class="flashcard ${state.cardFlipped ? "flipped" : ""}" id="flashcard" type="button" aria-label="Kártya fordítása">
                <span class="card-face">
                  <span class="card-label">${state.cardFlipped ? "Válasz" : "Kérdés"}</span>
                  <span class="card-text">${inlineMd(state.cardFlipped ? card.valasz : card.kerdes)}</span>
                </span>
              </button>
              <div class="card-actions">
                <button id="prevCard" type="button" class="secondary">← Vissza</button>
                <button id="knownCard" type="button">Tudtam</button>
                <button id="weakCard" type="button" class="secondary">${weak.has(card.id) ? "Még gyenge" : "Még gyakorolnom kell"}</button>
                <button id="nextCard" type="button" class="secondary">Tovább →</button>
              </div>
            </section>`
          : '<div class="empty-state">Nincs kártya ebben a nézetben.</div>'
      }
      ${backHome()}
    `, bindCards);
  }

  function moveCard(delta) {
    const deck = cardDeck();
    if (!deck.length) return;
    state.cardIndex = (state.cardIndex + delta + deck.length) % deck.length;
    state.cardFlipped = false;
    renderCards();
  }

  function bindCards() {
    document.getElementById("cardFilter").addEventListener("change", (event) => {
      state.cardFilter = event.target.value;
      resetCards();
      renderCards();
    });
    document.getElementById("weakOnly").addEventListener("change", (event) => {
      state.cardWeakOnly = event.target.checked;
      resetCards();
      renderCards();
    });
    document.getElementById("shuffleCards").addEventListener("click", () => {
      const ids = cardDeck().map((c) => c.id);
      state.cardOrder = ids.sort(() => Math.random() - 0.5);
      state.cardIndex = 0;
      state.cardFlipped = false;
      renderCards();
    });
    document.getElementById("flashcard")?.addEventListener("click", () => {
      state.cardFlipped = !state.cardFlipped;
      renderCards();
    });
    document.getElementById("prevCard")?.addEventListener("click", () => moveCard(-1));
    document.getElementById("nextCard")?.addEventListener("click", () => moveCard(1));
    document.getElementById("knownCard")?.addEventListener("click", () => {
      const deck = cardDeck();
      const card = deck[state.cardIndex];
      const weak = weakSet();
      weak.delete(card.id);
      saveWeak(weak);
      moveCard(1);
    });
    document.getElementById("weakCard")?.addEventListener("click", () => {
      const deck = cardDeck();
      const card = deck[state.cardIndex];
      const weak = weakSet();
      weak.add(card.id);
      saveWeak(weak);
      moveCard(1);
    });
  }

  function allQuizQuestions() {
    const allowed = state.quizOnlyIds ? new Set(state.quizOnlyIds) : null;
    return D.kviz.reszek.flatMap((part) =>
      part.kerdesek
        .filter((q) => !allowed || allowed.has(q.id))
        .map((q) => ({ ...q, resz: part.cim }))
    );
  }

  function questionTextarea(q) {
    return `<label class="quiz-card">
      <span class="quiz-meta">${q.id}. kérdés · ${q.pont} pont · ${inlineMd(q.resz)}</span>
      <strong>${inlineMd(q.kerdes)}</strong>
      <textarea data-answer="${q.id}" aria-label="${q.id}. kérdés válasza">${esc(state.quizAnswers[q.id] || "")}</textarea>
    </label>`;
  }

  function renderQuiz() {
    const questions = allQuizQuestions();
    if (state.quizSubmitted) return renderQuizResults(questions);
    const current = questions[state.quizIndex] || questions[0];
    const grouped = D.kviz.reszek
      .map((part) => {
        const allowed = state.quizOnlyIds ? new Set(state.quizOnlyIds) : null;
        const qs = part.kerdesek.filter((q) => !allowed || allowed.has(q.id)).map((q) => ({ ...q, resz: part.cim }));
        if (!qs.length) return "";
        return `<section><h2>${inlineMd(part.cim)}</h2>${qs.map(questionTextarea).join("")}</section>`;
      })
      .join("");
    render(`
      <section class="page-head">
        <h1>Kvíz</h1>
        <p>40 kérdés négy szekcióban.</p>
      </section>
      <div class="controls">
        <button class="chip ${state.quizMode === "egyenkent" ? "active" : ""}" type="button" data-quiz-mode="egyenkent">Egy kérdés egyszerre</button>
        <button class="chip ${state.quizMode === "egyben" ? "active" : ""}" type="button" data-quiz-mode="egyben">Minden kérdés egyben</button>
        ${state.quizOnlyIds ? '<span class="quiz-meta">Csak a hibásak újra</span>' : ""}
      </div>
      ${
        state.quizMode === "egyenkent" && current
          ? `<div class="progress">${state.quizIndex + 1}/${questions.length}</div>${questionTextarea(current)}
             <div class="card-actions">
               <button id="prevQuiz" type="button" class="secondary">← Vissza</button>
               <button id="nextQuiz" type="button" class="secondary">Tovább →</button>
               <button id="submitQuiz" type="button">Beadás</button>
             </div>`
          : `${grouped}<div class="card-actions"><button id="submitQuiz" type="button">Beadás</button></div>`
      }
      ${backHome()}
    `, bindQuiz);
  }

  function saveAnswers() {
    store.set("szoc.kviz.valaszok", state.quizAnswers);
  }

  function submitQuiz() {
    const correct = {};
    allQuizQuestions().forEach((q) => {
      correct[q.id] = false;
    });
    state.quizReview = correct;
    state.quizSubmitted = true;
    store.set("szoc.kviz.eredmenyek", { correct, answers: state.quizAnswers });
    renderQuiz();
  }

  function renderQuizResults(questions) {
    const rawMax = questions.reduce((sum, q) => sum + q.pont, 0);
    const rawScore = questions.reduce((sum, q) => sum + (state.quizReview[q.id] ? q.pont : 0), 0);
    const max = state.quizOnlyIds ? rawMax : D.kviz.maximum;
    const score = state.quizOnlyIds || !rawMax ? rawScore : Math.round((rawScore / rawMax) * D.kviz.maximum);
    const rating = D.kviz.ponthatarok.find((r) => score >= r.min && score <= r.max);
    render(`
      <section class="page-head">
        <h1>Kvíz eredmény</h1>
        <p>Felhasználói válasz és helyes válasz egymás mellett.</p>
      </section>
      <div class="score-box">
        <strong>${score}/${max} pont</strong>
        <span>${rating ? inlineMd(rating.szoveg) : "Pontozás kész."}</span>
      </div>
      <div class="card-actions">
        <button id="restartQuiz" type="button" class="secondary">Újrakezdés</button>
        <button id="retryWrong" type="button" ${questions.some((q) => !state.quizReview[q.id]) ? "" : "disabled"}>Csak a hibásak újra</button>
      </div>
      ${questions
        .map(
          (q) => `<article class="result-row">
            <div>
              <div class="quiz-meta">${q.id}. kérdés · ${q.pont} pont</div>
              <strong>${inlineMd(q.kerdes)}</strong>
              <div class="answer-box">${esc(state.quizAnswers[q.id] || "")}</div>
            </div>
            <div>
              <div class="quiz-meta">Megoldókulcs</div>
              <div class="answer-box">${inlineMd(q.megoldas)}</div>
            </div>
            <div class="card-actions">
              <button type="button" class="${state.quizReview[q.id] ? "" : "secondary"}" data-grade="${q.id}" data-ok="1">Pipa</button>
              <button type="button" class="${state.quizReview[q.id] === false ? "" : "secondary"}" data-grade="${q.id}" data-ok="0">X</button>
            </div>
          </article>`
        )
        .join("")}
      ${backHome()}
    `, bindQuizResults);
  }

  function bindQuiz() {
    app.querySelectorAll("[data-quiz-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.quizMode = button.dataset.quizMode;
        store.set("szoc.kviz.mod", state.quizMode);
        renderQuiz();
      });
    });
    app.querySelectorAll("[data-answer]").forEach((textarea) => {
      textarea.addEventListener("input", () => {
        state.quizAnswers[textarea.dataset.answer] = textarea.value;
        saveAnswers();
      });
    });
    document.getElementById("prevQuiz")?.addEventListener("click", () => {
      state.quizIndex = Math.max(0, state.quizIndex - 1);
      renderQuiz();
    });
    document.getElementById("nextQuiz")?.addEventListener("click", () => {
      state.quizIndex = Math.min(allQuizQuestions().length - 1, state.quizIndex + 1);
      renderQuiz();
    });
    document.getElementById("submitQuiz")?.addEventListener("click", submitQuiz);
  }

  function bindQuizResults() {
    app.querySelectorAll("[data-grade]").forEach((button) => {
      button.addEventListener("click", () => {
        state.quizReview[button.dataset.grade] = button.dataset.ok === "1";
        store.set("szoc.kviz.eredmenyek", { correct: state.quizReview, answers: state.quizAnswers });
        renderQuiz();
      });
    });
    document.getElementById("restartQuiz").addEventListener("click", () => {
      state.quizAnswers = {};
      state.quizReview = {};
      state.quizSubmitted = false;
      state.quizOnlyIds = null;
      state.quizIndex = 0;
      store.remove("szoc.kviz.valaszok");
      store.remove("szoc.kviz.eredmenyek");
      renderQuiz();
    });
    document.getElementById("retryWrong").addEventListener("click", () => {
      const wrong = allQuizQuestions().filter((q) => !state.quizReview[q.id]).map((q) => q.id);
      if (!wrong.length) return;
      wrong.forEach((id) => delete state.quizAnswers[id]);
      state.quizOnlyIds = wrong;
      state.quizSubmitted = false;
      state.quizIndex = 0;
      saveAnswers();
      renderQuiz();
    });
  }

  function renderNotFound() {
    render(`<div class="empty-state">Ez az oldal nem található.</div>${backHome()}`);
  }

  function route() {
    const [section, id] = page();
    if (!section) return renderHome();
    if (section === "utmutato") return renderGuide();
    if (section === "temak" && id) return renderTopic(id);
    if (section === "temak") return renderTopics();
    if (section === "top25") return renderTop25();
    if (section === "kartyak") return renderCards();
    if (section === "kviz") return renderQuiz();
    return renderNotFound();
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.textContent = theme === "dark" ? "Világos mód" : "Sötét mód";
    store.set("szoc.theme", theme);
  }

  function initTheme() {
    const saved = store.get("szoc.theme", null);
    const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(saved || preferred);
  }

  function isTyping(event) {
    return /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || "");
  }

  themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  closeShortcuts.addEventListener("click", () => shortcutDialog.close());

  document.addEventListener("keydown", (event) => {
    const [section] = page();
    if (event.key === "?" && !isTyping(event)) {
      event.preventDefault();
      shortcutDialog.showModal();
      return;
    }
    if (section === "kartyak" && !isTyping(event)) {
      if (event.code === "Space") {
        event.preventDefault();
        state.cardFlipped = !state.cardFlipped;
        renderCards();
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "j") moveCard(1);
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "k") moveCard(-1);
    }
    if (section === "kviz" && state.quizMode === "egyenkent" && event.key === "Enter" && !isTyping(event) && !state.quizSubmitted) {
      state.quizIndex = Math.min(allQuizQuestions().length - 1, state.quizIndex + 1);
      renderQuiz();
    }
  });

  window.addEventListener("hashchange", route);
  initTheme();
  route();
})();
