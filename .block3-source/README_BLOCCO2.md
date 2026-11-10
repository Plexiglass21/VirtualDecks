# VirtualDecks — Blocco 2: distribuzione, rotazione, mani mostrate

Patch basata su `VirtualDecks_Blocco1_progetto.zip`, fornito nella conversazione.

## Scelte funzionali adottate

- Sandbox senza regole automatiche: ogni giocatore può distribuire dal mazzo ai partecipanti **attualmente presenti** nella stanza.
- **Actions → Deal cards…**: selezione dei destinatari e numero di carte per persona. Distribuzione round-robin (una carta per destinatario a giro), validata in modo atomico sul server: se il mazzo è insufficiente, nessuna carta viene distribuita.
- **Actions → Show entire hand**: rende pubbliche le carte attualmente nella propria mano (non le sposta dal contenitore `hand`).
- **Actions → Show selected hand cards**: toccare/cliccare una o più carte della propria mano per selezionarle e poi scegliere questa azione. Il nuovo insieme sostituisce quello precedentemente mostrato.
- **Actions → Hide revealed cards**: toglie i valori e semi di quelle carte dagli aggiornamenti futuri inviati agli altri giocatori. **Non può cancellare ciò che gli altri hanno già visto o eventualmente registrato.**
- Le nuove carte pescate/destinate alla mano *dopo* la rivelazione restano private fino a un nuovo comando di rivelazione.
- La rivelazione è rivolta a tutti i giocatori della stanza, senza selezione del destinatario; è persistente fino al comando Hide, all'uscita del proprietario dalla stanza o al reset.
- Il numero di carte nella mano di ogni giocatore è pubblico; i valori delle carte nascoste e i relativi UUID non vengono trasmessi.
- **Actions → Rotate selected 90° (R)** ruota carte libere, sincronizzando l'angolo su tutti i client.
- Aprendo una pila: `Flip pile`, `Rotate 90°`, `Shuffle pile`; tutte le operazioni sono eseguite dal server. Le pile esistenti restano trascinabili e supportano l'estrazione della carta superiore.

## Struttura tecnica

**Backend** `apps/server/src/game.ts`:
- `Hand.revealedCardIds`: scelta esplicita del proprietario, mantenuta nel gioco server.
- `viewFor(game, playerId)`: la mano propria comprende tutti gli ID e le facce; le mani altrui contengono l'ID e la faccia soltanto delle carte rivelate e placeholder anonimi per le altre.
- Nuovi comandi in `applyAction`: `deal`, `reveal-hand`, `hide-hand`, `rotate-cards`, `rotate-pile`, `flip-pile`, `shuffle-pile`.
- Convalidati proprietario, destinatari connessi, ID, quantità, angoli e disponibilità del mazzo.
- I comandi che spostano una carta fuori dalla mano eliminano l'ID dall'elenco delle rivelazioni.

**Socket.IO** `apps/server/src/index.ts`:
- Continua a pubblicare `table:state` personalizzato per ogni giocatore.
- Verifica destinatari `deal` contro i membri connessi.
- Quando il proprietario lascia la stanza, la sua rivelazione pubblica viene cancellata e la nuova vista viene inviata agli altri.

**Frontend**:
- `HandView`: tap/clic per selezionare carte della propria mano, drag invariato per giocarle.
- `RevealedHands`: piccolo pannello che visualizza soltanto le carte rivelate dagli altri.
- `DealCardsDialog`: selezione destinatari, quantità, validazione quantità rispetto al mazzo.
- `PlayingCard` e `PileView`: visualizzano le rotazioni persistenti.
- `CardCollectionDialog`: comandi della pila.

## Installazione

Con progetto già aggiornato al Blocco 1 e dopo aver salvato le modifiche locali:

```bash
# dalla root del progetto; scarica/copia qui il file .patch

git switch -c feat/block-2-cards

git apply --check VirtualDecks_Blocco2.patch
git apply VirtualDecks_Blocco2.patch

npm install
npm run typecheck:web
npm run test:server
npm run build:web
```

Per avviare:

```bash
npm run dev:server
npm run dev:web
```

Apri la pagina in due finestre/browser e prova:
1. A crea stanza; B entra.
2. A esegue `Actions → Deal cards…` e assegna 3 carte a entrambi.
3. B vede il conteggio della mano di A, **non** i valori.
4. A seleziona 2 carte della propria mano con tap/clic; poi `Actions → Show selected hand cards`. B vede solo quelle 2.
5. A seleziona `Actions → Show entire hand`. B vede tutte le carte attuali di A.
6. A pesca un'altra carta nella mano. B continua a non vedere la carta nuova.
7. A sceglie `Actions → Hide revealed cards`. B non riceve più i valori, fermo restando ciò che era già stato osservato.
8. A prende due carte sul tavolo, preme `R`, forma una pila e prova i comandi all'interno della pila.

## Test effettuati

- TypeScript `tsc -p apps/server/tsconfig.json`: passato
- TypeScript `tsc -p apps/web/tsconfig.app.json`: passato
- `node --test apps/server/test/*.test.mjs`: 11/11 passati, inclusi due test con socket reali
- Build Vite non verificabile qui: l'installazione della cache disponibili non contiene il binding nativo Linux di rolldown. Eseguire `npm install && npm run build:web` nella propria macchina.

## Limitazioni consapevoli

- Le rivelazioni non implicano memoria reversibile: una carta già mostrata potrebbe essere ricordata o registrata dagli avversari.
- Gestione di riconnessione e identità dopo refresh non inclusa (Blocco 3).
- Non è ancora presente un sistema di lock su una carta durante un drag simultaneo.
- Pile già aperte si chiudono dopo modifica per non mostrare dati obsoleti.
- UI mobile e browser reali non testati in questo ambiente; da validare manualmente.
