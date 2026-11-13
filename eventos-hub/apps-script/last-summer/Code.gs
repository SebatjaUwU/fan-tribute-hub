/**
 * LAST SUMMER 2016 · BOGOTÁ — envío de boletas con QR
 * ===================================================
 * Proyecto de Apps Script aparte, pegado en una Google Sheet nueva solo para
 * Last Summer (Extensiones > Apps Script desde esa hoja).
 *
 * Por ahora solo TRIBUTIES, vendidas por WhatsApp:
 *   1. Anotas cada venta en la hoja "Repositorio QR" (una fila = una boleta):
 *      Tipo de entrada, Nombre, Email y, si quieres, Teléfono y Monto.
 *   2. Menú 🎟️ Boletería > "Enviar QR de las ventas nuevas".
 *   3. A cada comprador le llega un correo con sus boletas: cada una es la
 *      imagen con el diseño de Last Summer, su número, su nombre y su QR,
 *      dentro del correo y adjunta para guardarla en el celular.
 *
 * Código de cada boleta: LS-<iniciales>-TRB-<número>, ej. LS-JSP-TRB-0001
 * (Juan Sebastián Parra, Tributies, boleta 1).
 *
 * ARCHIVOS DEL PROYECTO (los dos son necesarios):
 *   Code.gs            este archivo
 *   Fondo-Tributies.gs la imagen de fondo de la boleta (no se edita)
 *
 * UNA SOLA VEZ, AL INSTALAR:
 *   a) En el editor: Servicios (+) > "Google Slides API" > Agregar.
 *      Se usa para armar la imagen vertical de cada boleta.
 *   b) Ejecuta prepararHojaVentas (crea la hoja con la lista de tipos).
 *   c) Ejecuta enviarPrueba: te llega un correo de prueba a tu cuenta.
 *      Acepta los permisos que pide Google (Sheets, Gmail, Slides, Drive).
 *
 * Opcional, para el escáner de la puerta más adelante:
 *   Propiedad de secuencia de comandos STAFF_PIN e implementar como
 *   Aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona).
 */

const EVENTO = 'Last Summer 2016';
const EVENTO_CORTO = 'LAST SUMMER 2016 · BOGOTÁ';
const FECHA_EVENTO = 'Sábado 19 de diciembre';
const FECHA_CORTA = 'SÁB 19 DIC';
const LUGAR_EVENTO = 'Bogotá · lugar por anunciar';   // cámbialo cuando se confirme el sitio
const AVISO_EMAIL = 'fantributeco@gmail.com';
const PREFIJO = 'LS';

// Localidades. Por ahora solo Tributies; las demás se activan cuando estén
// listos sus precios y diseños (quitar las // del inicio de la línea).
const TIPOS = {
  TRB: { tipo: 'Tributies', precio: 30000, consumo: 15000, extra: 'regalo especial para Tributies', frase: 'Gracias por creer hasta el final' }
  // P1:  { tipo: 'Preventa 1', precio: 0, consumo: 0, extra: '', frase: 'Acceso general · Etapa 1' },
  // P2:  { tipo: 'Preventa 2', precio: 0, consumo: 0, extra: '', frase: 'Acceso general · Etapa 2' },
  // GEN: { tipo: 'General',    precio: 0, consumo: 0, extra: '', frase: 'Acceso general' },
  // VIP: { tipo: 'VIP',        precio: 0, consumo: 0, extra: '', frase: 'Zona VIP · Acceso preferencial' },
  // BKS: { tipo: 'Backstage',  precio: 0, consumo: 0, extra: '', frase: 'All access · Staff y artistas' }
};
// Color de cada localidad en el correo (como en los diseños).
const COLOR_TIPO = { TRB: '#FF9A3C', P1: '#FF4FA3', P2: '#A45BFF', GEN: '#3F8CFF', VIP: '#FFC24B', BKS: '#3DDC97' };

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
    .addItem('Enviarme un correo de prueba', 'enviarPrueba')
    .addItem('Preparar la hoja (listas y casillas)', 'prepararHojaVentas')
    .addToUi();
}

/** Lista desplegable de tipos, casillas y notas de ayuda en "Repositorio QR". */
function prepararHojaVentas() {
  const sh = hoja_();
  const filas = Math.max(sh.getMaxRows() - 1, 999);
  const tipos = Object.keys(TIPOS).map(function (k) { return TIPOS[k].tipo; });
  sh.getRange(2, 3, filas, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(tipos, true).setAllowInvalid(false).build());
  sh.getRange(2, 13, filas, 2).insertCheckboxes();
  sh.getRange(1, 3).setNote('Elige el tipo de la lista. Una fila = una boleta.');
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
      const numero = (maxNum[key] = (maxNum[key] || 0) + 1);
      const id = codigoBoleta_(key, numero, nombre, email);
      const t = TIPOS[key];
      sh.getRange(i + 1, 1, 1, 12).setValues([[
        f[0] || new Date(), EVENTO, t.tipo, numero, id, grupos[g].tx, f[6] || 'WhatsApp',
        nombre, email, f[9], f[10] === '' || f[10] == null ? t.precio : f[10], 'MANUAL'
      ]]);
      grupos[g].filas.push(i + 1); grupos[g].ids.push(id); grupos[g].nums.push(numero);
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

/** Te manda un correo de prueba a ti con dos boletas de ejemplo (no guarda nada en la hoja). */
function enviarPrueba() {
  const yo = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  enviarQR_({ email: yo, nombre: 'Prueba Fan Tribute', key: 'TRB', ticketIds: ['LS-PFT-TRB-0000', 'LS-PFT-TRB-0001'], numeros: [0, 1] });
  try { SpreadsheetApp.getUi().alert('Prueba enviada', 'Revisa el correo de ' + yo + '.', SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { Logger.log('Prueba enviada a ' + yo); }
}

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

// Posiciones sobre el fondo de 1080 x 1920 px (Fondo-Tributies.gs).
// La diapositiva mide 405 x 720 pt, así que 1 px = 0,375 pt.
const PX = 405 / 1080;
const POS = {
  numero: { right: 1010, top: 150, size: 60 },       // "N° 0001" arriba a la derecha
  qr:     { x: 330, y: 1240, lado: 420 },             // dentro del recuadro blanco
  nombre: { y: 1708, size: 38 }                       // nombre · código, debajo del QR
};

/** Fondo de la boleta según la localidad. Por ahora solo hay diseño de Tributies. */
function fondoBoleta_(key) {
  if (key === 'TRB') return Utilities.newBlob(Utilities.base64Decode(FONDO_TRIBUTIES_B64), 'image/jpeg', 'fondo-tributies.jpg');
  throw new Error('Todavía no hay diseño de boleta para ' + key);
}

/** Crea una presentación vertical (405 x 720 pt). Necesita el servicio avanzado "Google Slides API". */
function presentacionVertical_(titulo) {
  if (typeof Slides === 'undefined') {
    throw new Error('Falta activar el servicio "Google Slides API" (Editor > Servicios + > Google Slides API).');
  }
  const p = Slides.Presentations.create({
    title: titulo,
    pageSize: { width: { magnitude: 405, unit: 'PT' }, height: { magnitude: 720, unit: 'PT' } }
  });
  return SlidesApp.openById(p.presentationId);
}

/**
 * Arma la boleta como diapositiva (fondo con el diseño + número + QR +
 * nombre y código) y la exporta como PNG. La presentación temporal se manda
 * a la papelera al terminar.
 */
function boletaPng_(b) {
  const pres = presentacionVertical_('tmp-boleta-' + b.id);
  const presId = pres.getId();
  try {
    const slide = pres.getSlides()[0];
    slide.getPageElements().forEach(function (e) { try { e.remove(); } catch (x) {} });
    slide.getBackground().setPictureFill(fondoBoleta_(b.key));

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
    texto('N° ' + ('000' + b.numero).slice(-4), (POS.numero.right - nw) * PX, POS.numero.top * PX - 7, nw * PX, 34,
      POS.numero.size, '#FFC24B', SlidesApp.ParagraphAlignment.END);

    // QR dentro del recuadro blanco
    slide.insertImage(b.qr, POS.qr.x * PX, POS.qr.y * PX, POS.qr.lado * PX, POS.qr.lado * PX);

    // Nombre y código debajo del QR
    texto((b.nombre + ' · ' + b.id).toUpperCase(), 40 * PX, POS.nombre.y * PX - 7, 1000 * PX, 24,
      POS.nombre.size, '#FDF4E8', SlidesApp.ParagraphAlignment.CENTER);

    pres.saveAndClose();
    const url = 'https://docs.google.com/presentation/d/' + presId + '/export/png?id=' + presId + '&pageid=' + slide.getObjectId();
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Slides devolvió ' + res.getResponseCode());
    return res.getBlob().setName('Boleta-' + b.id + '.png');
  } finally {
    try { DriveApp.getFileById(presId).setTrashed(true); } catch (x) {}
  }
}

function qrPng_(id) {
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

  const incluye = ['$' + formato_(t.consumo) + ' en consumo'];
  if (t.extra) incluye.push(t.extra);

  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet"></head>' +
    '<body style="margin:0;padding:0;background:#0B0618;">' +
    '<div style="background:#0B0618;padding:30px 12px;color:#FDF4E8;">' +
    '<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;">' +
    '<tr><td style="height:6px;background:#FF8C28;background:linear-gradient(90deg,#FF8C28,#FF4FA3,#3F8CFF);"></td></tr>' +
    '<tr><td style="text-align:center;padding:26px 0 6px;' + TIT + 'font-size:44px;letter-spacing:3px;color:#FDF4E8;">LAST SUMMER <span style="color:' + color + ';">2016</span></td></tr>' +
    '<tr><td style="text-align:center;padding:0 0 22px;' + TXT + 'font-size:15px;letter-spacing:3px;color:#C3B8D9;">' + esc_(FECHA_CORTA) + ' · BOGOTÁ · GRAN FINAL DEL AÑO</td></tr>' +
    '<tr><td style="background:#140B2A;border:1px solid #2B2148;border-radius:16px;padding:24px 22px 8px;">' +
    '<p style="margin:0 0 4px;' + TIT + 'font-size:16px;letter-spacing:3px;color:' + color + ';">TUS BOLETAS ESTÁN LISTAS</p>' +
    '<p style="margin:0 0 10px;' + TIT + 'font-size:32px;letter-spacing:1px;color:#FDF4E8;">¡HOLA, ' + esc_(d.nombre).toUpperCase() + '!</p>' +
    '<p style="margin:0 0 18px;' + TXT + 'font-size:17px;line-height:1.5;letter-spacing:.5px;color:#C3B8D9;">Gracias por creer en el cierre de Fan Tribute. Aquí tienes ' +
    (d.ticketIds.length === 1 ? 'tu boleta' : 'tus ' + d.ticketIds.length + ' boletas') + ' de <strong style="color:#FDF4E8;">' + esc_(t.tipo) + '</strong>. ' +
    'Muestra el QR en la entrada desde el celular o impreso.</p>' +
    '<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 22px;">' +
    fila_('Boleta', d.ticketIds.length + ' x ' + t.tipo) +
    fila_('Incluye', incluye.join(' + ')) +
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

  const texto = 'Hola ' + d.nombre + ', tus boletas para ' + EVENTO + ' (' + d.ticketIds.length + ' x ' + t.tipo + '): ' +
    d.ticketIds.join(', ') + '. ' + FECHA_EVENTO + ', ' + LUGAR_EVENTO + '. Las boletas van adjuntas.';
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
