/**
 * LAST SUMMER 2016 · BOGOTÁ — envío de boletas con QR
 * ===================================================
 * Proyecto de Apps Script aparte, pegado en una Google Sheet nueva solo para
 * Last Summer (Extensiones > Apps Script desde esa hoja).
 *
 * Localidades: Tributies (ya vendidas), Preventa 1, Preventa 2 y General
 * (pista, $20.000 de consumo) y mesas VIP y Backstage (5 o 6 personas).
 *
 * VENTAS POR WHATSAPP (pista y mesas):
 *   1. Anotas cada venta en la hoja "Repositorio QR": Tipo de entrada,
 *      Nombre, Email y, si quieres, Teléfono y Monto.
 *      · Pista: una fila = una boleta.
 *      · Mesa VIP o Backstage: una fila = una mesa. El script crea solo las
 *        boletas de la mesa (QR_POR_MESA, una por persona).
 *   2. Menú 🎟️ Boletería > "Enviar QR de las ventas nuevas".
 *   3. A cada comprador le llega un correo con sus boletas: cada una es la
 *      imagen con el diseño de su localidad, su número, su nombre y su QR,
 *      dentro del correo y adjunta para guardarla en el celular.
 *
 * MESAS PAGADAS CON WOMPI (página web): automático.
 *   Menú > "Activar lector de pagos de Wompi" (una vez). Cada 5 minutos lee
 *   en Gmail los correos "Transacción APROBADA" de los links de mesas
 *   (LINKS_WOMPI), registra la mesa en la hoja, manda las boletas y te avisa.
 *
 * Código de cada boleta: LS-<iniciales>-<tipo>-<número>, ej. LS-JSP-VIP-0001
 * (Juan Sebastián Parra, VIP, boleta 1).
 *
 * ARCHIVOS DEL PROYECTO:
 *   Code.gs            este archivo
 *   Fondo-Tributies.gs la imagen de fondo de Tributies (no se edita)
 *   Los fondos de las demás localidades se descargan solos de la página
 *   (FONDOS_URL), no hay que pegarlos.
 *
 * UNA SOLA VEZ, AL INSTALAR:
 *   a) Plantilla vertical para la boleta (Google no deja crear diapositivas
 *      verticales desde código, por eso se hace una vez a mano):
 *      - Abre slides.new (presentación nueva en blanco).
 *      - Archivo > Configuración de página > Personalizado:
 *        5,625 x 10 pulgadas (o 14,29 x 25,4 cm) > Aplicar.
 *      - Copia el ID del enlace (lo que va entre /d/ y /edit) y pégalo
 *        abajo en PLANTILLA_ID. No borres esa presentación.
 *   b) Ejecuta prepararHojaVentas (crea la hoja con la lista de tipos).
 *   c) Ejecuta enviarPrueba: te llega un correo de prueba a tu cuenta.
 *      Acepta los permisos que pide Google (Sheets, Gmail, Slides, Drive).
 *   d) Para las mesas pagadas en la página: menú > "Activar lector de pagos
 *      de Wompi (mesas)". Acepta el permiso nuevo (disparadores).
 *
 * Opcional, para el escáner de la puerta más adelante:
 *   Propiedad de secuencia de comandos STAFF_PIN e implementar como
 *   Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).
 */

const EVENTO = 'Last Summer 2016';
const EVENTO_CORTO = 'LAST SUMMER 2016 · BOGOTÁ';
const FECHA_EVENTO = 'Sábado 19 de diciembre';
const FECHA_CORTA = 'SÁB 19 DIC';
const LUGAR_EVENTO = 'Teatro Republik · Cra. 14A #83-49, Bogotá';
const AVISO_EMAIL = 'fantributeco@gmail.com';
const PREFIJO = 'LS';
// ID de la presentación vertical en blanco que se usa como molde (ver paso a del inicio).
const PLANTILLA_ID = '1lrT-gPxm5k03V2Xy8tPLurFBvt_z_vLrKXYRFJYO3iQ';
// true = boleta de 1600 px con el servicio Google Slides API (más lento). false = 540 px (rápido).
const ALTA_RESOLUCION = false;

// Boletas (QR) que se crean por cada mesa: una por persona.
const QR_POR_MESA = 6;
const INCLUYE_MESA = '1 botella + 1 agua, sofá y sillas premium, mesero exclusivo y pantalla propia';

// Localidades. precio = valor de una boleta (pista) o de la mesa completa.
const TIPOS = {
  TRB: { tipo: 'Tributies',  precio: 30000,  consumo: 15000, extra: 'regalo especial para Tributies' },
  P1:  { tipo: 'Preventa 1', precio: 35000,  consumo: 20000, extra: '' },
  P2:  { tipo: 'Preventa 2', precio: 40000,  consumo: 20000, extra: '' },
  GEN: { tipo: 'General',    precio: 45000,  consumo: 20000, extra: '' },
  VIP: { tipo: 'Mesa VIP',       precio: 350000, consumo: 0, extra: INCLUYE_MESA, mesa: true },
  BKS: { tipo: 'Mesa Backstage', precio: 400000, consumo: 0, extra: INCLUYE_MESA, mesa: true }
};
// Color de cada localidad en el correo (como en el flyer de precios).
const COLOR_TIPO = { TRB: '#FF9A3C', P1: '#FF5FBE', P2: '#A06BFF', GEN: '#3C8CFF', VIP: '#FFC84B', BKS: '#5AF05A' };

// Links de pago de Wompi de la página (una mesa por pago).
const LINKS_WOMPI = {
  '6vp9tQ': { key: 'VIP', mesas: 1 },
  bXM1pp:   { key: 'BKS', mesas: 1 }
};

// Fondos de las boletas (1080 x 1920). Se prueba la página y, si aún no está
// publicada, GitHub.
const FONDOS_URL = [
  'https://fantributecol.netlify.app/edc-preparty/ASSETS/qr-lastsummer/',
  'https://raw.githubusercontent.com/SebatjaUwU/fan-tribute-hub/master/edc-preparty/ASSETS/qr-lastsummer/'
];

const SHEET_NAME = 'Repositorio QR';
const HEADERS = [
  'Fecha', 'Evento', 'Tipo de entrada', 'Numero', 'Ticket ID',
  'Transaccion ID', 'Referencia', 'Nombre', 'Email', 'Telefono',
  'Monto COP', 'Estado', 'Email enviado', 'Escaneado', 'Fecha escaneo'
];

// ---------------------------------------------------------------- menú y hoja

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🎟️ Boletería')
    .addItem('Enviar QR de las ventas nuevas', 'enviarQRPendientes')
    .addItem('Reenviar correos que fallaron', 'reenviarCorreosPendientes')
    .addSeparator()
    .addItem('Activar lector de pagos de Wompi (mesas)', 'activarLectorWompi')
    .addItem('Revisar pagos de Wompi ahora', 'revisarCorreosWompi')
    .addSeparator()
    .addItem('Enviarme un correo de prueba', 'enviarPrueba')
    .addItem('Enviarme una prueba de cada localidad', 'enviarPruebaTodas')
    .addItem('Preparar la hoja (listas y casillas)', 'prepararHojaVentas')
    .addItem('Revisar la plantilla de la boleta', 'revisarPlantilla')
    .addToUi();
}

/** Lista desplegable de tipos, casillas y notas de ayuda en "Repositorio QR". */
function prepararHojaVentas() {
  const sh = hoja_();
  const filas = Math.max(sh.getMaxRows() - 1, 999);
  const tipos = Object.keys(TIPOS).map(function (k) { return TIPOS[k].tipo; });
  sh.getRange(2, 3, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(tipos, true).setAllowInvalid(false).build());
  sh.getRange(2, 13, filas, 2).insertCheckboxes();
  sh.getRange(1, 3).setNote('Elige el tipo de la lista. Pista: una fila = una boleta. Mesa VIP o Backstage: una fila = una mesa (se crean ' + QR_POR_MESA + ' boletas).');
  sh.getRange(1, 8).setNote('Nombre completo: de aquí salen las iniciales del código (Juan Sebastián Parra → JSP).');
  sh.getRange(1, 9).setNote('Correo del comprador: ahí le llegan las boletas.');
  sh.getRange(1, 11).setNote('Si lo dejas vacío se pone el precio del tipo.');
  sh.getRange(1, 4).setNote('NO lo escribas: se llena solo al enviar los QR.');
  sh.getRange(1, 5).setNote('NO lo escribas: se llena solo al enviar los QR.');
  sh.getRange(1, 1, 1, HEADERS.length).setBackground('#1A1236').setFontColor('#FDF4E8');
  [3, 7, 8, 9, 10, 11].forEach(function (c) { sh.getRange(1, c).setBackground('#C2410C'); });
  try { SpreadsheetApp.getUi().alert('Listo', 'La hoja "' + SHEET_NAME + '" está preparada. Las columnas naranjas son las que llenas tú.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

/**
 * Busca las filas escritas a mano (con Tipo, Nombre y Email, sin Ticket ID),
 * les pone número y código con las iniciales y manda el correo. Si el mismo
 * comprador tiene varias filas del mismo tipo, le llega un solo correo con
 * todas sus boletas.
 */
function enviarQRPendientes() {
  const sh = hoja_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const grupos = {}, orden = [], errores = [];
  try {
    const data = sh.getDataRange().getValues();
    const maxNum = {};
    for (let i = 1; i < data.length; i++) {
      const k = keyDeTipo_(data[i][2]), n = parseInt(data[i][3], 10);
      if (k && data[i][4] && !isNaN(n)) maxNum[k] = Math.max(maxNum[k] || 0, n);
    }
    for (let i = 1; i < data.length; i++) {
      const f = data[i];
      if (f[4] || (!f[2] && !f[7] && !f[8])) continue;          // ya tiene código o fila vacía
      const key = keyDeTipo_(f[2]);
      const nombre = limpiar_(f[7], 80), email = limpiar_(f[8], 120).toLowerCase();
      if (!key || !nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        errores.push('Fila ' + (i + 1) + ': revisa ' + (!key ? 'el tipo de entrada' : !nombre ? 'el nombre' : 'el correo'));
        continue;
      }
      const g = key + '|' + email + '|' + nombre.toLowerCase();
      if (!grupos[g]) { grupos[g] = { key: key, nombre: nombre, email: email, filas: [], ids: [], nums: [], tx: 'WA-' + Date.now().toString(36).toUpperCase() + orden.length }; orden.push(g); }
      const t = TIPOS[key];
      const cuantas = t.mesa ? QR_POR_MESA : 1;
      for (let q = 0; q < cuantas; q++) {
        const numero = (maxNum[key] = (maxNum[key] || 0) + 1);
        const id = codigoBoleta_(key, numero, nombre, email);
        const fila = [
          f[0] || new Date(), EVENTO, t.tipo, numero, id, grupos[g].tx, f[6] || 'WhatsApp',
          nombre, email, f[9], q > 0 ? 0 : (f[10] === '' || f[10] == null ? t.precio : f[10]), 'MANUAL'
        ];
        let r;
        if (q === 0) { r = i + 1; sh.getRange(r, 1, 1, 12).setValues([fila]); }
        else { sh.appendRow(fila.concat([false, false])); r = sh.getLastRow(); }   // boletas extra de la mesa, al final
        grupos[g].filas.push(r); grupos[g].ids.push(id); grupos[g].nums.push(numero);
      }
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  let enviados = 0, fallidos = 0;
  orden.forEach(function (g) {
    const x = grupos[g];
    try {
      enviarQR_({ email: x.email, nombre: x.nombre, key: x.key, ticketIds: x.ids, numeros: x.nums });
      x.filas.forEach(function (r) { sh.getRange(r, 13).setValue(true); });
      enviados += x.ids.length;
    } catch (err) {
      fallidos += x.ids.length;
      Logger.log('No salió el correo de ' + x.email + ': ' + err);
    }
  });

  const msg = (enviados ? '✅ ' + enviados + (enviados === 1 ? ' boleta enviada' : ' boletas enviadas') + '. ' : 'No había ventas nuevas para enviar. ') +
    (fallidos ? '⚠️ ' + fallidos + ' no salieron (usa "Reenviar correos que fallaron"). ' : '') +
    (errores.length ? '\n\nFilas sin enviar:\n' + errores.join('\n') : '');
  try { SpreadsheetApp.getUi().alert('Boletería Last Summer', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
  return msg;
}

/** Reenvía las boletas con "Email enviado" sin marcar. */
function reenviarCorreosPendientes() {
  const sh = hoja_();
  const data = sh.getDataRange().getValues();
  const grupos = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][12] === true || !data[i][8] || !data[i][4]) continue;
    const g = data[i][5] + '|' + data[i][8];
    (grupos[g] = grupos[g] || { filas: [], email: data[i][8], nombre: data[i][7], key: keyDeTipo_(data[i][2]), ids: [], nums: [] });
    grupos[g].filas.push(i + 1); grupos[g].ids.push(data[i][4]); grupos[g].nums.push(data[i][3]);
  }
  let n = 0;
  Object.keys(grupos).forEach(function (g) {
    const x = grupos[g];
    if (!x.key) return;
    try {
      enviarQR_({ email: x.email, nombre: x.nombre, key: x.key, ticketIds: x.ids, numeros: x.nums });
      x.filas.forEach(function (f) { sh.getRange(f, 13).setValue(true); });
      n += x.ids.length;
    } catch (err) {
      Logger.log('Sigue fallando el correo de ' + x.email + ': ' + err);
    }
  });
  try { SpreadsheetApp.getUi().alert('Boletería Last Summer', n ? '✅ ' + n + ' boletas reenviadas.' : 'No había correos pendientes.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

/** Te manda un correo de prueba a ti con una boleta de ejemplo (no guarda nada en la hoja). */
function enviarPrueba() {
  const yo = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  enviarQR_({ email: yo, nombre: 'Prueba Fan Tribute', key: 'TRB', ticketIds: ['LS-PFT-TRB-0001'], numeros: [1] });
  try { SpreadsheetApp.getUi().alert('Prueba enviada', 'Revisa el correo de ' + yo + '.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log('Prueba enviada a ' + yo); }
}

/** Una boleta de prueba de cada localidad (un correo por localidad). Tarda unos minutos. */
function enviarPruebaTodas() {
  const yo = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  Object.keys(TIPOS).forEach(function (k) {
    enviarQR_({ email: yo, nombre: 'Prueba Fan Tribute', key: k, ticketIds: ['LS-PFT-' + k + '-0001'], numeros: [1] });
  });
  try { SpreadsheetApp.getUi().alert('Pruebas enviadas', 'Revisa el correo de ' + yo + ': llega una por localidad.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log('Pruebas enviadas a ' + yo); }
}

// ---------------------------------------------------------------- pagos de Wompi (mesas)

const LABEL_OK = 'LS-QR-Procesado';
const LABEL_REVISAR = 'LS-QR-Revisar';
const LABEL_OTRO = 'LS-No-es-LastSummer';
const CORREOS_DESDE = '2026/11/16';
const BUSQUEDA_WOMPI = '"APROBADA" "ref." after:' + CORREOS_DESDE + ' -subject:"Revisar pago de Last Summer"' +
  ' -label:' + LABEL_OK + ' -label:' + LABEL_REVISAR + ' -label:' + LABEL_OTRO;

/** Crea el disparador que lee los pagos de Wompi cada 5 minutos (ejecútala una vez). */
function activarLectorWompi() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarCorreosWompi') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarCorreosWompi').timeBased().everyMinutes(5).create();
  [LABEL_OK, LABEL_REVISAR, LABEL_OTRO].forEach(etiqueta_);
  revisarCorreosWompi();
  try { SpreadsheetApp.getUi().alert('Lector de Wompi activo', 'Cada 5 minutos se revisan los pagos de mesas VIP y Backstage.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
}

/**
 * Lee los correos "Transacción APROBADA" de Wompi. Si el pago es de un link
 * de mesas (LINKS_WOMPI) registra las boletas, las envía y te avisa. Los
 * demás correos (Medellín, etc.) quedan con la etiqueta LS-No-es-LastSummer.
 */
function revisarCorreosWompi() {
  const ok = etiqueta_(LABEL_OK), revisar = etiqueta_(LABEL_REVISAR), otro = etiqueta_(LABEL_OTRO);
  GmailApp.search(BUSQUEDA_WOMPI, 0, 30).forEach(function (hilo) {
    let esNuestro = false, problema = false;
    hilo.getMessages().forEach(function (msg) {
      const p = leerCorreoWompi_(msg);
      if (!p || !LINKS_WOMPI[p.linkId]) return;
      esNuestro = true;
      const info = LINKS_WOMPI[p.linkId], t = TIPOS[info.key];
      try {
        if (!p.email) {
          problema = true;
          avisar_('Revisar pago de Last Summer: sin correo del comprador',
            'Wompi no trae el correo del comprador.\nAsunto: ' + msg.getSubject() + '\nFecha: ' + msg.getDate() +
            '\nAnótalo a mano en la hoja (una fila por mesa) y dale "Enviar QR de las ventas nuevas".');
          return;
        }
        const r = registrarPagoWompi_(info, p);
        if (r) {
          avisar_('Venta Wompi Last Summer: ' + t.tipo,
            r.nombre + ' (' + p.email + ', tel. ' + (p.telefono || 'sin teléfono') + ') pagó ' + info.mesas + ' x ' + t.tipo +
            ' por $' + formato_(p.monto || t.precio * info.mesas) + '.\nBoletas: ' + r.ids.join(', ') +
            '\nCorreo con QR enviado: ' + (r.enviado ? 'sí' : 'NO, usa "Reenviar correos que fallaron"'));
        }
      } catch (err) {
        problema = true;
        Logger.log('Error con el correo "' + msg.getSubject() + '": ' + err);
      }
    });
    hilo.addLabel(!esNuestro ? otro : (problema ? revisar : ok));
  });
}

/** Guarda en la hoja las boletas de una mesa pagada con Wompi y manda el correo. No duplica pagos. */
function registrarPagoWompi_(info, p) {
  const sh = hoja_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const t = TIPOS[info.key], tx = p.txId || p.referencia;
  const nombre = limpiar_(p.nombre, 80) || 'Sin nombre', email = limpiar_(p.email, 120).toLowerCase();
  const ids = [], nums = [], filas = [];
  try {
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) if (String(data[i][5]) === String(tx)) return null;   // ya registrado
    let max = 0;
    for (let i = 1; i < data.length; i++) {
      const n = parseInt(data[i][3], 10);
      if (keyDeTipo_(data[i][2]) === info.key && data[i][4] && !isNaN(n)) max = Math.max(max, n);
    }
    const total = info.mesas * (t.mesa ? QR_POR_MESA : 1);
    for (let q = 0; q < total; q++) {
      const numero = ++max, id = codigoBoleta_(info.key, numero, nombre, email);
      sh.appendRow([new Date(), EVENTO, t.tipo, numero, id, tx, p.referencia, nombre, email, p.telefono,
        q === 0 ? (p.monto || t.precio * info.mesas) : 0, 'APPROVED', false, false]);
      filas.push(sh.getLastRow()); ids.push(id); nums.push(numero);
    }
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  let enviado = false;
  try {
    enviarQR_({ email: email, nombre: nombre, key: info.key, ticketIds: ids, numeros: nums });
    filas.forEach(function (r) { sh.getRange(r, 13).setValue(true); });
    enviado = true;
  } catch (err) {
    Logger.log('No salió el correo de ' + email + ': ' + err);
  }
  return { nombre: nombre, ids: ids, enviado: enviado };
}

/** Lee del correo de Wompi: link, referencia, monto, comprador, transacción, correo y teléfono. */
function leerCorreoWompi_(msg) {
  const m = (msg.getSubject() || '').match(/ref\.\s*(\S+)/i);
  if (!m) return null;
  const cuerpo = msg.getPlainBody() || '';
  const correo = cuerpo.match(/escribiendo a\s*([^\s@]+@[^\s]+?)\s+o llamando al/i);
  const tel = cuerpo.match(/o llamando al\s*(\+?\d[\d ]*)/i);
  const monto = cuerpo.match(/COP\s*\$\s*([\d.,]+)/);
  return {
    referencia: m[1], linkId: m[1].split('_')[0],
    monto: monto ? Math.round(parseFloat(monto[1].replace(/\./g, '').replace(/,/g, ''))) : 0,
    nombre: valorTabla_(cuerpo, 'Comprador'),
    txId: valorTabla_(cuerpo, 'Transacción #') || valorTabla_(cuerpo, 'Transaccion #'),
    email: correo ? correo[1].trim() : '',
    telefono: tel ? tel[1].trim() : ''
  };
}

function valorTabla_(cuerpo, etiqueta) {
  const esc = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const misma = cuerpo.match(new RegExp(esc + '[ \\t]+([^\\r\\n]+)'));
  if (misma && misma[1].trim()) return misma[1].trim();
  const lineas = cuerpo.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (lineas[i].trim() === etiqueta) {
      for (let j = i + 1; j < Math.min(i + 4, lineas.length); j++) if (lineas[j].trim()) return lineas[j].trim();
    }
  }
  return '';
}

function etiqueta_(nombre) { return GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre); }
function avisar_(asunto, cuerpo) { GmailApp.sendEmail(AVISO_EMAIL, asunto, cuerpo, { name: 'Boletería Last Summer' }); }

// ---------------------------------------------------------------- códigos

/** Iniciales del comprador: "Juan Sebastián Parra" -> "JSP". */
function iniciales_(nombre, email) {
  const sinTildes = function (x) { return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  let limpio = sinTildes(nombre).replace(/[^a-z ]/g, ' ');
  if (limpio.trim() === 'sin nombre') limpio = '';
  const PARTICULAS = ['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do'];
  const palabras = limpio.split(' ').filter(function (w) { return w && PARTICULAS.indexOf(w) === -1; });
  let ini = palabras.slice(0, 3).map(function (w) { return w.charAt(0); }).join('');
  if (ini.length < 3 && palabras.length) ini = (ini + palabras[palabras.length - 1].slice(1)).slice(0, 3);
  if (ini.length < 3) ini = (ini + sinTildes(email).split('@')[0].replace(/[^a-z]/g, '')).slice(0, 3);
  while (ini.length < 3) ini += 'X';
  return ini.toUpperCase();
}

/** LS-<iniciales>-<tipo>-<número>, ej. LS-JSP-TRB-0007. */
function codigoBoleta_(key, numero, nombre, email) {
  return PREFIJO + '-' + iniciales_(nombre, email) + '-' + key + '-' + ('000' + numero).slice(-4);
}

function keyDeTipo_(nombre) {
  const s = String(nombre || '').trim().toLowerCase();
  for (const k in TIPOS) if (TIPOS[k].tipo.toLowerCase() === s) return k;
  return null;
}

// ---------------------------------------------------------------- imagen de la boleta

// Posiciones sobre el fondo de 1080 x 1920 px (Fondo-Tributies.gs). Se
// convierten a puntos según el ancho real de la plantilla (ancho / 1080).
const POS = {
  numero: { right: 1010, top: 150, size: 60 },       // "N° 0001" arriba a la derecha
  qr:     { x: 330, y: 1110, lado: 420 },             // dentro del recuadro blanco
  nombre: { y: 1742, size: 38 }                       // nombre · código, debajo del QR
};

/** Fondo de la boleta según la localidad (Tributies va dentro del proyecto; las demás se descargan). */
const FONDOS_CACHE_ = {};
function fondoBoleta_(key) {
  if (key === 'TRB' && typeof FONDO_TRIBUTIES_B64 !== 'undefined') {
    return Utilities.newBlob(Utilities.base64Decode(FONDO_TRIBUTIES_B64), 'image/jpeg', 'fondo-tributies.jpg');
  }
  if (FONDOS_CACHE_[key]) return FONDOS_CACHE_[key].copyBlob();
  for (let i = 0; i < FONDOS_URL.length; i++) {
    try {
      const res = UrlFetchApp.fetch(FONDOS_URL[i] + 'fondo-' + key + '.jpg', { muteHttpExceptions: true });
      if (res.getResponseCode() === 200 && /image/.test(res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || 'image')) {
        FONDOS_CACHE_[key] = res.getBlob().setName('fondo-' + key + '.jpg');
        return FONDOS_CACHE_[key].copyBlob();
      }
    } catch (err) { Logger.log('Fondo ' + key + ' no disponible en ' + FONDOS_URL[i] + ': ' + err); }
  }
  throw new Error('No se pudo descargar el fondo de la boleta ' + key);
}

/**
 * Copia la plantilla vertical en blanco (PLANTILLA_ID). Google no permite
 * crear diapositivas verticales desde código, por eso se usa un molde.
 */
function presentacionVertical_(titulo) {
  const id = String(PropertiesService.getScriptProperties().getProperty('PLANTILLA_ID') || PLANTILLA_ID || '').trim();
  if (!id || id.indexOf('PEGA_AQUI') === 0) {
    throw new Error('Falta la plantilla vertical: crea la presentación (paso a del inicio del código) y pega su ID en PLANTILLA_ID.');
  }
  const copia = DriveApp.getFileById(id).makeCopy(titulo);
  const pres = SlidesApp.openById(copia.getId());
  const w = pres.getPageWidth(), h = pres.getPageHeight();
  if (Math.abs(w / h - 1080 / 1920) > 0.02) {
    copia.setTrashed(true);
    throw new Error('La plantilla no está vertical 9:16 (mide ' + Math.round(w) + ' x ' + Math.round(h) + ' pt). ' +
      'En la presentación: Archivo > Configuración de página > Personalizado 5,625 x 10 pulgadas.');
  }
  return pres;
}

/** Ejecútala después de pegar el ID: dice si la plantilla quedó bien. */
function revisarPlantilla() {
  const pres = presentacionVertical_('tmp-revision-plantilla');
  const msg = '✅ Plantilla correcta: ' + Math.round(pres.getPageWidth()) + ' x ' + Math.round(pres.getPageHeight()) + ' pt (vertical).';
  DriveApp.getFileById(pres.getId()).setTrashed(true);
  try { SpreadsheetApp.getUi().alert('Plantilla', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log(msg); }
}

/**
 * Arma la boleta como diapositiva (fondo con el diseño + número + QR +
 * nombre y código) y la exporta como PNG. La presentación temporal se manda
 * a la papelera al terminar.
 */
function boletaPng_(b) {
  const t0 = Date.now(), paso = function (m) { Logger.log(b.id + ' · ' + m + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)'); };
  paso('copiando plantilla');
  const pres = presentacionVertical_('tmp-boleta-' + b.id);
  paso('plantilla lista');
  const presId = pres.getId();
  try {
    const PX = pres.getPageWidth() / 1080;          // puntos por cada px del diseño
    const slides = pres.getSlides();
    const slide = slides[0];
    slides.slice(1).forEach(function (s) { s.remove(); });
    slide.getPageElements().forEach(function (e) { try { e.remove(); } catch (x) {} });
    slide.getBackground().setPictureFill(fondoBoleta_(b.key));
    paso('fondo puesto');

    function texto(txt, x, y, w, h, sizePx, color, align, espacio) {
      const tb = slide.insertTextBox(txt, x, y, w, h);
      tb.getFill().setTransparent(); tb.getBorder().setTransparent();
      try { tb.setContentAlignment(SlidesApp.ContentAlignment.TOP); } catch (e) {}
      const st = tb.getText().getTextStyle();
      st.setFontFamily('Bebas Neue').setFontSize(sizePx * PX).setForegroundColor(color);
      tb.getText().getParagraphStyle().setParagraphAlignment(align).setSpaceAbove(0).setSpaceBelow(0);
      return tb;
    }

    // N° de la boleta, arriba a la derecha
    const nw = 420;
    texto('N° ' + ('000' + b.numero).slice(-4), (POS.numero.right - nw) * PX, POS.numero.top * PX - 7 * PX / 0.375, nw * PX, 90 * PX,
      POS.numero.size, '#FFC24B', SlidesApp.ParagraphAlignment.END);

    // QR dentro del recuadro blanco
    slide.insertImage(b.qr, POS.qr.x * PX, POS.qr.y * PX, POS.qr.lado * PX, POS.qr.lado * PX);

    // Nombre y código debajo del QR
    texto((b.nombre + ' · ' + b.id).toUpperCase(), 40 * PX, POS.nombre.y * PX - 7 * PX / 0.375, 1000 * PX, 64 * PX,
      POS.nombre.size, '#C3B8D9', SlidesApp.ParagraphAlignment.CENTER);

    pres.saveAndClose();
    paso('guardada, exportando imagen');
    // Imagen grande (1600 px de ancho) si está el servicio "Google Slides API";
    // si no, la exportación normal (540 px).
    if (ALTA_RESOLUCION && typeof Slides !== 'undefined') {
      try {
        const th = Slides.Presentations.Pages.getThumbnail(presId, slide.getObjectId(),
          { 'thumbnailProperties.thumbnailSize': 'LARGE', 'thumbnailProperties.mimeType': 'PNG' });
        const big = UrlFetchApp.fetch(th.contentUrl, { muteHttpExceptions: true });
        if (big.getResponseCode() === 200) return big.getBlob().setName('Boleta-' + b.id + '.png');
      } catch (err) {
        Logger.log('Imagen grande no disponible (' + err + '); se usa la normal.');
      }
    }
    const url = 'https://docs.google.com/presentation/d/' + presId + '/export/png?id=' + presId + '&pageid=' + slide.getObjectId();
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Slides devolvió ' + res.getResponseCode());
    paso('imagen lista');
    return res.getBlob().setName('Boleta-' + b.id + '.png');
  } finally {
    try { DriveApp.getFileById(presId).setTrashed(true); } catch (x) {}
  }
}

function qrPng_(id) {
  Logger.log(id + ' · generando QR');
  return UrlFetchApp.fetch('https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=0&data=' + encodeURIComponent(id))
    .getBlob().setName('QR-' + id + '.png');
}

// ---------------------------------------------------------------- correo

function enviarQR_(d) {
  const t = TIPOS[d.key];
  const color = COLOR_TIPO[d.key] || '#FF9A3C';
  const TIT = "font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;";
  const TXT = "font-family:'Bebas Neue',Arial,Helvetica,sans-serif;";
  const inline = {}, adjuntos = [];

  const bloques = d.ticketIds.map(function (id, i) {
    const numero = d.numeros && d.numeros[i] != null ? d.numeros[i] : parseInt(id.slice(-4), 10);
    const qr = qrPng_(id);
    let img;
    try {
      img = boletaPng_({ key: d.key, id: id, numero: numero, nombre: d.nombre, qr: qr.copyBlob() });
    } catch (err) {
      Logger.log('No se pudo armar la imagen de la boleta ' + id + ' (' + err + '); va solo el QR.');
      img = qr.copyBlob().setName('QR-' + id + '.png');
    }
    inline['b' + i] = img;
    adjuntos.push(img.copyBlob());
    return '<tr><td style="padding:0 0 22px;text-align:center;">' +
      '<div style="' + TIT + 'font-size:15px;letter-spacing:3px;color:' + color + ';margin:0 0 10px;">BOLETA ' + (i + 1) + ' DE ' + d.ticketIds.length + '</div>' +
      '<img src="cid:b' + i + '" width="300" alt="Boleta ' + esc_(id) + '" style="display:block;margin:0 auto;width:300px;max-width:88%;height:auto;border-radius:14px;">' +
      '<div style="' + TXT + 'font-size:15px;letter-spacing:2px;color:#C3B8D9;margin-top:10px;">' + esc_(id) + '</div>' +
      '</td></tr>';
  }).join('');

  const incluye = [];
  if (t.consumo) incluye.push('$' + formato_(t.consumo) + ' en consumo');
  if (t.extra) incluye.push(t.extra);
  const mesas = t.mesa ? Math.max(1, Math.round(d.ticketIds.length / QR_POR_MESA)) : 0;
  const resumen = t.mesa
    ? (mesas === 1 ? '1 ' + t.tipo : mesas + ' x ' + t.tipo) + ' · ' + d.ticketIds.length + ' boletas, una por persona'
    : d.ticketIds.length + ' x ' + t.tipo;

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet"></head>' +
    '<body style="margin:0;padding:0;background:#0B0618;">' +
    '<div style="background:#0B0618;padding:30px 12px;color:#FDF4E8;">' +
    '<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;">' +
    '<tr><td style="height:6px;background:#FF8C28;background:linear-gradient(90deg,#FF8C28,#FF4FA3,#3F8CFF);"></td></tr>' +
    '<tr><td style="text-align:center;padding:26px 0 6px;' + TIT + 'font-size:44px;letter-spacing:3px;color:#FDF4E8;">LAST SUMMER <span style="color:' + color + ';">2016</span></td></tr>' +
    '<tr><td style="text-align:center;padding:0 0 22px;' + TXT + 'font-size:15px;letter-spacing:3px;color:#C3B8D9;">' + esc_(FECHA_CORTA) + ' · TEATRO REPUBLIK · BOGOTÁ</td></tr>' +
    '<tr><td style="background:#140B2A;border:1px solid #2B2148;border-radius:16px;padding:24px 22px 8px;">' +
    '<p style="margin:0 0 4px;' + TIT + 'font-size:16px;letter-spacing:3px;color:' + color + ';">TUS BOLETAS ESTÁN LISTAS</p>' +
    '<p style="margin:0 0 10px;' + TIT + 'font-size:32px;letter-spacing:1px;color:#FDF4E8;">¡HOLA, ' + esc_(d.nombre).toUpperCase() + '!</p>' +
    '<p style="margin:0 0 18px;' + TXT + 'font-size:17px;line-height:1.5;letter-spacing:.5px;color:#C3B8D9;">Gracias por creer en el cierre de Fan Tribute. Aquí tienes ' +
    (d.ticketIds.length === 1 ? 'tu boleta' : 'tus ' + d.ticketIds.length + ' boletas') + ' de <strong style="color:#FDF4E8;">' + esc_(t.tipo) + '</strong>. ' +
    (t.mesa ? 'Reparte una boleta a cada persona de tu mesa: cada quien muestra su QR en la entrada.</p>' : 'Muestra el QR en la entrada desde el celular o impreso.</p>') +
    '<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 22px;">' +
    fila_(t.mesa ? 'Mesa' : 'Boleta', resumen) +
    (incluye.length ? fila_('Incluye', incluye.join(' + ')) : '') +
    fila_('Cuándo', FECHA_EVENTO) +
    fila_('Dónde', LUGAR_EVENTO) +
    fila_('Edad', '+18 · trae tu documento de identidad') +
    '</table>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;">' + bloques + '</table>' +
    '<p style="margin:0 0 18px;padding:14px 16px;background:#0B0618;border:1px solid #2B2148;border-radius:12px;' + TXT + 'font-size:15px;line-height:1.6;letter-spacing:.5px;color:#C3B8D9;">' +
    '• Cada QR sirve para <strong style="color:#FDF4E8;">una sola entrada</strong>: no lo compartas.<br>' +
    '• Las boletas van <strong style="color:#FDF4E8;">adjuntas</strong> para que las guardes en tu celular.<br>' +
    '• ¿Dudas? WhatsApp <strong style="color:#FDF4E8;">316 108 8178</strong> · Instagram <strong style="color:#FDF4E8;">@fantribute_col</strong></p>' +
    '</td></tr>' +
    '<tr><td style="text-align:center;padding:22px 0 0;' + TXT + 'font-size:13px;letter-spacing:3px;color:#7C7590;">FAN TRIBUTE · EVENTO TRIBUTO +18 · ARTISTAS NO PRESENTES</td></tr>' +
    '</table></div></body></html>';

  const texto = 'Hola ' + d.nombre + ', tus boletas para ' + EVENTO + ' (' + resumen + '): ' +
    d.ticketIds.join(', ') + '. ' + FECHA_EVENTO + ', ' + LUGAR_EVENTO + '. Las boletas van adjuntas.';
  Logger.log('Enviando correo a ' + d.email);
  GmailApp.sendEmail(d.email, 'Tus boletas · ' + EVENTO + ' · ' + t.tipo, texto, {
    htmlBody: html, inlineImages: inline, attachments: adjuntos, name: 'Fan Tribute', replyTo: AVISO_EMAIL
  });
}

function fila_(k, v) {
  return '<tr><td style="padding:9px 0;border-top:1px solid #2B2148;font-family:\'Bebas Neue\',Arial,sans-serif;font-size:14px;letter-spacing:2px;color:#FF9A3C;text-transform:uppercase;width:92px;vertical-align:top;">' + k +
    '</td><td style="padding:9px 0;border-top:1px solid #2B2148;font-family:\'Bebas Neue\',Arial,sans-serif;font-size:17px;letter-spacing:.5px;color:#FDF4E8;">' + esc_(v) + '</td></tr>';
}

// ---------------------------------------------------------------- escáner (para más adelante)

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, status: 'peticion_invalida' }); }
  if (b.action === 'scan') return json_(escanear_(b));
  return json_({ ok: false, status: 'accion_desconocida' });
}

function escanear_(b) {
  const real = PropertiesService.getScriptProperties().getProperty('STAFF_PIN');
  if (!real) return { ok: false, status: 'pin_sin_configurar' };
  if (String(b.pin || '') !== real) return { ok: false, status: 'pin_invalido' };
  const id = String(b.ticketId || '').trim().toUpperCase();
  if (!id) return { ok: false, status: 'sin_codigo' };
  const sh = hoja_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][4]).toUpperCase() !== id) continue;
    const base = { ok: true, ticketId: id, tipo: data[i][2], numero: data[i][3], nombre: data[i][7] };
    if (String(data[i][11]).toUpperCase() === 'ANULADA') return Object.assign(base, { status: 'anulada' });
    if (data[i][13] === true) return Object.assign(base, { status: 'ya_escaneado', fechaEscaneo: data[i][14] ? new Date(data[i][14]).toISOString() : '' });
    sh.getRange(i + 1, 14, 1, 2).setValues([[true, new Date()]]);
    return Object.assign(base, { status: 'valido' });
  }
  return { ok: true, status: 'no_encontrado', ticketId: id };
}

// ---------------------------------------------------------------- utilidades

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function limpiar_(v, max) { return String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max); }
function formato_(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
