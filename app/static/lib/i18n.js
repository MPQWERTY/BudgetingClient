// i18n minimale: detect lingua browser + dizionario UI + keyword categorie.
const DICT = {
  it: {
    app_title: "Budget Storyteller",
    tagline: "Capisci i tuoi soldi. In parole semplici.",
    upload_hint: "Trascina qui il tuo estratto conto (CSV, PDF, XLSX) o clicca per selezionare",
    try_sample: "Prova con il file di esempio",
    agents_working: "Gli agenti stanno lavorando",
    score_title: "Punteggio di salute finanziaria",
    categories_title: "Dove vanno i tuoi soldi",
    story_title: "La tua storia",
    scenarios_title: "Cosa succederebbe se…",
    lessons_title: "Micro-lezioni per te",
    chat_title: "Chiedi qualsiasi cosa",
    chat_placeholder: "Es. Cosa significa TAEG?",
    ask: "Chiedi",
    history_title: "Storico analisi",
    disclaimer: "Contenuto educativo. Non è consulenza finanziaria personalizzata.",
    hitl_banner: "La qualità del parsing è bassa. Verifica il file e conferma per procedere.",
    confirm: "Conferma",
    reload: "Ricomincia",
    parser: "Parser", analyzer: "Analista", simulator: "Simulatore", advisor: "Consulente educativo",
    pending: "in attesa", running: "in corso…", done: "fatto", failed: "errore",
  },
  en: {
    app_title: "Budget Storyteller",
    tagline: "Understand your money. In plain words.",
    upload_hint: "Drop your bank statement here (CSV, PDF, XLSX) or click to select",
    try_sample: "Try the sample file",
    agents_working: "Agents at work",
    score_title: "Financial health score",
    categories_title: "Where your money goes",
    story_title: "Your story",
    scenarios_title: "What if…",
    lessons_title: "Micro-lessons for you",
    chat_title: "Ask anything",
    chat_placeholder: "E.g. What is APR?",
    ask: "Ask",
    history_title: "Analysis history",
    disclaimer: "Educational content. Not personalized financial advice.",
    hitl_banner: "Parsing quality is low. Please verify the file and confirm to proceed.",
    confirm: "Confirm",
    reload: "Restart",
    parser: "Parser", analyzer: "Analyzer", simulator: "Simulator", advisor: "Educational advisor",
    pending: "pending", running: "running…", done: "done", failed: "error",
  },
};

// keyword semplice per fallback deterministico categorizzazione
export const CATEGORY_KEYWORDS = {
  it: {
    housing: ["mutuo", "affitto", "condominio", "casa"],
    food: ["esselunga", "carrefour", "coop", "conad", "spesa", "ristorante", "pizzer", "bar "],
    transport: ["benzina", "carburante", "eni", "q8", "atm", "trenitalia", "uber", "taxi", "autostrad"],
    utilities: ["enel", "eni gas", "tim", "vodafone", "wind", "iliad", "internet", "luce", "gas"],
    entertainment: ["netflix", "spotify", "prime", "cinema", "concerto", "gioco", "steam"],
    savings: ["risparmio", "bonifico salvadanaio", "investimento"],
    income: ["stipendio", "salario", "bonifico entrata", "accredito", "pensione"],
  },
  en: {
    housing: ["rent", "mortgage", "condo"],
    food: ["grocery", "restaurant", "bar ", "pizza", "supermarket"],
    transport: ["gas", "fuel", "uber", "taxi", "train", "metro", "toll"],
    utilities: ["electric", "internet", "phone", "verizon", "att ", "gas bill"],
    entertainment: ["netflix", "spotify", "cinema", "steam", "concert"],
    savings: ["savings", "transfer to savings", "investment"],
    income: ["salary", "payroll", "wage", "pension"],
  },
};

export function detectLang() {
  const raw = (navigator.language || "it").toLowerCase();
  return raw.startsWith("en") ? "en" : "it";
}

let _current = detectLang();
export const setLang = (l) => { _current = DICT[l] ? l : "it"; };
export const getLang = () => _current;
export const t = (key) => DICT[_current]?.[key] ?? DICT.it[key] ?? key;
export const dict = () => DICT[_current];
