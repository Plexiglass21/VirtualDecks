# VirtualDecks

**V1 in sviluppo · R3.1 integrata; fix carte italiane e gestione stanze del 16/11/2026 in attesa di QA completa.** Tavolo virtuale multiplayer con carte francesi (52) e italiane (40), senza regole di gioco imposte. Da uno a otto partecipanti; server autoritativo e mani private.

## Specifiche V1 approvate

- Tavolo libero, senza turni, punteggi o regole automatiche.
- **Desktop e smartphone** entrambi supportati al lancio (UX touch implementata in R2; collaudo Safari iOS/Chrome Android ancora da eseguire).
- Sessioni temporanee, nessun database richiesto. Riavvio server = perdita delle stanze.
- Illustrazioni tradizionali del mazzo italiano rinviate.
- Host offline: trasferimento dopo 3 minuti a un altro giocatore online; posto offline liberato dopo 20 minuti se ci sono partecipanti online; una stanza totalmente offline è recuperabile per 1 ora.
- Lancio **beta privata** prima del rilascio pubblico.

Vedere [ROADMAP.md](ROADMAP.md), [R3_NOTES_2026-11-10.md](R3_NOTES_2026-11-10.md) e [R1_NOTES_2026-11-10.md](R1_NOTES_2026-11-10.md) per dettagli e test.

## Requisiti e sviluppo locale

- Node.js **>= 22.12.0**, npm.
- Nella cartella principale: `npm ci` per reinstallare correttamente le dipendenze sul proprio sistema operativo. **Non copiare `node_modules` tra Windows, macOS e Linux.**
- Terminale 1: `npm run dev:server` (porta 3001).
- Terminale 2: `npm run dev:web` (porta 5173).
- Browser: `http://localhost:5173`. Per multiplayer usare due browser/profili indipendenti.

## Test

```bash
npm run test:server
npm run typecheck:web
npm run build:web
npm run lint:web
```

La baseline R3 riportava **29 test superati**. Per la patch del 16/11/2026 risultano superati i **16 test eseguibili senza dipendenze installate** (13 di logica/guardrail e 3 di action ID); sono stati aggiunti 2 test Socket.IO per l'eliminazione stanze, ma l'intera suite e il typecheck/build del frontend devono essere rieseguiti dopo `npm ci` (rete npm non disponibile nell'ambiente di verifica). Restano necessari anche i test manuali sui dispositivi mobili.

## Configurazione di rete

L'ambiente server accetta `PORT`, `CORS_ORIGINS`, `MAX_ROOMS`, `HOST_OFFLINE_GRACE_MS`, `OFFLINE_SEAT_TTL_MS`, `ROOM_EMPTY_TTL_MS`, `ROOM_CLEANUP_INTERVAL_MS`. Valori d'esempio in `apps/server/.env.example`. **Il server non carica automaticamente i file `.env`.**

Il client legge `VITE_SERVER_URL` in fase di build; usare un URL HTTPS raggiungibile pubblicamente per la beta (esempio in `apps/web/.env.example`). R3 introduce controlli base di abuso, ma in produzione servono comunque reverse proxy HTTPS/WSS con limitazione connessioni, riavvio automatico e osservabilità. Senza persistenza condivisa, usare **una sola istanza** del backend.

## Stato del rilascio

R0–R2.7 implementate e progressivamente collaudate; **R3 è implementata ma richiede collaudo del nickname e del drop a mano vuota su smartphone**. R4 (beta privata) e R5 (pubblico) rimangono fasi separate. Non dichiarare il servizio pronto per il pubblico basandosi soltanto sui test automatici.

## Integrità dello storico

Le patch 1–3 sono **già integrate**. Non riapplicarle a questa versione. L'archivio storico è separato dal pacchetto sorgente; lo ZIP originale resta invariato. `node_modules` e `dist` non sono inclusi nel pacchetto da distribuire.

## Uso smartphone (R2)

Per pescare sul tavolo **tocca direttamente il mazzo** (non esiste un pulsante Draw); usa **Deck → hand** per pescare nella tua mano. La barra touch offre Multi, Flip, Rotate, Pile, Pick up, Discard e i comandi per giocare dalla mano. Tocca una carta per selezionarla; tienila premuta per 0,5 secondi per abilitare la selezione multipla. In verticale i comandi sono in una griglia; in orizzontale sono su una barra laterale; quando la mano è numerosa usa le frecce accanto alle carte per cambiare gruppo. Il menu Actions contiene le funzioni avanzate. Per il collaudo usa anche i dispositivi reali elencati in `R2_NOTES_2026-11-10.md`.

## R2.2: layout e gesti mobile (correzione post-collaudo)

Su smartphone orizzontale la barra delle azioni si trova **sotto l’intestazione**, mentre la mano resta nella parte bassa del tavolo. In verticale la barra rimane subito sopra la mano. Il tocco del mazzo pesca una carta sul tavolo; Deck → hand pesca nella mano privata. Tieni premuta una carta per la multiselezione: il menu contestuale nativo del browser è disabilitato sulle carte. Se un'azione richiede una selezione e manca, viene mostrato un messaggio. La R2 rimane soggetta al collaudo browser/touch reale.

## R3: nickname, sicurezza essenziale e drop verso mano vuota

Prima di creare o entrare in una stanza inserire un **nickname**. Ogni stanza accetta nomi univoci (case-insensitive); il nickname resta associato al posto dopo refresh e riconnessione. La zona mano privata è **sempre visibile, anche a zero carte**: trascinaci una carta dal tavolo per raccoglierla. Il tasto `Pick up` rimane un'alternativa.

Per le protezioni R3 (rate limiting, origine Socket.IO, dimensioni dei messaggi, capacità stanze, healthcheck) e relativi limiti vedere [R3_NOTES_2026-11-10.md](R3_NOTES_2026-11-10.md). L'aggiornamento cambia il protocollo Socket.IO: **riavviare insieme frontend e server**. Il nickname non è un login; per una beta privata vera serve accesso protetto lato hosting.


## R3.1 — Hardening pre-beta

Patch R3.1 applicata sulla R3: limiti alle connessioni simultanee e agli handshake per IP, rate limiter con memoria limitata, IP inoltrati solo da proxy fidati, configurazioni validate, metriche aggregate protette da token, readiness, log JSON e arresto ordinato. **Nessuna modifica al frontend o alle regole del tavolo.** Leggere [R3_1_NOTES_2026-11-10.md](R3_1_NOTES_2026-11-10.md) per i nuovi parametri e le precauzioni di deployment. R4 rimane necessaria prima della beta privata.

## Aggiornamento 16/11/2026 — carte italiane e stanze

Le carte italiane hanno adesso emblemi originali in SVG, pips e figure leggibili su desktop/mobile (non riproduzioni di un mazzo regionale storico). Dal tavolo, **Actions → Leave room** permette a tutti di uscire. L'host corrente può usare **Actions → Delete room for everyone…** per chiudere definitivamente la stanza e invalidarne il codice per tutti. Un nuovo evento `room:deleted` notifica i client connessi. Per flusso, limitazioni e test vedere [PATCH_NOTES_2026-11-16.md](PATCH_NOTES_2026-11-16.md).
