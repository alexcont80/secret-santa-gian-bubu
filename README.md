# Secret Santa da Gian & Bubu

Webapp React e Node per la festa del 7 dicembre 2026 alle 20:00 a Udine. L’immagine, il font Georgia, la palette e parte del CSS provengono dall’HTML originale di Drive. Il riferimento HTML resta fuori dalla build. La versione pubblicata richiede Firestore e cookie di sessione HTTPS.

## Importa e pubblica in Google AI Studio

1. Accedi a [AI Studio Build](https://aistudio.google.com/apps). Scegli **Import from GitHub** dal menu **Add files** e importa questo progetto. Se serve l’autorizzazione GitHub, concedi l’accesso soltanto a questo repository.
2. In AI Studio chiedi di *provisionare Firestore in modalità Native, senza cambiare i login applicativi e mantenendo l’accesso al database soltanto dal backend*. Usa il progetto gratuito dedicato all’app, se offerto. Configura e verifica le regole di `firestore.rules`. L’identità runtime di Cloud Run deve poter leggere e scrivere sul database tramite Application Default Credentials. Se AI Studio assegna un database denominato, imposta `SANTA_FIRESTORE_DATABASE` con il suo identificatore.
3. In **Settings → Secrets** imposta `SANTA_GUEST_PASSWORD` con la parola concordata per gli invitati, un nome amministratore, una password amministrativa distinta di almeno 16 caratteri e `SANTA_SESSION_SECRET` con almeno 32 caratteri casuali. Imposta `SANTA_FIRESTORE_PROJECT` se il backend non riceve l’ID dal runtime. Usa un gestore di password per generare e conservare i segreti. La chiave Gemini fornita da AI Studio resta sul server. Attiva solo un modello con quota gratuita verificata.
4. Usa `npm run build` e `npm start`. Per la preview di sviluppo puoi usare `npm run dev` e aprirla in una scheda separata per collaudare i cookie. In produzione serve il backend Node. Lascia `SANTA_PHOTO_BUCKET` vuoto nello Starter Tier. Il backend salva le foto WebP in documenti Firestore isolati e le serve solo a chi ha una sessione valida. Un bucket già disponibile può essere configurato senza cambiare il codice.
5. Da **Publish**, scegli **Deploy to Cloud Run** solo se è disponibile lo **Starter Tier**. Se l’interfaccia richiede **Set up billing**, fermati prima di collegare un account di fatturazione. Usa il link Cloud Run in una finestra anonima. Verifica `/api/health`, l’accesso invitati, l’accesso amministrativo, la fotocamera reale in HTTPS e l’assenza di RSVP, foto, voti e abbinamenti di prova.
6. Per provare la scrittura sul cloud prima del lancio, usa una preview legata a un database di prova separato. Configura un database vuoto per l’evento. I test qui forniti puntano solo a database locali o emulatori.

## Amministra la festa

- Apri **Area amministrativa** dalla pagina di login e accedi con le credenziali separate. La sezione **Regia** mostra presenze, categorie, foto, moderazione, votazioni ed esportazione JSON.
- Prima dell’estrazione rivedi i confermati e i companion. Imposta le esclusioni nominative e verifica se devono valere anche al contrario. **Estrai i nomi** chiede conferma. L’estrazione è definitiva, senza azzeramento dal browser. Dopo l’estrazione è ancora possibile correggere il menu. Nominativi, presenze e companion restano quelli estratti.
- Ogni invitato riceve un codice personale da conservare alla creazione del proprio RSVP. L’eventuale companion riceve un codice distinto, da consegnargli in privato. Il codice recupera il profilo e mostra il destinatario nella sezione Secret Santa. Il file di esportazione non include codici o abbinamenti.
- Modera i messaggi prima di pubblicarli. Concedi l’accesso alla fotocamera dal browser quando richiesto. La galleria è riservata agli invitati con sessione valida. In **Party Live** usa **Schermo intero** per la TV.
- Apri, chiudi e pubblica i risultati degli Awards nella Regia. I voti individuali sono aggiornabili durante l’apertura.
- Per la voce di Babbo Natale aggiungi il file ElevenLabs come `public/santa.mp3` prima della build. Le campanelle sono sintetizzate dal browser e riprodotte dopo l’accesso se l’audio è attivo.

## Sviluppo e collaudo locale

Usa Node 24. Esegui `npm ci`, `npm run build` e `npm test`. Configura i segreti server tramite variabili d’ambiente. In locale puoi usare `SANTA_DB=sqlite`, `SANTA_BIND=127.0.0.1` e `SANTA_COOKIE_SECURE=0` per HTTP di sviluppo. Produzione rifiuta questa configurazione. Con `FIRESTORE_EMULATOR_HOST=127.0.0.1:8180`, la suite esegue le stesse prove sul backend Firestore di test. Lo script Browser in `test/browser-check.py` usa un browser Chromium con fotocamera sintetica e il server HTTPS di `test/run-https.mjs`, con segreti sintetici e profili temporanei.

Imposta `SANTA_GEMINI_ENABLED=1` dopo aver verificato la quota gratuita del progetto Gemini. Se Gemini è disattivato o indisponibile, il menu separa le pietanze con una classificazione locale correggibile. La ricerca pubblica Spotify funziona attraverso un link. Con le credenziali Spotify server vengono mostrati anche i risultati in-app, se l’API li restituisce.
