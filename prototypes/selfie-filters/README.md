# Camerino di Natale

Prototipo autonomo per il Secret Santa. Cappello di maglia con palchi mobili, naso rosso pulsante e barba sono selezionabili anche insieme. L'anteprima frontale è specchiata. Una sola faccia viene seguita per volta.

![Cappello, naso e barba sul volto in movimento](anteprima.webp)

Anteprima registrata dal canvas del prototipo, con un ritratto sintetico in movimento usato come fotocamera di prova.

## Prova sul computer

Dalla radice del ramo, con Python 3:

```sh
python3 prototypes/selfie-filters/start.py
```

Apri [localhost:8765](http://localhost:8765), consenti l'accesso alla fotocamera e lascia un po' di spazio sopra la testa. Seleziona gli accessori, scatta e scarica la foto. Disattivando tutti e tre gli accessori puoi fare uno scatto normale. La fotocamera si spegne dopo lo scatto, quando chiudi il camerino o quando passi a un'altra scheda.

Il primo avvio scarica la versione verificata di MediaPipe Tasks Vision e il modello Google Face Landmarker. Gli avvii successivi riusano i file in `runtime/`. Le immagini della fotocamera e le coordinate del viso vengono elaborate sul dispositivo.

## Prova sul telefono

Esegui `python3 prototypes/selfie-filters/start.py --prepare-only` e servi la cartella preparata tramite un host HTTPS che controlli. Per un ambiente di sviluppo remoto con inoltro privato delle porte puoi anche avviare il comando normale e aprire dal telefono l'URL HTTPS della porta 8765. Il browser richiede un contesto sicuro per la fotocamera.

## Collegamento al Selfie Wall

Copia in una rotta statica dedicata i file HTML, CSS, JS/MJS, `art/` e `runtime/`. L'host deve servire i moduli JS con il MIME JavaScript e i file WASM come `application/wasm`. Usa per la pagina del camerino e il suo worker la CSP definita in `start.py` (in particolare gli script locali e `'wasm-unsafe-eval'`). La configurazione corrente del server dell'app richiede questa eccezione limitata al percorso del camerino.

Inserisci la pagina in un iframe **della stessa origine**. Nel componente `Selfies` associa un ref all'iframe e, durante il suo montaggio, ascolta l'evento `message`. Il pulsante **Usa questo selfie** appare quando la pagina è incorporata e consegna il Blob già composto al genitore. Esempio per il gestore, riusando `previewOf` di `src/main.jsx`:

```js
function receiveSelfie(event) {
  if (event.origin !== location.origin || event.source !== cameraFrame.current?.contentWindow) return;
  const { type, blob } = event.data ?? {};
  if (type !== 'secret-santa:selfie' || !(blob instanceof Blob)) return;
  if (!['image/webp','image/jpeg'].includes(blob.type) || blob.size >= 1_000_000) return;
  previewOf(blob);
}
```

Registra il gestore con `addEventListener('message', receiveSelfie)` e rimuovilo allo smontaggio. La pubblicazione resta affidata al pulsante **Conferma foto** del Selfie Wall. Lo scatto usa lo stesso canvas mostrato in anteprima, codificato in WebP o in JPEG di riserva.

## Motore e test

Il modello analizza una copia ridotta del fotogramma, normalmente in un Web Worker. Il rendering continua sul thread dell'interfaccia. Viene elaborato un fotogramma per volta, adattando l'intervallo ai tempi di inferenza. Dove il worker non parte, il motore riprova sul thread principale. Con il movimento ridotto di sistema vengono disattivate le oscillazioni decorative.

```sh
node --test prototypes/selfie-filters/tests/effects.test.mjs
```

MediaPipe Tasks Vision 0.10.21 (Google, Apache-2.0) e il [modello Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) sono scaricati dai rispettivi distributori. I tre accessori grafici sono stati creati per questo prototipo.

Collaudo eseguito in Chromium con videocamera simulata: aggancio e perdita del volto, tre accessori, scatto e download, nuova acquisizione, motore di riserva, consegna del Blob al genitore da un iframe della stessa origine e recupero da fotocamera negata o modello mancante. La prova su dispositivi fisici iOS e Android è ancora da fare.
