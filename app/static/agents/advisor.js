import { callAgent, loadSystemPrompt, isMock } from "../lib/claude.js";
import { getLang } from "../lib/i18n.js";

const MOCK = {
  score: 68,
  score_breakdown: { income_stability: 78, expense_ratio: 65, savings_rate: 40, emergency_fund: 30, debt_management: 85 },
  interpretation: "Punteggio nella media. Punto forte: gestione del debito. Da migliorare: fondo di emergenza e tasso di risparmio.",
  weak_areas: [
    { key: "emergency_fund", score: 30, why: "Nessun bonifico verso risparmio nel periodo analizzato." },
    { key: "savings_rate", score: 40, why: "Risparmi <10% del reddito." },
  ],
  mini_lessons: [
    {
      id: "emergency-fund-101", title: "Costruire un fondo di emergenza",
      difficulty: "beginner", duration_min: 8,
      steps: ["Cos'è un fondo di emergenza", "Quanto serve (3-6 mesi di spese)", "Dove tenerlo", "Come costruirlo con piccoli passi"],
      quiz: [{ q: "Quante mensilità di spese dovrebbe coprire?", a: ["1 mese", "3-6 mesi", "1 anno"], correct: 1 }],
    },
  ],
  disclaimer: "Contenuto educativo. Non è consulenza finanziaria personalizzata.",
};

function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, Math.round(v))); }

// Calcolo score reale sulle 5 dimensioni a partire dall'analisi
function computeScore(analysis) {
  const totals = analysis?.totals || {};
  const cats = analysis?.categories || {};
  const income = Math.max(totals.income || 0, 1);
  const expenses = Math.abs(totals.expenses || 0);
  const savings = cats.savings?.total || 0;
  const debtCat = Math.abs(cats.housing?.total || 0);
  const essentialPct = totals.essential_pct || 0;
  const savingsPct = income ? (savings / income) * 100 : 0;
  const net = totals.net || 0;

  // Income stability: proxy = quanto il netto è positivo
  const income_stability = clamp(50 + (net / income) * 200);
  // Expense ratio: bassa quota essenziali (<70%) = ok
  const expense_ratio = clamp(essentialPct > 80 ? 30 : essentialPct > 65 ? 55 : essentialPct > 50 ? 75 : 90);
  // Savings rate: target >=20%
  const savings_rate = clamp(Math.min(100, (savingsPct / 20) * 100));
  // Emergency fund: bonifici a risparmio presenti?
  const emergency_fund = clamp(savings > 0 ? 60 + Math.min(40, savings / income * 200) : 25);
  // Debt management: rata casa <=33% reddito = ottimo
  const debt_management = clamp(debtCat === 0 ? 85 : debtCat / income > 0.4 ? 40 : debtCat / income > 0.33 ? 65 : 90);

  const score = clamp((income_stability + expense_ratio + savings_rate + emergency_fund + debt_management) / 5);
  return { score, breakdown: { income_stability, expense_ratio, savings_rate, emergency_fund, debt_management } };
}

// ------------------ LESSON BANK (rich wizard structure) ------------------
// Ogni lezione: { id, title, difficulty, duration_min, hook, thumb_emoji,
//   personalization: [{q, options, key}], chapters: [{teach, quiz:{q,a,correct,explanation}}],
//   action_plan: (p) => string[], wrap_up: (p) => string }
// Retro-compat: se il consumer legge steps/quiz singolo, il wizard lo wrappa.
const LESSON_BANK = {
  it: {
    emergency_fund: {
      id: "emergency-fund-101",
      title: "Costruire un fondo di emergenza",
      difficulty: "principiante",
      duration_min: 6,
      thumb_emoji: "🛡️",
      hook: "Un imprevisto — un'auto rotta, un mese senza lavoro — può mandare in tilt anche un budget in ordine. Il fondo di emergenza è la tua rete di sicurezza personale.",
      personalization: [
        { key: "current_reserve", q: "Quanta liquidità di riserva hai oggi?", options: ["Zero o quasi", "Meno di 1 mese di spese", "1-3 mesi", "Più di 3 mesi"] },
        { key: "monthly_expenses", q: "Quanto spendi in media al mese per le sole spese essenziali (casa, cibo, bollette)?", options: ["Meno di 800€", "800-1500€", "1500-2500€", "Oltre 2500€"] },
      ],
      chapters: [
        {
          teach: "Il fondo di emergenza è una riserva di liquidità (cash, non investita) che copre le spese essenziali in caso di imprevisto: perdita del lavoro, spese mediche, riparazioni urgenti. Non è un investimento: è assicurazione.",
          quiz: {
            q: "Qual è lo scopo principale del fondo di emergenza?",
            a: ["Farlo rendere il più possibile", "Coprire imprevisti senza indebitarsi", "Pagare le vacanze"],
            correct: 1,
            explanation: "Serve a evitare di ricorrere a debiti costosi (carte revolving, prestiti al consumo) quando la vita ti sorprende.",
          },
        },
        {
          teach: "La regola più diffusa è tenere da parte 3-6 mesi di spese essenziali. Chi ha reddito instabile (freelance, stagionale) punta a 6-12 mesi; chi ha uno stipendio molto stabile può iniziare da 3.",
          quiz: {
            q: "Quante mensilità di spese essenziali dovrebbe coprire un fondo di emergenza tipico?",
            a: ["1 mese", "3-6 mesi", "12 mesi sempre"],
            correct: 1,
            explanation: "3-6 mesi è la fascia standard. Serve un tempo ragionevole per riorganizzarti senza fretta.",
          },
        },
        {
          teach: "Dove tenerlo? Su un conto separato (conto deposito o conto risparmio) liquido e disponibile subito. Non su ETF né azioni: il valore deve essere prevedibile quando ne hai bisogno.",
          quiz: {
            q: "Dove è meglio tenere il fondo di emergenza?",
            a: ["Su ETF azionari per farlo crescere", "Su un conto deposito liquido", "In casa in contanti"],
            correct: 1,
            explanation: "Un conto deposito rende un piccolo interesse ma resta immediatamente accessibile — l'opzione giusta per una riserva d'emergenza.",
          },
        },
      ],
      action_plan: (p) => {
        const exp = p?.monthly_expenses;
        const target = exp === "Meno di 800€" ? "€2.400" : exp === "800-1500€" ? "€4.500" : exp === "1500-2500€" ? "€7.500" : "€10.000+";
        return [
          `Definisci il tuo target: mira a ${target} (circa 3 mesi delle tue spese essenziali).`,
          "Apri un conto deposito separato (basta 5 min online).",
          "Attiva un bonifico automatico mensile — anche solo 50€ è un inizio concreto.",
        ];
      },
      wrap_up: (p) => {
        const reserve = p?.current_reserve;
        if (reserve === "Zero o quasi") return "Sei al punto zero, ed è perfetto sapere da dove partire. Concentrati sul primo €500: è la soglia psicologica che cambia tutto. Poi automatizzi e non ci pensi più.";
        if (reserve === "Meno di 1 mese di spese") return "Sei già in cammino. Il salto vero è portarti a 3 mesi: da lì le notti si dormono diversamente. Piccolo bonifico automatico e mesi a testa bassa.";
        if (reserve === "1-3 mesi") return "Ottima base. Adesso puoi lavorare sull'obiettivo 6 mesi se hai reddito variabile, altrimenti destina il surplus a investimenti di lungo termine.";
        return "Sei nella zona sicura. Verifica che siano davvero liquidi (non investiti) e valuta se destinare l'eccedenza a obiettivi di lungo termine.";
      },
    },

    savings_rate: {
      id: "savings-101",
      title: "Aumentare il tasso di risparmio",
      difficulty: "principiante",
      duration_min: 6,
      thumb_emoji: "💰",
      hook: "Non conta quanto guadagni, ma quanto trattieni. Anche 100€ al mese oggi diventano oltre €12.000 in 10 anni — senza fare nulla di eroico.",
      personalization: [
        { key: "current_savings", q: "Quanto stai risparmiando ora del tuo reddito netto?", options: ["Zero (o meno)", "Meno del 10%", "Tra 10% e 20%", "Più del 20%"] },
        { key: "goal", q: "Qual è il tuo obiettivo principale?", options: ["Fondo di emergenza", "Comprare casa", "Un viaggio importante", "Pensione integrativa", "Non ho ancora deciso"] },
      ],
      chapters: [
        {
          teach: "Il tasso di risparmio è la quota di reddito netto che non spendi. Le fasce di riferimento: sotto il 10% = poco protetto, 10-20% = sostenibile, oltre 20% = solido. Ogni punto percentuale in più oggi accorcia gli anni verso i tuoi obiettivi.",
          quiz: {
            q: "Qual è la fascia minima raccomandata per un tasso di risparmio sano?",
            a: ["1-5%", "10-20%", "50%"],
            correct: 1,
            explanation: "Il 10-20% è considerato il minimo per costruire riserve e iniziare a investire senza sacrifici estremi.",
          },
        },
        {
          teach: "La regola 50/30/20 divide il reddito netto in: 50% bisogni (casa, cibo, bollette), 30% desideri (svago, shopping), 20% risparmio e riduzione debiti. È una bussola, non una gabbia: adattala alla tua realtà.",
          quiz: {
            q: "Con la regola 50/30/20, se guadagni €2.000 netti, quanto dovresti destinare al risparmio?",
            a: ["€100", "€300", "€400"],
            correct: 2,
            explanation: "20% di €2.000 = €400. È un target, non un obbligo: se sei sotto, inizia dal 10% e sali gradualmente.",
          },
        },
        {
          teach: "Il segreto è automatizzare. Se aspetti la fine del mese per risparmiare 'quello che avanza', avanzerà sempre poco. Sposta la quota di risparmio appena arriva lo stipendio, su un conto separato.",
          quiz: {
            q: "Quando è meglio effettuare il bonifico verso il risparmio?",
            a: ["A fine mese, con quello che resta", "Appena arriva lo stipendio, in automatico", "Solo se avanza qualcosa dopo le spese"],
            correct: 1,
            explanation: "Pay yourself first: il risparmio automatico a inizio mese è la singola abitudine più potente per aumentare il tasso di risparmio.",
          },
        },
      ],
      action_plan: (p) => {
        const cur = p?.current_savings;
        const target = cur === "Zero (o meno)" ? "5%" : cur === "Meno del 10%" ? "10%" : cur === "Tra 10% e 20%" ? "20%" : "25%";
        return [
          `Imposta un bonifico automatico mensile pari al ${target} dello stipendio, il giorno stesso dell'accredito.`,
          "Fai un giro degli abbonamenti attivi: cancella tutto quello che non usi da 30 giorni.",
          "Definisci un obiettivo con nome e cifra (es. 'Fondo casa €5.000') e crea un conto dedicato.",
        ];
      },
      wrap_up: (p) => {
        const cur = p?.current_savings;
        const goal = p?.goal || "il tuo obiettivo";
        if (cur === "Zero (o meno)") return `Partire da zero è la parte più difficile — dopo un mese di automatismo diventa invisibile. Punta al 5% subito, poi sali. Con l'obiettivo "${goal}" davanti, ogni bonifico ha un senso concreto.`;
        if (cur === "Meno del 10%") return `Hai il meccanismo, manca la marcia. Portati al 10% questo mese, poi al 15% tra 90 giorni. Per "${goal}" servono passi ripetuti, non salti eroici.`;
        if (cur === "Tra 10% e 20%") return `Sei in fascia sostenibile. Il salto successivo è mentale: passa da 'quanto risparmio' a 'dove alloco'. Con "${goal}" in agenda, valuta di aprire un conto dedicato con nome specifico.`;
        return `Sei sopra la media italiana. Ora il tema è ottimizzazione: parte liquida per emergenze, parte pianificata per "${goal}", parte investita di lungo termine.`;
      },
    },

    expense_ratio: {
      id: "expense-101",
      title: "Rimettere in equilibrio le spese",
      difficulty: "principiante",
      duration_min: 6,
      thumb_emoji: "📊",
      hook: "Se le spese essenziali si mangiano oltre il 70% del reddito, non hai spazio per respirare. Ecco come riportarle in una fascia sana senza rinunce dolorose.",
      personalization: [
        { key: "essentials_share", q: "Che percentuale del reddito credi vada in spese essenziali (casa, cibo, bollette, trasporti)?", options: ["Meno del 50%", "Tra 50% e 70%", "Tra 70% e 85%", "Oltre 85%"] },
        { key: "top_pain", q: "Su quale categoria pensi di poter agire di più?", options: ["Alimentari e ristoranti", "Abbonamenti e servizi", "Trasporti", "Casa e utenze", "Shopping"] },
      ],
      chapters: [
        {
          teach: "Le spese si dividono in essenziali (non puoi eliminarle: casa, cibo base, bollette, trasporti per lavoro) e discrezionali (puoi ridurle: svago, shopping, ristoranti). La soglia sana per gli essenziali è sotto il 50% del reddito netto.",
          quiz: {
            q: "Qual è la soglia consigliata di spese essenziali sul reddito netto?",
            a: ["50%", "70%", "90%"],
            correct: 0,
            explanation: "Sotto il 50% (la regola 50/30/20) resti flessibile. Sopra il 70% ogni imprevisto diventa un problema serio.",
          },
        },
        {
          teach: "Il modo più veloce per rimettere ordine è la 'settimana di audit': segna ogni uscita per 7 giorni, poi raggruppa per macro-categoria. Sorprenderà quali voci pesano davvero — di solito non sono quelle a cui pensiamo per prime.",
          quiz: {
            q: "Da dove è più utile iniziare per ridurre le spese?",
            a: ["Tagliando il caffè al bar ogni mattina", "Raggruppando le spese per categoria e attaccando le 3 più grandi", "Facendo un budget rigido su ogni singola voce"],
            correct: 1,
            explanation: "Il 20% delle categorie fa il 80% del totale. Attaccare le 3 voci più grandi produce risultati veri; contare i caffè demoralizza e basta.",
          },
        },
        {
          teach: "Gli abbonamenti sono la trappola invisibile: piccoli, ricorrenti, dimenticati. Fai una revisione trimestrale — di solito 2-3 sono da cancellare e valgono già il tuo primo obiettivo mensile di risparmio.",
          quiz: {
            q: "Qual è una buona pratica per gestire le spese ricorrenti?",
            a: ["Fidarsi degli addebiti automatici, sono comodi", "Fare un audit trimestrale degli abbonamenti attivi", "Ignorare quelli sotto i €10/mese"],
            correct: 1,
            explanation: "Anche gli abbonamenti piccoli sommati fanno differenza: un audit ogni 3 mesi tiene la lista pulita.",
          },
        },
      ],
      action_plan: (p) => {
        const target = p?.top_pain || "la voce più grande";
        return [
          `Fai un audit di 7 giorni: segna ogni uscita in una nota sul telefono.`,
          `Attacca ${target}: fissa un tetto mensile e usa un metodo di tracking (es. carta dedicata).`,
          "Cancella almeno 2 abbonamenti che non hai usato nell'ultimo mese.",
        ];
      },
      wrap_up: (p) => {
        const share = p?.essentials_share;
        if (share === "Oltre 85%") return "Sei in zona critica: quasi tutto il reddito è impegnato. Il primo intervento non è tagliare piccole spese, ma rivedere le voci grandi (casa, auto, utenze). Anche uno spostamento del 5% cambia il quadro.";
        if (share === "Tra 70% e 85%") return "Sei in fascia stretta ma non compromessa. Un mese di audit + taglio di 2-3 abbonamenti superflui ti può portare sotto il 70% senza rinunce dolorose.";
        if (share === "Tra 50% e 70%") return "Sei in fascia sostenibile. Il lavoro qui è di ottimizzazione, non di sopravvivenza: sposta il risparmiato verso obiettivi con nome (fondo casa, viaggio, pensione).";
        return "Ottimo controllo delle spese essenziali. Il tuo tema è più su come allocare bene la fascia discrezionale — non frugale, ma consapevole.";
      },
    },

    debt_management: {
      id: "debt-101",
      title: "Gestire il debito buono e quello cattivo",
      difficulty: "intermedio",
      duration_min: 7,
      thumb_emoji: "💳",
      hook: "Non tutti i debiti sono uguali. Un mutuo a tasso ragionevole è uno strumento; una carta revolving al 20% è una trappola. Impara a distinguere e a decidere cosa estinguere per primo.",
      personalization: [
        { key: "debt_share", q: "Che quota del tuo reddito netto va in rate di finanziamenti (mutui, prestiti, rate auto)?", options: ["Zero", "Meno del 15%", "Tra 15% e 33%", "Oltre il 33%"] },
        { key: "debt_type", q: "Che tipo di debiti hai principalmente?", options: ["Solo mutuo casa", "Prestiti al consumo o rate finanziate", "Uso carta revolving / scoperto", "Nessuno"] },
      ],
      chapters: [
        {
          teach: "Debito 'buono' finanzia qualcosa che genera valore o dura nel tempo (casa, studi) a tassi bassi. Debito 'cattivo' finanzia consumo (vacanze, elettronica) a tassi alti. La distinzione non è morale, è finanziaria: dipende da uso, tasso e durata.",
          quiz: {
            q: "Cosa distingue un debito 'buono' da uno 'cattivo'?",
            a: ["Il fatto che serva a comprare qualcosa di grande", "Uso, tasso di interesse e durata rispetto al valore acquistato", "L'importo totale del prestito"],
            correct: 1,
            explanation: "Un mutuo a 2% su una casa che userai 30 anni è diverso da un finanziamento al 12% per un TV: stesso 'debito', economia opposta.",
          },
        },
        {
          teach: "La regola del 33%: il totale delle rate di finanziamento non dovrebbe superare il 33% del reddito netto. Sopra il 40% sei in zona di stress finanziario e ogni imprevisto diventa un problema.",
          quiz: {
            q: "Qual è la soglia massima raccomandata per il totale rate/reddito netto?",
            a: ["33%", "50%", "70%"],
            correct: 0,
            explanation: "33% è la soglia di sicurezza (regola bancaria classica). Sopra i tuoi margini di manovra si riducono drasticamente.",
          },
        },
        {
          teach: "TAEG vs TAN: il TAN è il tasso di interesse puro, il TAEG include tutte le spese (istruttoria, assicurazioni, commissioni) e rappresenta il costo reale annuo. Quando confronti due offerte, guarda SEMPRE il TAEG.",
          quiz: {
            q: "Quale numero devi confrontare per capire il costo reale di un finanziamento?",
            a: ["Il TAN (tasso nominale)", "Il TAEG (tasso effettivo globale)", "La rata mensile"],
            correct: 1,
            explanation: "Il TAEG include interessi + spese + assicurazioni obbligatorie. Due prestiti con TAN uguale possono avere TAEG molto diversi.",
          },
        },
      ],
      action_plan: (p) => {
        const type = p?.debt_type;
        const first = type === "Uso carta revolving / scoperto" ? "Chiudi subito il revolving: rimborsa a saldo mensile ed estingui l'esposizione con priorità assoluta." :
                     type === "Prestiti al consumo o rate finanziate" ? "Elenca tutti i finanziamenti attivi con TAEG di ciascuno: attacca prima quello con TAEG più alto." :
                     type === "Solo mutuo casa" ? "Verifica se conviene la surroga: bastano 5 minuti online per confrontare la tua rata attuale con le offerte di mercato." :
                     "Ottimo: mantieni lo stato attuale e reindirizza il flusso verso risparmio e investimenti di lungo periodo.";
        return [
          "Fai un elenco preciso: ogni finanziamento, con TAEG, rata, capitale residuo e mesi mancanti.",
          first,
          "Calcola la tua rata/reddito attuale: se sopra 33%, valuta consolidamento o rinegoziazione.",
        ];
      },
      wrap_up: (p) => {
        const share = p?.debt_share;
        if (share === "Oltre il 33%") return "Sei sopra la soglia di sicurezza: qui il debito riduce la tua libertà finanziaria. Priorità 1: elimina i debiti con TAEG più alto (spesso carte revolving e prestiti al consumo). Valuta un consolidamento se hai 2+ finanziamenti aperti.";
        if (share === "Tra 15% e 33%") return "Sei in fascia gestibile ma non c'è molto margine per imprevisti. Concentrati su estinguere i debiti a TAEG più alto e a non accendere nuovi finanziamenti superflui.";
        if (share === "Meno del 15%") return "Ottimo controllo del debito. Puoi permetterti di guardare il costo (TAEG) più che la rata, e valutare surroghe se hai un mutuo aperto.";
        return "Nessun debito attivo: sei nella posizione più libera. Il rischio adesso è aprire un finanziamento superfluo. Regola d'oro: solo se il TAEG è ragionevole E lo vale davvero.";
      },
    },

    income_stability: {
      id: "income-101",
      title: "Rendere più stabile il reddito",
      difficulty: "intermedio",
      duration_min: 7,
      thumb_emoji: "📈",
      hook: "Un reddito è tanto solido quanto la sua fonte. Se dipende da una sola azienda, un solo cliente, o un solo mercato, un singolo cambio di rotta può azzerarlo. La stabilità si costruisce.",
      personalization: [
        { key: "income_type", q: "Da dove arriva principalmente il tuo reddito?", options: ["Stipendio dipendente unico", "Freelance / partita IVA", "Più fonti (dipendente + extra)", "Impresa / attività propria"] },
        { key: "volatility", q: "Quanto oscilla il tuo reddito da mese a mese?", options: ["Praticamente stabile", "Piccole variazioni (±10%)", "Oscillazioni marcate (±30%)", "Molto volatile"] },
      ],
      chapters: [
        {
          teach: "Diversificare le entrate significa non dipendere da un'unica fonte. Anche un dipendente può aggiungere un'attività secondaria, competenze monetizzabili o rendite passive. L'obiettivo minimo: se sparisce la fonte principale, ne resta almeno un'altra che copre le spese essenziali.",
          quiz: {
            q: "Qual è il rischio maggiore di dipendere da un'unica fonte di reddito?",
            a: ["Pagare più tasse", "Perdere tutto il reddito in caso di crisi di quella fonte", "Non avere tempo libero"],
            correct: 1,
            explanation: "La 'diversificazione delle entrate' riduce il rischio di rimanere improvvisamente a reddito zero. Non serve un secondo stipendio: basta iniziare.",
          },
        },
        {
          teach: "Il fondo cuscinetto è il ponte tra un lavoro e il successivo. Chi ha entrate variabili (freelance, provvigioni) dovrebbe mantenere una riserva di 6-12 mesi di spese essenziali — molto oltre il 'classico' fondo di emergenza da dipendente.",
          quiz: {
            q: "Quanto dovrebbe essere il fondo cuscinetto di un freelance o partita IVA?",
            a: ["1-2 mesi di spese", "3 mesi bastano", "6-12 mesi di spese essenziali"],
            correct: 2,
            explanation: "Chi non ha stipendio fisso ha bisogno di una riserva più ampia: 6-12 mesi permettono di attraversare i buchi di lavoro senza svendersi.",
          },
        },
        {
          teach: "Concentrazione clienti: se un solo cliente pesa oltre il 40% del tuo fatturato, sei esposto. Regola sana da freelance: nessun cliente sopra il 30-35% del totale, altrimenti la sua uscita ti spacca l'anno.",
          quiz: {
            q: "Qual è la soglia oltre cui un singolo cliente diventa un rischio serio per un freelance?",
            a: ["Oltre il 20% del fatturato", "Oltre il 40% del fatturato", "Non c'è una soglia, dipende dal cliente"],
            correct: 1,
            explanation: "Oltre il 40% del fatturato su un solo cliente, la sua uscita improvvisa può azzerare la tua sostenibilità economica per mesi.",
          },
        },
      ],
      action_plan: (p) => {
        const type = p?.income_type;
        const primary = type === "Freelance / partita IVA" ? "Mappa i clienti per % di fatturato e verifica se qualcuno supera il 35%: pianifica di ridurre la dipendenza." :
                       type === "Stipendio dipendente unico" ? "Identifica una competenza monetizzabile fuori dal tuo lavoro (consulenze, corsi, freelance) e testala con un primo piccolo incarico." :
                       type === "Impresa / attività propria" ? "Diversifica i canali di ricavo: aggiungi almeno una linea prodotto/servizio con margini e ciclicità diverse da quella principale." :
                       "Ottimizza le fonti attuali: definisci quali far crescere e quali disattivare per liberare tempo.";
        return [
          "Calcola quanti mesi di spese essenziali copre oggi la tua riserva liquida.",
          primary,
          "Definisci una soglia minima mensile 'di sicurezza' sotto la quale attivi automatismi di contenimento spese.",
        ];
      },
      wrap_up: (p) => {
        const vol = p?.volatility;
        if (vol === "Molto volatile") return "Reddito molto instabile: la priorità è un fondo cuscinetto ampio (9-12 mesi di essenziali) e una diversificazione reale delle entrate. Ragiona a media semestrale, non mensile.";
        if (vol === "Oscillazioni marcate (±30%)") return "Le oscillazioni ci sono ma sono gestibili con un buffer da 6 mesi e una pianificazione mensile 'a media', non 'a picchi'. Attenzione ai mesi grassi: sono quelli in cui si commettono errori.";
        if (vol === "Piccole variazioni (±10%)") return "Situazione solida ma non blindata. Un buffer da 3-4 mesi e almeno una fonte secondaria in sviluppo rendono il sistema più resistente.";
        return "Reddito molto stabile: goditi la prevedibilità, ma non farti cullare. Basta una ristrutturazione aziendale per ribaltare il quadro. Costruisci ora la diversificazione, mentre non serve.";
      },
    },
  },
  en: {
    emergency_fund: {
      id: "emergency-fund-101",
      title: "Build an emergency fund",
      difficulty: "beginner",
      duration_min: 6,
      thumb_emoji: "🛡️",
      hook: "A single surprise — a broken car, a month without income — can derail even a well-run budget. The emergency fund is your personal safety net.",
      personalization: [
        { key: "current_reserve", q: "How much liquid reserve do you have today?", options: ["Zero or almost", "Less than 1 month of expenses", "1-3 months", "More than 3 months"] },
        { key: "monthly_expenses", q: "Roughly, what do you spend per month on essentials only (housing, food, bills)?", options: ["Under $/€800", "$/€800-1,500", "$/€1,500-2,500", "Over $/€2,500"] },
      ],
      chapters: [
        {
          teach: "An emergency fund is a cash reserve (not invested) covering essential expenses during the unexpected: job loss, medical bills, urgent repairs. It's not an investment: it's insurance.",
          quiz: {
            q: "What's the main purpose of an emergency fund?",
            a: ["Grow it as much as possible", "Cover the unexpected without going into debt", "Pay for vacations"],
            correct: 1,
            explanation: "It stops you from resorting to expensive debt (revolving cards, consumer loans) when life surprises you.",
          },
        },
        {
          teach: "The common rule is 3-6 months of essential expenses. Variable-income earners (freelancers, seasonal workers) aim for 6-12; very stable salaried workers can start at 3.",
          quiz: {
            q: "How many months of essentials should a typical emergency fund cover?",
            a: ["1 month", "3-6 months", "12 months always"],
            correct: 1,
            explanation: "3-6 months is the standard band. It gives you reasonable time to reorganize without rushing.",
          },
        },
        {
          teach: "Where to keep it? A separate liquid account (savings account) — immediately accessible. Not stocks or ETFs: the value must be predictable when you actually need it.",
          quiz: {
            q: "Where's the best place to keep the emergency fund?",
            a: ["In stock ETFs to grow it", "In a liquid savings account", "In cash at home"],
            correct: 1,
            explanation: "A savings account earns a small interest but stays instantly accessible — the right home for emergency cash.",
          },
        },
      ],
      action_plan: (p) => {
        const exp = p?.monthly_expenses;
        const target = exp === "Under $/€800" ? "$/€2,400" : exp === "$/€800-1,500" ? "$/€4,500" : exp === "$/€1,500-2,500" ? "$/€7,500" : "$/€10,000+";
        return [
          `Set your target: aim for ${target} (about 3 months of your essentials).`,
          "Open a separate savings account (5 minutes online).",
          "Set a monthly automatic transfer — even $/€50 is a concrete start.",
        ];
      },
      wrap_up: (p) => {
        const reserve = p?.current_reserve;
        if (reserve === "Zero or almost") return "You're at zero, and knowing your starting line is perfect. Focus on the first $/€500: it's the psychological threshold that changes everything. After that, automate and forget.";
        if (reserve === "Less than 1 month of expenses") return "You've started the machine. The real leap is reaching 3 months: from there, you'll sleep differently. Small automatic transfer and a few heads-down months.";
        if (reserve === "1-3 months") return "Great foundation. Now aim for 6 months if your income varies, otherwise redirect the surplus toward long-term investing.";
        return "You're in the safe zone. Confirm they're actually liquid (not invested) and consider redirecting the excess to long-term goals.";
      },
    },

    savings_rate: {
      id: "savings-101",
      title: "Increase your savings rate",
      difficulty: "beginner",
      duration_min: 6,
      thumb_emoji: "💰",
      hook: "It's not how much you earn — it's how much you keep. Even $/€100 a month today turns into over $/€12,000 in 10 years, no heroics required.",
      personalization: [
        { key: "current_savings", q: "How much of your net income are you saving now?", options: ["Zero (or less)", "Less than 10%", "Between 10% and 20%", "More than 20%"] },
        { key: "goal", q: "What's your main goal?", options: ["Emergency fund", "Buy a home", "A big trip", "Retirement top-up", "Not decided yet"] },
      ],
      chapters: [
        {
          teach: "Savings rate is the share of net income you don't spend. Reference bands: under 10% = under-protected, 10-20% = sustainable, over 20% = solid. Every extra point today shortens the years to your goals.",
          quiz: {
            q: "What's the minimum recommended range for a healthy savings rate?",
            a: ["1-5%", "10-20%", "50%"],
            correct: 1,
            explanation: "10-20% is considered the minimum to build reserves and start investing without extreme sacrifice.",
          },
        },
        {
          teach: "The 50/30/20 rule splits net income into: 50% needs (housing, food, bills), 30% wants (leisure, shopping), 20% savings and debt reduction. A compass, not a cage — adapt it to your reality.",
          quiz: {
            q: "Under 50/30/20, if you earn $/€2,000 net, how much should go to savings?",
            a: ["$/€100", "$/€300", "$/€400"],
            correct: 2,
            explanation: "20% of $/€2,000 = $/€400. A target, not a mandate: if you're below, start at 10% and ramp up.",
          },
        },
        {
          teach: "The trick is automation. If you wait till month-end to save 'what's left', not much will be left. Move the saving share the moment your paycheck arrives — into a separate account.",
          quiz: {
            q: "When's the best time to make the savings transfer?",
            a: ["End of month, with what's left", "As soon as payday hits, automatically", "Only if something's left after expenses"],
            correct: 1,
            explanation: "Pay yourself first: automatic saving at the start of the month is the single most powerful habit to raise your savings rate.",
          },
        },
      ],
      action_plan: (p) => {
        const cur = p?.current_savings;
        const target = cur === "Zero (or less)" ? "5%" : cur === "Less than 10%" ? "10%" : cur === "Between 10% and 20%" ? "20%" : "25%";
        return [
          `Set an automatic monthly transfer of ${target} of your paycheck, on the day it lands.`,
          "Review active subscriptions: cancel anything unused in the last 30 days.",
          "Name your goal with a number (e.g. 'House fund $/€5,000') and open a dedicated account.",
        ];
      },
      wrap_up: (p) => {
        const cur = p?.current_savings;
        const goal = p?.goal || "your goal";
        if (cur === "Zero (or less)") return `Starting from zero is the hardest part — after one month of automation it becomes invisible. Target 5% now, then climb. With "${goal}" ahead, each transfer has real meaning.`;
        if (cur === "Less than 10%") return `You have the mechanism, you're missing a gear. Bring it to 10% this month, then 15% in 90 days. "${goal}" wants repeated steps, not heroic jumps.`;
        if (cur === "Between 10% and 20%") return `You're in the sustainable band. The next leap is mental: move from 'how much I save' to 'where I allocate'. With "${goal}" on the agenda, consider a dedicated named account.`;
        return `Above the average. Now it's optimization: liquid slice for emergencies, planned slice for "${goal}", long-term slice invested.`;
      },
    },

    expense_ratio: {
      id: "expense-101",
      title: "Rebalance your expenses",
      difficulty: "beginner",
      duration_min: 6,
      thumb_emoji: "📊",
      hook: "If essential expenses eat over 70% of your income, you have no room to breathe. Here's how to bring them back into a healthy band without painful sacrifices.",
      personalization: [
        { key: "essentials_share", q: "What share of your income do you think goes to essentials (housing, food, bills, transport)?", options: ["Less than 50%", "Between 50% and 70%", "Between 70% and 85%", "Over 85%"] },
        { key: "top_pain", q: "Which category do you think you can act on the most?", options: ["Groceries and restaurants", "Subscriptions and services", "Transport", "Housing and utilities", "Shopping"] },
      ],
      chapters: [
        {
          teach: "Expenses split into essential (can't be eliminated: housing, basic food, bills, work transport) and discretionary (can be reduced: leisure, shopping, restaurants). The healthy threshold for essentials is under 50% of net income.",
          quiz: {
            q: "What's the recommended threshold for essentials over net income?",
            a: ["50%", "70%", "90%"],
            correct: 0,
            explanation: "Under 50% (the 50/30/20 rule) keeps you flexible. Above 70% every surprise becomes a serious problem.",
          },
        },
        {
          teach: "The fastest way to sort things out is the 'audit week': log every outflow for 7 days, then group by macro-category. You'll be surprised which items really weigh — usually not the ones we think first.",
          quiz: {
            q: "Where's the most useful place to start cutting expenses?",
            a: ["Skipping the morning coffee", "Grouping expenses by category and attacking the top 3", "Setting a rigid budget on every single line"],
            correct: 1,
            explanation: "20% of categories make 80% of the total. Attacking the top 3 produces real results; counting coffees just demoralizes.",
          },
        },
        {
          teach: "Subscriptions are the invisible trap: small, recurring, forgotten. Do a quarterly audit — usually 2-3 need canceling and they alone cover your first monthly savings goal.",
          quiz: {
            q: "What's a good practice for recurring expenses?",
            a: ["Trust automatic charges, they're convenient", "Do a quarterly audit of active subscriptions", "Ignore ones under $/€10/month"],
            correct: 1,
            explanation: "Even small subscriptions add up: a quarterly audit keeps the list clean.",
          },
        },
      ],
      action_plan: (p) => {
        const target = p?.top_pain || "your biggest line";
        return [
          "Run a 7-day audit: log every outflow in a phone note.",
          `Attack ${target}: set a monthly ceiling and use a tracking method (e.g. a dedicated card).`,
          "Cancel at least 2 subscriptions you haven't used in the last month.",
        ];
      },
      wrap_up: (p) => {
        const share = p?.essentials_share;
        if (share === "Over 85%") return "Critical zone: almost all income is committed. The first move isn't cutting small expenses, but revisiting big items (housing, car, utilities). Even a 5% shift changes the picture.";
        if (share === "Between 70% and 85%") return "Tight band but not compromised. A month of audit + cutting 2-3 unnecessary subscriptions can push you under 70% without painful sacrifices.";
        if (share === "Between 50% and 70%") return "Sustainable band. The work here is optimization, not survival: move the saved slice toward named goals (house fund, trip, retirement).";
        return "Excellent control of essentials. Your topic is how to allocate the discretionary slice well — not frugal, but conscious.";
      },
    },

    debt_management: {
      id: "debt-101",
      title: "Manage good debt and bad debt",
      difficulty: "intermediate",
      duration_min: 7,
      thumb_emoji: "💳",
      hook: "Not all debt is equal. A reasonable-rate mortgage is a tool; a 20% revolving card is a trap. Learn to tell them apart and decide what to pay off first.",
      personalization: [
        { key: "debt_share", q: "What share of your net income goes to loan installments (mortgage, loans, car payments)?", options: ["Zero", "Under 15%", "Between 15% and 33%", "Over 33%"] },
        { key: "debt_type", q: "What kind of debt do you mainly have?", options: ["Only home mortgage", "Consumer loans or financed installments", "Revolving card / overdraft", "None"] },
      ],
      chapters: [
        {
          teach: "'Good' debt funds something that generates value or lasts (home, education) at low rates. 'Bad' debt funds consumption (vacations, electronics) at high rates. It's not moral: it depends on use, rate and duration.",
          quiz: {
            q: "What distinguishes 'good' from 'bad' debt?",
            a: ["Whether it buys something big", "Use, interest rate and duration vs the value purchased", "The total loan amount"],
            correct: 1,
            explanation: "A 2% mortgage on a house you'll use 30 years is different from a 12% loan for a TV: same 'debt', opposite economics.",
          },
        },
        {
          teach: "The 33% rule: total loan installments shouldn't exceed 33% of net income. Over 40% you're in financial stress and every surprise becomes a problem.",
          quiz: {
            q: "What's the max recommended installments-to-net-income ratio?",
            a: ["33%", "50%", "70%"],
            correct: 0,
            explanation: "33% is the classic banking safety threshold. Above, your maneuvering room shrinks dramatically.",
          },
        },
        {
          teach: "APR vs nominal rate: the nominal is pure interest, the APR includes all fees (origination, insurance, commissions) and represents the true annual cost. When comparing offers, ALWAYS look at the APR.",
          quiz: {
            q: "Which number should you compare to know the real cost of a loan?",
            a: ["The nominal rate", "The APR (annual percentage rate)", "The monthly installment"],
            correct: 1,
            explanation: "APR includes interest + fees + mandatory insurance. Two loans with the same nominal rate can have very different APRs.",
          },
        },
      ],
      action_plan: (p) => {
        const type = p?.debt_type;
        const first = type === "Revolving card / overdraft" ? "Close the revolving immediately: switch to full monthly payoff and eliminate the exposure as top priority." :
                     type === "Consumer loans or financed installments" ? "List every active loan with its APR: attack the highest-APR one first." :
                     type === "Only home mortgage" ? "Check if refinancing pays off: 5 minutes online to compare your current installment with market offers." :
                     "Great: keep the current state and redirect the flow to savings and long-term investing.";
        return [
          "Make a precise list: every loan with APR, installment, residual capital and months to go.",
          first,
          "Compute your current installments/income ratio: if above 33%, consider consolidation or renegotiation.",
        ];
      },
      wrap_up: (p) => {
        const share = p?.debt_share;
        if (share === "Over 33%") return "You're above the safety threshold: debt is limiting your financial freedom. Priority 1: eliminate the highest-APR debts (usually revolving cards and consumer loans). Consider consolidation if you have 2+ open loans.";
        if (share === "Between 15% and 33%") return "Manageable band but little room for surprises. Focus on paying off the highest-APR debts and don't open unnecessary new loans.";
        if (share === "Under 15%") return "Great debt control. You can afford to look at cost (APR) more than installment, and consider refinancing an open mortgage.";
        return "No active debt: you're in the most free position. The risk now is taking on an unnecessary loan. Golden rule: only if the APR is reasonable AND it's truly worth it.";
      },
    },

    income_stability: {
      id: "income-101",
      title: "Make your income more stable",
      difficulty: "intermediate",
      duration_min: 7,
      thumb_emoji: "📈",
      hook: "Income is only as solid as its source. If it depends on one company, one client, one market — a single change can zero it. Stability is built.",
      personalization: [
        { key: "income_type", q: "Where does your income mainly come from?", options: ["Single salaried job", "Freelance / self-employed", "Multiple sources (job + side)", "Own business"] },
        { key: "volatility", q: "How much does your income swing month to month?", options: ["Basically stable", "Small variations (±10%)", "Marked swings (±30%)", "Very volatile"] },
      ],
      chapters: [
        {
          teach: "Diversifying income means not depending on a single source. Even a salaried worker can add a side activity, monetizable skills, or basic passive income. Minimum goal: if the main source disappears, at least one other still covers essentials.",
          quiz: {
            q: "What's the biggest risk of depending on a single income source?",
            a: ["Paying more taxes", "Losing all your income if that source crashes", "Less free time"],
            correct: 1,
            explanation: "'Income diversification' reduces the risk of suddenly ending up at zero. You don't need a second salary: just start.",
          },
        },
        {
          teach: "The buffer fund is the bridge between one job and the next. Variable earners (freelance, commissions) should keep 6-12 months of essentials — well beyond the 'classic' emergency fund for salaried workers.",
          quiz: {
            q: "How big should the buffer fund be for a freelancer?",
            a: ["1-2 months of expenses", "3 months is enough", "6-12 months of essentials"],
            correct: 2,
            explanation: "Without a fixed salary you need a bigger reserve: 6-12 months let you ride out work gaps without underselling yourself.",
          },
        },
        {
          teach: "Client concentration: if one client accounts for over 40% of your revenue, you're exposed. Healthy freelance rule: no client over 30-35% of the total, otherwise their exit breaks your year.",
          quiz: {
            q: "What's the threshold beyond which a single client becomes a serious risk for a freelancer?",
            a: ["Over 20% of revenue", "Over 40% of revenue", "There's no threshold, depends on the client"],
            correct: 1,
            explanation: "Beyond 40% of revenue on a single client, their sudden exit can zero your economic sustainability for months.",
          },
        },
      ],
      action_plan: (p) => {
        const type = p?.income_type;
        const primary = type === "Freelance / self-employed" ? "Map clients by revenue %: check if anyone exceeds 35% and plan to reduce that dependence." :
                       type === "Single salaried job" ? "Identify a monetizable skill outside your job (consulting, courses, freelance) and test it with a first small gig." :
                       type === "Own business" ? "Diversify revenue streams: add at least one product/service line with different margins and cycles from the main one." :
                       "Optimize current sources: decide which to grow and which to shut down to free up time.";
        return [
          "Compute how many months of essentials your liquid reserve covers today.",
          primary,
          "Define a monthly 'safety floor' below which you trigger automatic spending-containment.",
        ];
      },
      wrap_up: (p) => {
        const vol = p?.volatility;
        if (vol === "Very volatile") return "Very unstable income: priority is a large buffer (9-12 months of essentials) and real income diversification. Think in half-year averages, not monthly.";
        if (vol === "Marked swings (±30%)") return "Swings exist but are manageable with a 6-month buffer and monthly 'average-based' planning, not 'peak-based'. Watch the fat months: that's when mistakes happen.";
        if (vol === "Small variations (±10%)") return "Solid but not bulletproof. A 3-4 month buffer and at least one secondary source in development make the system more resilient.";
        return "Very stable income: enjoy the predictability, but don't get lulled. A single company restructuring can flip the picture. Build diversification now, while you don't need it.";
      },
    },
  }
};

// Lookup pubblico: consente al chat/UI di recuperare la lezione completa
// dato solo un id (o un partial { id }) — usato per aprire il wizard con
// contenuti ricchi anche quando l'API restituisce solo l'id.
export function getLessonById(id, lang) {
  if (!id) return null;
  const l = lang || getLang();
  const bank = LESSON_BANK[l] || LESSON_BANK.it;
  // match diretto per chiave (key) o per id-lesson
  for (const key of Object.keys(bank)) {
    if (key === id || bank[key].id === id) return bank[key];
  }
  return null;
}

function fallback(analysis, lang) {
  const { score, breakdown } = computeScore(analysis);
  const bank = LESSON_BANK[lang] || LESSON_BANK.it;
  // trova 2 aree deboli reali
  const sorted = Object.entries(breakdown).sort((a, b) => a[1] - b[1]);
  const weakAreas = sorted.slice(0, 2).map(([key, sc]) => ({
    key, score: sc,
    why: lang === "en"
      ? { emergency_fund: "No savings transfers detected in the period.", savings_rate: "You're saving less than 20% of income.", expense_ratio: "Essential expenses consume most of your income.", debt_management: "Debt-to-income ratio is above the healthy 33% threshold.", income_stability: "Net position too close to zero."}[key]
      : { emergency_fund: "Nessun bonifico verso risparmi rilevato.", savings_rate: "Stai risparmiando meno del 20% del reddito.", expense_ratio: "Le spese essenziali consumano gran parte del reddito.", debt_management: "Il debito supera la soglia salutare del 33% del reddito.", income_stability: "Il netto è troppo vicino a zero."}[key]
  }));
  const lessons = weakAreas.map(w => bank[w.key]).filter(Boolean);
  const best = sorted[sorted.length - 1];
  const worst = sorted[0];
  const interp = lang === "en"
    ? `Score ${score}/100. Strength: ${best[0].replace(/_/g," ")} (${best[1]}). To improve: ${worst[0].replace(/_/g," ")} (${worst[1]}).`
    : `Punteggio ${score}/100. Punto forte: ${best[0].replace(/_/g," ")} (${best[1]}). Da migliorare: ${worst[0].replace(/_/g," ")} (${worst[1]}).`;
  return {
    score, score_breakdown: breakdown, interpretation: interp,
    weak_areas: weakAreas, mini_lessons: lessons.length ? lessons : [bank.savings_rate],
    disclaimer: lang === "en" ? "Educational content, not advice." : "Contenuto educativo, non consulenza.",
  };
}

export async function runAdvisor({ analysis, simulation, history = {} }) {
  const lang = getLang();
  if (isMock()) {
    await new Promise(r => setTimeout(r, 700 + Math.random() * 600));
    return fallback(analysis, lang);
  }
  const system = await loadSystemPrompt("ADVISOR_AGENT.md");
  // compressione: solo totali + top 5 categorie (evita truncation su max_tokens)
  const topCats = Object.entries(analysis?.categories || {})
    .sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
    .slice(0, 6)
    .reduce((o, [k, v]) => (o[k] = { total: v.total, pct: v.pct_of_expenses }, o), {});
  const summary = { totals: analysis?.totals, top_categories: topCats, anomalies: analysis?.anomalies?.slice(0, 3) };
  const simSummary = (simulation?.scenarios || []).slice(0, 3).map(s => ({ title: s.title, monthly: s.delta_monthly }));
  const user = [
    `Lingua utente: ${lang}. Rispondi nella lingua utente.`,
    `Sintesi analisi: ${JSON.stringify(summary)}`,
    `Scenari disponibili: ${JSON.stringify(simSummary)}`,
    `Storico utente: ${JSON.stringify(history)}`,
    `Restituisci SOLO JSON conforme allo schema. NON suggerire prodotti finanziari o titoli.`,
  ].join("\n\n");
  try {
    const { json } = await callAgent({
      agent: "advisor", systemPrompt: system, userMessage: user,
      tier: "smart", maxTokens: 2500, timeoutMs: 30000, retries: 1,
      mockResponse: MOCK,
    });
    if (typeof json?.score === "number") return json;
    throw new Error("no score");
  } catch {
    return fallback(analysis, lang);
  }
}

// ---------- Mock answer bank (used when no API key / mock=1) ----------
// Each entry: { keywords, it, en, lesson? }. First match wins; empty keywords = fallback.
const MOCK_ANSWERS = [
  {
    keywords: ["ciao", "salve", "buongiorno", "buonasera", "hey", "hello", "hi ", "hi,", "hi!"],
    it: "Ciao! Sono il tuo consulente educativo. Posso spiegarti termini finanziari, aiutarti a leggere l'estratto conto, o proporti mini-lezioni sui temi che ti interessano. Da dove vuoi partire?",
    en: "Hi! I'm your educational advisor. I can explain financial terms, help you read your bank statement, or suggest mini-lessons on topics you care about. Where would you like to start?",
  },
  {
    keywords: ["taeg", "apr", "tasso annuo effettivo"],
    it: "Il TAEG (Tasso Annuo Effettivo Globale) è il costo reale annuo di un finanziamento: include gli interessi ma anche spese di istruttoria, commissioni e assicurazioni obbligatorie. È il numero più utile per confrontare offerte diverse, molto più del TAN. Se vuoi, ti mostro come si legge in un contratto tipo.",
    en: "APR (Annual Percentage Rate) is the real yearly cost of a loan: it includes interest plus origination fees, commissions and mandatory insurance. It's the most useful number for comparing offers — far more than the nominal rate. I can walk you through how to read it in a typical contract if you want.",
  },
  {
    keywords: ["etf"],
    it: "Un ETF (Exchange Traded Fund) è un paniere di titoli scambiato in borsa come un'azione. Segue tipicamente un indice (es. MSCI World) e ha costi molto bassi rispetto ai fondi tradizionali. Non ti dico se comprarne uno, ma se vuoi capire come funziona la diversificazione o cosa significa TER, chiedimi pure.",
    en: "An ETF (Exchange Traded Fund) is a basket of securities traded on an exchange like a stock. It usually tracks an index (e.g. MSCI World) and has much lower fees than traditional funds. I won't tell you whether to buy one, but if you want to understand diversification or what TER means, just ask.",
  },
  {
    keywords: ["azion", "stock", "shares"],
    it: "Un'azione rappresenta una piccola quota di proprietà di un'azienda. Il suo valore sale o scende con le aspettative sul futuro dell'impresa, non necessariamente con i suoi risultati attuali. È uno strumento potenzialmente redditizio ma volatile: le oscillazioni fanno parte del gioco. Non do raccomandazioni su quali comprare.",
    en: "A stock represents a small ownership share in a company. Its price rises or falls with expectations about the company's future, not necessarily its current results. It's potentially rewarding but volatile: swings are part of the game. I don't give recommendations on which ones to buy.",
  },
  {
    keywords: ["investire", "invest", "obbligazi", "titoli", "bond"],
    it: "Non do consigli su cosa comprare, ma posso spiegarti come funzionano gli strumenti finanziari. Chiedimi 'cos'è un ETF', 'cos'è un'obbligazione', o 'cos'è la diversificazione' se vuoi capire meglio le opzioni disponibili prima di parlarne con un consulente vero.",
    en: "I don't give buy/sell advice, but I can explain how financial instruments work. Ask me 'what is an ETF', 'what is a bond', or 'what is diversification' if you want to understand the options before talking to a real advisor.",
  },
  {
    keywords: ["risparmi", "risparmiare", "save ", "saving", "risparmio"],
    it: "Per iniziare a risparmiare, il trucco è automatizzare: appena arriva lo stipendio, sposta una quota fissa (anche solo il 5-10%) su un conto separato. Così \"non lo vedi\" e non ti tenta. Poi rivedi le spese ricorrenti — spesso ci sono abbonamenti dimenticati che valgono da soli il tuo primo obiettivo mensile.",
    en: "To start saving, the trick is automation: as soon as your paycheck lands, move a fixed slice (even 5-10%) to a separate account. That way you \"don't see it\" and won't be tempted. Then review recurring expenses — often forgotten subscriptions alone cover your first monthly goal.",
    lesson: { id: "budget-basics", title: "Basi del budgeting" },
  },
  {
    keywords: ["mutuo", "mortgage", "rata"],
    it: "Il mutuo è un prestito garantito da un immobile, di solito a lunga scadenza (15-30 anni). Se è a tasso variabile, la rata cambia col variare dell'indice di riferimento (Euribor); se è a tasso fisso, la rata resta stabile ma di solito parte più alta. La cosa più utile da guardare è il TAEG, non il TAN.",
    en: "A mortgage is a loan secured by real estate, usually long-term (15-30 years). If it's variable-rate, the installment moves with the reference index (Euribor); if it's fixed-rate, the installment stays stable but usually starts higher. The most useful number to look at is the APR, not the nominal rate.",
  },
  {
    keywords: ["fondo di emergenza", "emergency fund", "fondo emergenza"],
    it: "Un fondo di emergenza è una riserva di liquidità, tipicamente pari a 3-6 mesi di spese essenziali, tenuta in un posto sicuro e facilmente accessibile (conto deposito, non investito). Serve per gestire imprevisti — perdita del lavoro, spese mediche, riparazioni — senza dover ricorrere a debito. È il primo pezzo di educazione finanziaria che consiglierei a chiunque.",
    en: "An emergency fund is a cash reserve, typically 3-6 months of essential expenses, kept somewhere safe and easily accessible (savings account, not invested). It's for handling the unexpected — job loss, medical bills, repairs — without resorting to debt. It's the first piece of financial education I'd suggest to anyone.",
    lesson: { id: "emergency-fund-101", title: "Costruire un fondo di emergenza" },
  },
  {
    keywords: ["debito", "debt", "prestito", "loan"],
    it: "Il debito non è né buono né cattivo in sé: dipende da cosa finanzia e a che costo. Un mutuo per la casa a tasso ragionevole può essere sostenibile; un prestito al consumo al 12% per una vacanza probabilmente no. Regola pratica: se le rate totali superano il 30-35% del reddito netto, sei in zona rischio.",
    en: "Debt is neither good nor bad in itself: it depends on what it funds and at what cost. A reasonable-rate mortgage can be sustainable; a 12% consumer loan for a vacation probably isn't. Rule of thumb: if total installments exceed 30-35% of net income, you're in the risk zone.",
  },
  {
    keywords: ["inflazione", "inflation"],
    it: "L'inflazione è la perdita di potere d'acquisto della moneta nel tempo: 100€ oggi comprano meno di quanto compravano un anno fa. Con un'inflazione al 3%, tenere i soldi fermi sul conto significa perdere il 3% reale ogni anno. Per questo si parla di \"far lavorare\" almeno la parte di risparmio non destinata al fondo di emergenza.",
    en: "Inflation is the loss of purchasing power of money over time: €100 today buys less than a year ago. With 3% inflation, keeping cash idle in a checking account means losing 3% in real terms every year. That's why people talk about \"putting money to work\" — at least the portion beyond the emergency fund.",
  },
  {
    keywords: ["tasse", "irpef", "tax", "fisco"],
    it: "Sul tema tasse posso spiegarti i concetti base (scaglioni IRPEF, deduzioni, detrazioni, no-tax area) ma per la tua dichiarazione specifica serve un commercialista o un CAF. La regola generale: paga le tasse dovute, ma sfrutta tutte le detrazioni cui hai diritto (spese sanitarie, ristrutturazioni, previdenza complementare).",
    en: "On taxes I can explain the basics (tax brackets, deductions, credits, tax-free thresholds) but for your specific return you'll want an accountant or a tax service. The general rule: pay what's owed, but claim every deduction you're entitled to (medical, home renovations, pension contributions).",
  },
  {
    keywords: ["carta di credito", "credit card", "revolving"],
    it: "La carta di credito è utile per gestire la liquidità e ha protezioni sui pagamenti, ma diventa pericolosa se usata in modalità \"revolving\": rimborsare solo la rata minima accumula interessi molto alti (spesso 15-25% annuo). Se puoi, imposta l'addebito a saldo mensile e usala come strumento di comodità, non di finanziamento.",
    en: "A credit card is useful for cash-flow smoothing and offers payment protections, but becomes dangerous in \"revolving\" mode: paying only the minimum accrues very high interest (often 15-25% per year). If you can, set it to pay in full monthly and use it as a convenience tool, not a financing tool.",
  },
  {
    keywords: ["pension", "pensione", "previdenza"],
    it: "In Italia la pensione pubblica sarà probabilmente più bassa dell'ultimo stipendio (tasso di sostituzione stimato tra 50% e 70% a seconda della carriera). Per questo si parla di \"secondo pilastro\" — previdenza complementare, fondi pensione — con vantaggi fiscali interessanti. Prima si inizia, meno peso hanno i versamenti mensili.",
    en: "In Italy the public pension will likely be lower than your last paycheck (replacement rate estimated between 50% and 70% depending on career). That's why people talk about the \"second pillar\" — supplementary pension funds — with attractive tax benefits. The earlier you start, the smaller the monthly contributions need to be.",
  },
  {
    keywords: ["conto corrente", "checking", "conto deposito"],
    it: "Il conto corrente serve per la gestione quotidiana: entrate, uscite, pagamenti. Non è il posto giusto per accumulare risparmi grandi (interessi quasi nulli, imposta di bollo). Un conto deposito, invece, rende un po' di più mantenendo la liquidità: buon compromesso per il fondo di emergenza.",
    en: "A checking account is for day-to-day management: income, bills, payments. It's not the right place to pile up big savings (near-zero interest, stamp duty). A savings account, on the other hand, yields a bit more while staying liquid: a good fit for an emergency fund.",
  },
  {
    keywords: ["budget", "bilancio", "50/30/20"],
    it: "Fare il budget non significa contare ogni caffè, ma capire dove vanno i soldi per macro-categorie. La regola più semplice è il 50/30/20: metà del reddito netto per necessità (casa, cibo, trasporti), 30% per desideri (svago, shopping), 20% per risparmio e riduzione debiti. È una bussola, non una gabbia.",
    en: "Budgeting doesn't mean counting every coffee — it's about knowing where money goes by macro-category. The simplest rule is 50/30/20: half of net income for needs (housing, food, transport), 30% for wants (leisure, shopping), 20% for savings and debt reduction. A compass, not a cage.",
    lesson: { id: "budget-basics", title: "Basi del budgeting" },
  },
  {
    keywords: ["diversifica", "diversif"],
    it: "Diversificare significa non concentrare tutto in un solo strumento, settore o area geografica: se una parte va male, le altre attutiscono il colpo. È il principio più antico della gestione del rischio. Un ETF su un indice globale è già di per sé molto diversificato — è per questo che è spesso il punto di partenza consigliato in educazione finanziaria.",
    en: "Diversifying means not concentrating everything in a single instrument, sector or region: if one part performs badly, the others cushion the blow. It's the oldest principle of risk management. A global-index ETF is already very diversified — that's why it's often the starting point in financial-education courses.",
  },
  // Fallback (empty keywords)
  {
    keywords: [],
    it: "Ottima domanda. Posso aiutarti meglio se mi dai un po' più di contesto: stai chiedendo di un termine specifico, di una tua spesa nell'estratto conto, o di come pianificare qualcosa? Prova a riformulare con una parola-chiave (es. \"mutuo\", \"risparmio\", \"ETF\") e ti risponderò più preciso.",
    en: "Great question. I can help you better with a bit more context: are you asking about a specific term, an expense on your statement, or how to plan something? Try rephrasing with a keyword (e.g. \"mortgage\", \"savings\", \"ETF\") and I'll be more precise.",
  },
];

function pickMockResponse(question, lang, history = []) {
  const q = String(question || "").toLowerCase();
  let match = MOCK_ANSWERS.find(a => a.keywords.length && a.keywords.some(k => q.includes(k)));
  const fallback = MOCK_ANSWERS[MOCK_ANSWERS.length - 1];
  if (!match) match = fallback;
  let answer = match[lang] || match.it;
  // Variation: if same keyword-topic was hit recently by the assistant, prefix with "Approfondiamo:"
  const recentAssistant = history.filter(m => m.role === "assistant").slice(-3);
  const alreadyGiven = recentAssistant.some(m => String(m.content || "").slice(0, 60) === answer.slice(0, 60));
  if (alreadyGiven) {
    const prefix = lang === "en" ? "Let's go deeper: " : "Approfondiamo: ";
    answer = prefix + answer;
  }
  const out = { answer, suggested_lesson: match.lesson || null };
  return out;
}

// Multi-turn conversational advisor: mantiene continuità.
// Signature: askAdvisor(question, { context, history })
export async function askAdvisor(question, opts = {}) {
  const lang = getLang();
  const context = opts.context || {};
  const history = Array.isArray(opts.history) ? opts.history : [];
  const baseSystem = await loadSystemPrompt("ADVISOR_AGENT.md").catch(() => "");
  const hasContext = context && Object.keys(context).length > 0;

  let contextSummary = "";
  if (hasContext) {
    const topCats = Object.entries(context?.categories || {})
      .sort((a, b) => Math.abs(b[1]?.total || 0) - Math.abs(a[1]?.total || 0))
      .slice(0, 5)
      .reduce((o, [k, v]) => (o[k] = { total: v.total, pct: v.pct_of_expenses }, o), {});
    contextSummary = `\n\nContesto utente (analisi caricata): totals=${JSON.stringify(context?.totals || {})}, top_categories=${JSON.stringify(topCats)}. Usa questi dati per rispondere in modo personalizzato quando pertinente.`;
  }

  const conversationalSystem = [
    baseSystem,
    "",
    lang === "en"
      ? "You are an educational financial advisor. Respond like a warm, knowledgeable person having a natural, continuous conversation — never as isolated Q&A. Remember prior turns and build on them. NEVER recommend specific investment products or securities — only educational concepts. If asked for product advice, explain the concept without recommending. Keep replies concise (2-5 sentences) unless the user asks for depth. When a topic warrants a deeper lesson, suggest one."
      : "Sei un consulente educativo finanziario. Rispondi come una persona esperta ma calda, in modo naturale e continuo con la conversazione — mai come Q&A isolate. Ricorda i turni precedenti e costruisci sopra. NON raccomandare mai prodotti d'investimento o titoli specifici — solo educazione. Se l'utente chiede consigli di prodotto, spiega il concetto senza raccomandare. Risposte concise (2-5 frasi) salvo richiesta di approfondimento. Se un tema merita una mini-lezione, proponila.",
    `Lingua utente: ${lang}. Rispondi sempre in questa lingua.`,
    'Restituisci SEMPRE e solo JSON: {"answer": "testo naturale conversazionale", "suggested_lesson": {"id":"...","title":"..."} | null}',
    contextSummary,
  ].join("\n");

  // capping storia a 12 turni
  const trimmed = history.slice(-12).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
  const messages = [...trimmed, { role: "user", content: question }];

  const mock = pickMockResponse(question, lang, history);

  // In mock mode: ritorna direttamente la risposta canned, niente callAgent (immune a errori di rete/proxy)
  if (isMock()) {
    await new Promise(r => setTimeout(r, 350 + Math.random() * 400));
    return mock;
  }

  try {
    const { json, text } = await callAgent({
      agent: "advisor-chat",
      systemPrompt: conversationalSystem,
      messages,
      tier: "fast", maxTokens: 700, timeoutMs: 25000, retries: 1,
      mockResponse: mock,
    });
    if (json?.answer) return json;
    if (text) return { answer: text, suggested_lesson: null };
    return mock;
  } catch (e) {
    console.warn("[askAdvisor] fallito, uso mock:", e);
    return mock; // preferisci mock (utile) a "non disponibile" (frustrante)
  }
}
