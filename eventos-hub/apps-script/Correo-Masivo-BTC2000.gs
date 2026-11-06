/**
 * Correo masivo · BACK TO CLASSIC 2000 (Bogotá, sáb 28 nov · Algarete Zona T)
 *
 * Envía máximo 75 correos al día (deja cupo para los QR de Medellín, que usan
 * la misma cuenta). Lee los correos de la hoja, quita repetidos, anota a quién
 * ya se le envió y sigue al día siguiente solo con los que faltan.
 *
 * Pasos:
 *  1. script.google.com → Nuevo proyecto → pega este archivo.
 *  2. Sube el flyer a Google Drive, ábrelo y copia el ID del link
 *     (lo que va entre /d/ y /view) en FLYER_ID.
 *  3. Ejecuta enviarPruebaBTC()  → te llega un correo de prueba a ti.
 *  4. Si se ve bien, ejecuta iniciarMasivoBTC() → envía los primeros 75
 *     y deja programado el envío diario hasta terminar (luego se apaga solo).
 */

var HOJA_ID     = '13tybmgGnPrFhQyBYkdR5EMWU1sfraOAGhMHOoc6WFl0';
var HOJA_GID    = 0;                       // pestaña del link (gid=0)
var FLYER_ID    = 'PEGA_AQUI_EL_ID_DEL_FLYER_EN_DRIVE';
var MAX_DIA     = 75;                      // tope de la campaña por día
var RESERVA     = 20;                      // cupo que siempre se deja libre para QR
var LOG_HOJA    = 'Masivo BTC2000 enviados';
var ASUNTO      = '🪩 BACK TO CLASSIC 2000 · EDM ✕ Reggaetón · Sáb 28 nov · Algarete Zona T';
var WHATSAPP    = 'https://wa.me/573161088178?text=' + encodeURIComponent('¡Hola! Quiero mis boletas para BACK TO CLASSIC 2000 🪩');
var INSTAGRAM   = 'https://www.instagram.com/fantribute_col/';

/* ---------- Envío ---------- */

function enviarPruebaBTC() {
  var yo = Session.getEffectiveUser().getEmail();
  enviarUno_(yo, 'Prueba');
  Logger.log('Prueba enviada a ' + yo);
}

function iniciarMasivoBTC() {
  instalarDiario_();
  enviarTandaBTC();
}

function enviarTandaBTC() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.openById(HOJA_ID);
    var log = hojaLog_(ss);
    var ya = {};
    log.getDataRange().getValues().slice(1).forEach(function (r) { ya[String(r[1]).toLowerCase()] = true; });

    var pendientes = destinatarios_(ss).filter(function (d) { return !ya[d.email]; });
    if (!pendientes.length) { quitarDiario_(); Logger.log('Campaña terminada: ya se le envió a todos.'); return; }

    var cupo = Math.min(MAX_DIA - enviadosHoy_(log), MailApp.getRemainingDailyQuota() - RESERVA);
    if (cupo <= 0) { Logger.log('Sin cupo hoy. Sigue mañana. Pendientes: ' + pendientes.length); return; }

    var n = 0;
    for (var i = 0; i < pendientes.length && n < cupo; i++) {
      var d = pendientes[i];
      try {
        enviarUno_(d.email, d.nombre);
        log.appendRow([new Date(), d.email, d.nombre, 'ENVIADO']);
        n++;
      } catch (e) {
        log.appendRow([new Date(), d.email, d.nombre, 'ERROR: ' + e.message]);
      }
    }
    Logger.log('Enviados hoy en esta tanda: ' + n + ' · faltan: ' + (pendientes.length - n));
    if (pendientes.length - n <= 0) quitarDiario_();
  } finally {
    lock.releaseLock();
  }
}

function enviarUno_(email, nombre) {
  var flyer = DriveApp.getFileById(FLYER_ID).getBlob().setName('back-to-classic-2000.png');
  MailApp.sendEmail({
    to: email,
    subject: ASUNTO,
    name: 'Fan Tribute',
    replyTo: 'fantributeco@gmail.com',
    body: textoPlano_(),
    htmlBody: html_(primerNombre_(nombre)),
    inlineImages: { flyer: flyer }
  });
}

/* ---------- Hoja ---------- */

function destinatarios_(ss) {
  var sh = ss.getSheets().filter(function (s) { return s.getSheetId() === HOJA_GID; })[0] || ss.getSheets()[0];
  var datos = sh.getDataRange().getValues();
  var cab = datos[0].map(function (h) { return String(h).toLowerCase().trim(); });
  var cEmail = cab.findIndex(function (h) { return /e-?mail|correo/.test(h); });
  var cNombre = cab.findIndex(function (h) { return /nombre|name/.test(h); });
  var cEstado = cab.findIndex(function (h) { return /^estado$/.test(h); });
  if (cEmail < 0) throw new Error('No encontré una columna "Email" o "Correo" en la fila 1 de la hoja.');

  var vistos = {}, out = [];
  datos.slice(1).forEach(function (r) {
    var email = String(r[cEmail] || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || vistos[email]) return;
    if (cEstado >= 0 && /anulad/i.test(String(r[cEstado]))) return;
    vistos[email] = true;
    out.push({ email: email, nombre: cNombre >= 0 ? String(r[cNombre] || '').trim() : '' });
  });
  return out;
}

function hojaLog_(ss) {
  var sh = ss.getSheetByName(LOG_HOJA);
  if (!sh) {
    sh = ss.insertSheet(LOG_HOJA);
    sh.appendRow(['Fecha', 'Email', 'Nombre', 'Resultado']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function enviadosHoy_(log) {
  var hoy = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
  return log.getDataRange().getValues().slice(1).filter(function (r) {
    return r[0] instanceof Date && Utilities.formatDate(r[0], 'America/Bogota', 'yyyy-MM-dd') === hoy && r[3] === 'ENVIADO';
  }).length;
}

function primerNombre_(n) {
  var p = String(n || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
}

/* ---------- Programación diaria ---------- */

function instalarDiario_() {
  quitarDiario_();
  ScriptApp.newTrigger('enviarTandaBTC').timeBased().everyDays(1).atHour(10).inTimezone('America/Bogota').create();
}
function quitarDiario_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarTandaBTC') ScriptApp.deleteTrigger(t);
  });
}

/* ---------- Contenido ---------- */

function textoPlano_() {
  return [
    '🪩 BACK TO CLASSIC 2000 🪩',
    'EDM ✕ REGGAETÓN — el crossover que nadie se había atrevido a hacer 🔥',
    '',
    'Una sola noche para revivir los himnos que marcaron una generación: del eurodance y el house de Gigi D\'Agostino, Darude, Benny Benassi, Bob Sinclar, Eric Prydz, Tiësto y David Guetta… al perreo de la vieja escuela con Tego Calderón, Ivy Queen, Daddy Yankee, Don Omar, Héctor "El Father", Wisin & Yandel y Luny Tunes 💿',
    '',
    'Y para cerrar, los clásicos de los 2010s: Avicii, Swedish House Mafia, Calvin Harris, DJ Snake, Martin Garrix, Tito "El Bambino", Zion & Lennox, Arcángel, Plan B, Nicky Jam… y muchos más 🎧',
    '',
    'De 128 BPM a 95 BPM. Del drop al dembow. Toda la noche 🙌',
    '',
    '📅 Sábado 28 de noviembre',
    '🕗 8:00 PM — 5:00 AM',
    '📍 Algarete · Zona T, Bogotá',
    '🎟️ Boleta general: $35.000 con $15.000 de consumo 🧡',
    '',
    '📲 Boletas al 316 108 8178 y por DM: ' + INSTAGRAM,
    '',
    'Evento tributo +18 — Artistas no presentes'
  ].join('\n');
}

function html_(nombre) {
  var saludo = nombre ? '¡Hola, ' + esc_(nombre) + '! ' : '';
  var p = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#E9E4F2;';
  var fila = function (ic, t) {
    return '<tr><td style="padding:6px 12px 6px 0;font-size:18px;vertical-align:top;">' + ic + '</td>' +
           '<td style="padding:6px 0;font-size:16px;color:#FFFFFF;">' + t + '</td></tr>';
  };
  return '' +
  '<div style="background:#0B0A14;padding:24px 12px;font-family:Roboto,Arial,Helvetica,sans-serif;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#15121F;border-radius:14px;overflow:hidden;">' +
  '<tr><td><img src="cid:flyer" alt="Back to Classic 2000 · Sábado 28 de noviembre · Algarete Zona T" width="600" style="display:block;width:100%;height:auto;border:0;"></td></tr>' +
  '<tr><td style="padding:28px 26px 8px;">' +
    '<p style="margin:0 0 6px;font-size:13px;letter-spacing:3px;color:#3FD6F5;font-weight:bold;">EDM ✕ REGGAETÓN</p>' +
    '<h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;color:#FFFFFF;">🪩 BACK TO CLASSIC 2000 🪩</h1>' +
    '<p style="' + p + '">' + saludo + 'El crossover que nadie se había atrevido a hacer 🔥</p>' +
    '<p style="' + p + '">Una sola noche para revivir los himnos que marcaron una generación: del eurodance y el house de <b>Gigi D\'Agostino, Darude, Benny Benassi, Bob Sinclar, Eric Prydz, Tiësto y David Guetta</b>… al perreo de la vieja escuela con <b>Tego Calderón, Ivy Queen, Daddy Yankee, Don Omar, Héctor "El Father", Wisin &amp; Yandel y Luny Tunes</b> 💿</p>' +
    '<p style="' + p + '">Y para cerrar, los clásicos de los 2010s: <b>Avicii, Swedish House Mafia, Calvin Harris, DJ Snake, Martin Garrix, Tito "El Bambino", Zion &amp; Lennox, Arcángel, Plan B, Nicky Jam</b>… y muchos más 🎧</p>' +
    '<p style="' + p + 'color:#FFC93C;font-weight:bold;">De 128 BPM a 95 BPM. Del drop al dembow. Toda la noche 🙌</p>' +
  '</td></tr>' +
  '<tr><td style="padding:0 26px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #2C2740;border-bottom:1px solid #2C2740;padding:10px 0;">' +
      fila('📅', 'Sábado 28 de noviembre') +
      fila('🕗', '8:00 PM — 5:00 AM') +
      fila('📍', 'Algarete · Zona T, Bogotá') +
      fila('🎟️', 'Boleta general: <b>$35.000</b> con $15.000 de consumo 🧡') +
    '</table>' +
  '</td></tr>' +
  '<tr><td align="center" style="padding:26px 26px 10px;">' +
    '<a href="' + WHATSAPP + '" style="display:inline-block;background:#FFC93C;color:#0B0A14;text-decoration:none;font-weight:bold;font-size:17px;padding:15px 28px;border-radius:8px;">📲 Compra tu boleta por WhatsApp</a>' +
    '<p style="margin:14px 0 0;font-size:14px;color:#A9A2B6;">o escríbenos al <b style="color:#FFFFFF;">316 108 8178</b> y por DM en ' +
      '<a href="' + INSTAGRAM + '" style="color:#3FD6F5;">Instagram</a></p>' +
  '</td></tr>' +
  '<tr><td style="padding:22px 26px 26px;font-size:12px;line-height:1.5;color:#7C7590;text-align:center;">' +
    'Evento tributo +18 — Artistas no presentes · Fan Tribute ✕ Algarete<br>' +
    'Te llega este correo porque has asistido a un evento de Fan Tribute. Si no quieres recibir más, responde con la palabra BAJA.' +
  '</td></tr>' +
  '</table></div>';
}

function esc_(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}
