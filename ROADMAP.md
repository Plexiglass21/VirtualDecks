# VirtualDecks — Roadmap V1 approvata

**Aggiornata:** 10 novembre 2026  
**Versione codice:** V1 / R2 (responsive e touch implementati; QA su dispositivi reali ancora aperto)

## Visione e decisioni vincolanti

VirtualDecks è un **tavolo di carte multiplayer libero**, non un gioco con regole preprogrammate. Tutti i giocatori decidono autonomamente come giocare; il server valida solo operazioni, proprietà delle mani e autorizzazioni. Non aggiungere turni obbligatori, punteggi, vittorie o regole di giochi specifici alla V1.

- **Dispositivi V1:** desktop **e smartphone**, entrambi requisiti di lancio.
- **Sessioni effimere:** lo stato esiste solo in RAM; il riavvio del server chiude tutte le stanze. Nessun database necessario per la V1.
- **Mazzo italiano:** le carte funzionali/testuali sono sufficienti; illustrazioni tradizionali rinviate.
- **Host:** trasferimento automatico se resta offline per **3 minuti** e un altro giocatore è online.
- **Distribuzione:** prima **beta privata**, poi **lancio pubblico** dopo validazione.
- **Capienza:** massimo 8 partecipanti per stanza, invariato.

## Stato e fasi

| Fase | Stato | Risultato / Definition of Done |
| --- | --- | --- |
| **R0 · Baseline e pulizia** | ✅ Completata | Sorgenti ripuliti da node_modules, vecchie patch e snapshot; 16 test baseline superati; backup archiviati separatamente. |
| **R1 · Stabilità multiplayer e conferme** | ✅ Implementata, 23 test superati | Host offline per 3 minuti ⇒ passaggio di ruolo; host che torna non riacquista automaticamente il ruolo; posti inattivi oltre 20 minuti liberati mentre almeno un partecipante è online; stanze totalmente offline recuperabili per 1 ora; token scaduti revocati; azioni con conferma server e ritentativo idempotente. Resta il controllo manuale dell'interfaccia durante i test beta. |
| **R2 · Mobile e UX realmente touch** | 🧪 Implementata; QA su dispositivi reali da eseguire | Operazioni principali senza Shift/doppio clic/tastiera; tap/long press per selezione multipla, flip e rotazione da controlli accessibili; trascinamento touch affidabile; layout responsivo senza sovrapposizioni; prova su iPhone Safari, Android Chrome e desktop. |
| **R3 · Sicurezza e robustezza pre-beta** | Non iniziata | Limiti di creazione, join e tentativi di codici stanza; tetti al numero di stanze/connessi e dimensione delle azioni; gestione errori e metriche; configurazione corretta CORS/HTTPS/WSS, healthcheck e connessioni dietro proxy; test di abuso. |
| **R4 · Deploy e beta privata** | Non iniziata | CI con test, build frontend e lint; server stabile con riavvio automatico; accesso riservato ai tester; test con utenti reali multi-device; raccolta bug e rollback. |
| **R5 · Lancio pubblico** | Non iniziata | Chiusura dei difetti bloccanti emersi in beta; revisione sicurezza, legal/privacy/cookie e accessibilità; monitoraggio dei crash e capacità; pubblicazione e piano di manutenzione. |
| **R6 · Evoluzioni non bloccanti** | Dopo V1 | Illustrazioni tradizionali del mazzo italiano, funzionalità cosmetiche ed eventuale persistenza solo se richiesta in seguito. |

## R1 · Politica delle sessioni implementata

| Evento | Comportamento |
| --- | --- |
| Host perde connessione | Mantiene ruolo e mano per una finestra di **3 minuti**. |
| Host resta offline oltre 3 minuti, altri online | Il ruolo passa al primo partecipante **online** in ordine di ingresso; il reset diventa disponibile al nuovo host. |
| Host torna dopo il passaggio ma prima della scadenza del posto | Recupera la stessa identità e la mano, ma **non** il ruolo host. |
| Qualunque partecipante offline oltre **20 minuti** mentre qualcuno è online | Il suo posto viene liberato, le carte private tornano al mazzo e il token non è più valido. |
| Tutta la stanza offline | Nessuna espulsione individuale; la stanza rimane recuperabile fino a **1 ora** dall'ultima disconnessione. |
| Tutta la stanza offline oltre 1 ora | Stanza e token non sono più validi. |
| Uscita esplicita dell'host | Il ruolo passa immediatamente a un partecipante online, se esiste. |

Tempi configurabili tramite `HOST_OFFLINE_GRACE_MS`, `OFFLINE_SEAT_TTL_MS`, `ROOM_EMPTY_TTL_MS` e `ROOM_CLEANUP_INTERVAL_MS`. Se i valori sono ridotti per i test, **ripristinarli** prima della beta. Per la V1 il progetto usa **un solo processo Node**: in assenza di storage condiviso non usare più istanze con bilanciamento delle sessioni.

## Gate di rilascio

- **Per dichiarare R2 completata:** test touch reali senza scorciatoie da tastiera e senza bug bloccanti, tutti i controlli principali raggiungibili da mobile.
- **Per aprire la beta R4:** build riproducibile, configurazione TLS, rate limiting e checklist della sicurezza essenziale R3; test sia desktop sia smartphone.
- **Per rendere pubblico R5:** risultati beta accettabili, privacy e gestione incidenti, monitoraggio, recovery/rollback, no bug critici aperti.

## Comandi di verifica

Eseguire dalla cartella principale dopo `npm ci` sulla propria macchina:

```bash
npm run test:server
npm run typecheck:web
npm run build:web
npm run lint:web
```

Nota: i 29 test server passano nell'ambiente di audit; la build Vite e il lint nativo richiedono installazione corretta dei pacchetti per il sistema operativo di destinazione e test in browser.

## R3 · Sicurezza essenziale e richieste di prodotto — implementata, QA da completare

- Nickname obbligatorio, validato sul backend e univoco per stanza; nome persistente dopo resume; nessun account richiesto.
- Mano inizialmente vuota ora visibile con una zona di drop anche in mobile portrait e landscape.
- Limiti antiabuso per creazione/ingresso/resume/azioni; `MAX_ROOMS`; controllo Origin anche WebSocket; max packet 16 KiB; endpoint `/health`.
- Test automatici: **29/29 backend** superati; TypeScript web/server superati.
- **Gate ancora aperto**: confermare il drop a mano vuota e i nomi su Chrome Android e desktop; verificare Vite build e lint su Windows.
- Per una beta davvero privata occorre un meccanismo di accesso lato hosting: nickname e codice stanza di 4 caratteri non sono autenticazione. Servono HTTPS/WSS, protezioni reverse proxy e monitoraggio; usare un unico processo backend.

Vedi `R3_NOTES_2026-11-10.md`.

## R2 · Implementazione corrente

Vedi `R2_NOTES_2026-11-10.md` per i controlli touch, la compatibilità e la checklist QA. R3 implementata e in collaudo; R4/R5 non ancora avviate.


## R3.1 — Completamento hardening backend

**Implementata e testata**, in attesa di collaudo in rete reale: quote connessioni/handshake, limiti memoria sui rate limiter, supporto proxy esplicitamente fidato, validazione delle variabili d'ambiente, metriche con token, logging aggregato, gestione degli errori e shutdown. **40 test backend superati**. Vedi `R3_1_NOTES_2026-11-10.md`.

**Gate R3 codice:** chiuso sulla baseline R3 + patch R3.1, salvo regressioni emerse nel collaudo. **Gate R4 deploy:** ancora aperto; servono HTTPS/WSS, controllo accessi dei tester, reverse proxy correttamente configurato, process manager, CI, monitoraggio con alert e test di carico/connessione. I codici stanza a quattro caratteri non garantiscono la riservatezza della beta.
