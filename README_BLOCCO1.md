# VirtualDecks V1 — Blocco 1: server autoritativo e privacy

## Cosa cambia

- `apps/server/src/game.ts`: **unica fonte di verità** per mazzo, mani, carte sul tavolo, pile e scarti. Ogni operazione è validata prima di modificare lo stato; il contatore `version` cresce solo dopo le operazioni accettate.
- `apps/server/src/index.ts`: gestisce Socket.IO, room membership, autorizzazione dei comandi e invio dello stato **personalizzato per giocatore**. Le carte nel mazzo non vengono trasmesse; le mani altrui non vengono trasmesse; le carte coperte sul tavolo non espongono `rank` o `suit`.
- `apps/web/src/hooks/useTableGame.ts`: NON crea né modifica carte localmente. Invia comandi al server, mantiene soltanto selezione e anteprima delle carte trascinate.
- `apps/web/src/components/table/TableSurface.tsx`: mantiene il design e utilizza i comandi condivisi anche per pile, scarti, movimenti e posizione del mazzo.
- `apps/web/src/App.tsx` e `components/home/HomeScreen.tsx`: selezione mazzo francese da 52 o italiano da 40 carte al momento della creazione.
- I componenti carta/hand/zone/pile nascondono la faccia delle carte coperte senza fare affidamento sulla sola CSS. Gli ID delle carte ora sono UUID casuali (non contengono `rank` o `suit`).
- Rimosso `apps/server/src/table.ts` (vecchio generatore di mazzi, sostituito da `game.ts`).

## Prima di applicare i file

Questa modifica è stata sviluppata a partire dallo ZIP `VirtualDecks-master.zip`, non dalla versione del tuo computer dopo l'ultima correzione alla build. Lavora su un branch dedicato o conserva una copia delle modifiche locali.

```bash
git switch -c feat/authoritative-game
```

Se usi la **patch**, posizionala nella root del progetto ed esegui prima `git apply --check VirtualDecks_Blocco1.patch`, poi `git apply VirtualDecks_Blocco1.patch`. In alternativa, puoi sovrascrivere i file a partire dallo ZIP completo di progetto (che NON contiene `node_modules`).

## Come avviare

Richiede Node >=22.12 e npm.

```bash
npm install
npm run dev:server
# in un secondo terminale:
npm run dev:web
```

Nel browser `http://localhost:5173` crea una stanza e scegli il tipo di mazzo; apri un secondo browser/incognito e inserisci il codice stanza.

## Test automatici

```bash
npm run typecheck:web
npm run test:server
npm run build:web
```

`test:server` compila il backend e lancia i test unitari e un test reale a due client Socket.IO.

## Test manuale (due browser)

1. Browser A: crea stanza con mazzo francese (52). Browser B: entra col codice, verifica stesso conteggio.
2. A: clic sul mazzo (carta sul tavolo); A e B devono vederla identica. Spostala, doppio clic per coprirla e ancora per scoprirla: entrambe le schermate devono aggiornarsi.
3. A: Shift+clic sul mazzo. SOLO A deve vedere la nuova carta nella sua mano. B deve vedere il mazzo scalato di una carta ma non l'identità della carta privata.
4. A: trascina la carta dalla mano al tavolo. Ora entrambi la vedono; B può spostarla.
5. A: seleziona due carte, `P` per creare pila. B deve vedere la pila; B può estrarre la carta superiore.
6. A: trascina una carta negli scarti; B può estrarre una carta dagli scarti. Shuffle e Reset devono avere effetto su entrambi.
7. Ricrea una stanza con mazzo italiano: conteggio iniziale 40. Le facce italiane sono **placeholder tipografici**, non ancora illustrazioni regionali.

## Protocollo Socket.IO

- `room:create(deckKind, ack)` con `deckKind` `french` o `italian`.
- `room:join(roomId, ack)`.
- `table:action(payload, ack)` con azioni supportate: `draw-table`, `draw-hand`, `move-cards`, `front-card`, `flip-cards`, `create-pile`, `move-pile`, `front-pile`, `extract-pile`, `table-to-hand`, `hand-to-table`, `table-to-zone`, `hand-to-zone`, `extract-zone`, `shuffle`, `reset`, `move-deck`.
- Il server emette `table:state` **separatamente** a ciascun giocatore, con `deckCount` e la sola mano autorizzata. Gli eventi `room:players` informano sulle presenze.
- Ogni `table:action` risponde `{ok: true, version}` oppure `{ok: false, error}`.

## Conclusione / limiti noti

**Implementato:** stato autorevole, privacy delle mani e delle carte coperte, sincronizzazione delle operazioni esistenti, controllo di input, selezione mazzo 52/40, test base.

**Ancora da completare:** riconnessione e recupero sessione dopo refresh (Blocco 3); controllo dei comandi e UI con più browser veri (smoke test manuale); rotazione carte e distribuzione di più carte con una sola azione (Blocco 2); illustrazioni tradizionali per il mazzo italiano e ottimizzazione touch (Blocco 4); deployment e persistenza delle stanze dopo riavvio (Blocco 5). La sola RAM viene mantenuta in questa fase.

Nota: i test TypeScript e Socket.IO sono stati eseguiti nell'ambiente di sviluppo del report; non è stato possibile eseguire il bundling Vite in quello stesso ambiente perché le dipendenze native dello ZIP erano relative a Windows, mentre l'ambiente di test era Linux. Verifica `npm run build:web` dopo `npm install` sul tuo computer.
