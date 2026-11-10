# VirtualDecks — Blocco 3: sessioni, riconnessioni e stabilità

Questa patch va applicata **alla versione del Blocco 2 con le tre modifiche manuali già presenti** (rotazione in drag, colori delle carte rivelate, destinatari selettivi).

## Cosa cambia

- **Riconnessione automatica**: dopo un refresh o una perdita temporanea della connessione, il client presenta `room:resume` con `{ roomId, playerId, token }`. Il token casuale di 256 bit è conservato in `sessionStorage` della singola scheda; non viene mai incluso in `room:players` o in `table:state`.
- **Stanze conservate**: disconnettersi lascia inalterate identità e mano. Gli altri giocatori vedono `online: false`. Le condivisioni della mano vengono nascoste alla disconnessione del proprietario; un destinatario disconnesso perde l'autorizzazione a vedere nuove rivelazioni.
- **Uscita volontaria**: cliccando il logo viene richiesta conferma. `room:leave` revoca il token, restituisce le carte della mano al mazzo mescolandole e libera il posto. Se esce il creatore, il ruolo di host passa al giocatore rimasto da più tempo.
- **Permessi**: soltanto l'host può eseguire `reset` (controllo sia sul server sia nella UI). Shuffle e altre azioni libere restano disponibili a tutti.
- **Pulizia**: una stanza con zero giocatori online scade dopo 60 minuti (controllo periodico ogni minuto). Tutti i giocatori offline rimangono nel conteggio del limite di otto posti finché non escono o scade la stanza.
- **Idempotenza**: ogni comando `table:action` contiene un `actionId` UUID. Il server conserva gli ultimi 128 risultati per giocatore, così un reinvio dello stesso comando non esegue due volte la stessa operazione.
- **Interfaccia**: stato di connessione, tentativo manuale di riconnessione, elenco host/online/offline; la distribuzione e la condivisione delle mani non possono più selezionare destinatari offline.

## File principali

- `apps/server/src/index.ts`: sessioni, token, resume, leave, host, TTL, dedup.
- `apps/server/src/game.ts`: `removePlayer()` restituisce le carte al mazzo.
- `apps/web/src/App.tsx`: memorizza le credenziali nella scheda e ripristina la sessione.
- `apps/web/src/types/player.ts`, `apps/web/src/hooks/useTableGame.ts` e componenti del tavolo: online/offline, permessi, retry e actionId.
- `apps/server/test/session.test.mjs`: test di ripristino, token errato, cambio host, richieste duplicate e scadenza.

## Esecuzione

```bash
npm install
npm run build:server
npm run typecheck:web
npm run test:server
npm run build:web
```

Poi avvia due terminali con `npm run dev:server` e `npm run dev:web`.

### Test manuale più utile

1. A crea una stanza, B entra. A pesca tre carte nella propria mano.
2. Ricarica la pagina di A: deve riapparire **la stessa identità**, con **le stesse tre carte** e lo stesso codice stanza.
3. Chiudi la connessione di A dai DevTools o disattiva brevemente la rete: B vede A offline, ma il tavolo rimane operativo. Riattiva la connessione: A rientra.
4. B prova a fare reset: il server lo rifiuta. A, che è host, riesce.
5. A clicca il logo ed esce confermando: la sua mano torna al mazzo, B diventa host.
6. B esce: la stanza viene eliminata immediatamente perché non restano partecipanti.
7. Prova a condividere carte a un giocatore offline: la checkbox deve essere disattivata.

## Limiti consapevoli della V1

- Le partite restano **solo nella RAM del server**. Se il processo viene riavviato, nessuna stanza può essere ripristinata.
- `sessionStorage` ripristina la stessa scheda dopo refresh. Una nuova scheda non condivide automaticamente l'identità (utile per non rubare la sessione ai test con più giocatori). Chiudere definitivamente una scheda può perdere il token.
- Non sono ancora previsti account, persistency DB, multiistanza o salvataggi su disco.
- Se la rete manca, l'uscita volontaria non può essere confermata dal server: riconnettersi prima di lasciare.
- Il creatore offline mantiene il ruolo di host fino al rientro o all'uscita esplicita; non è previsto un trasferimento automatico dopo alcuni minuti.
- I valori già mostrati ad altri non possono essere "dimenticati" da un client. La disconnessione revoca la condivisione per il futuro.
- In produzione servono HTTPS/WSS, accesso al server protetto e CORS_ORIGINS configurato; il token è una credenziale sensibile.

## Verifica effettuata nel workspace di preparazione

I test unitari del motore `apps/server/test/game.test.mjs` sono passati. È stato inoltre eseguito un controllo sintattico TS/TSX e un controllo dei tipi del backend con definizioni Socket.IO surrogate, dato che l'installazione di pacchetti npm nel workspace di preparazione non ha potuto completarsi. I test end-to-end Socket.IO e la build frontend devono essere completati nel tuo ambiente con `npm install`.
