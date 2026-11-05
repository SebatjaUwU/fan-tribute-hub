/**
 * ENCUESTA DE SATISFACCIÓN · BACK TO HALLOWEEN 2016
 * ==================================================
 * Archivo aparte para agregar al proyecto de Apps Script de Halloween (el que
 * tiene la hoja "Repositorio QR" con los compradores). No reemplaza nada:
 * en el editor, "+" junto a Archivos > Secuencia de comandos > nómbralo
 * "Encuesta" y pega este código.
 *
 * Pasos:
 *   1. Ejecuta crearEncuestaHalloween()  → crea el Google Form y una pestaña
 *      "Respuestas encuesta" en la hoja. En el registro (Ver > Registros)
 *      quedan el link para responder y el link para editar el formulario.
 *   2. Ejecuta enviarEncuestaPrueba()    → te llega el correo a ti para revisarlo.
 *   3. Ejecuta enviarEncuestaHalloween() → la manda a cada comprador una sola
 *      vez. Gmail gratis permite ~100 correos al día por cuenta, y esta misma
 *      cuenta manda las boletas de Medellín, así que se envían máximo
 *      ENCUESTA_POR_DIA por día; si faltan, sigue sola al día siguiente.
 *
 * Quién la recibe: correos únicos de "Repositorio QR" cuyo Evento contiene
 * "Halloween" y que no estén ANULADA. Los envíos quedan en la pestaña
 * "Encuesta enviados" (si algo falla, se puede volver a ejecutar sin repetir).
 */

const ENCUESTA_EVENTO = 'Back to Halloween 2016';
const ENCUESTA_FILTRO = 'halloween';          // se busca en la columna Evento
const ENCUESTA_POR_DIA = 60;                  // deja cupo para las boletas de Medellín
const ENCUESTA_HOJA_ENVIOS = 'Encuesta enviados';
const ENCUESTA_ASUNTO = '¿Cómo la pasaste en Back to Halloween 2016? 🎃 (2 min)';

/** 1) Crea el formulario de la encuesta (ejecutar UNA vez). */
function crearEncuestaHalloween() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ENCUESTA_URL')) {
    Logger.log('La encuesta ya existe: ' + props.getProperty('ENCUESTA_URL') + '\nEditar: ' + props.getProperty('ENCUESTA_EDITAR'));
    return;
  }
  const form = FormApp.create('Encuesta · ' + ENCUESTA_EVENTO);
  form.setTitle(ENCUESTA_EVENTO + ' · ¿Cómo la pasaste?')
    .setDescription('Gracias por estar en ' + ENCUESTA_EVENTO + '. Son 2 minutos y nos ayudan a que el próximo evento sea todavía mejor. Las respuestas son anónimas.')
    .setConfirmationMessage('¡Gracias! 🧡 Leemos cada respuesta. Nos vemos en el próximo Fan Tribute.')
    .setCollectEmail(false)
    .setProgressBar(true);

  form.addScaleItem().setTitle('En general, ¿qué tan satisfecho quedaste con el evento?')
    .setBounds(1, 5).setLabels('Nada satisfecho', 'Muy satisfecho').setRequired(true);
  form.addScaleItem().setTitle('¿Qué tan probable es que recomiendes Fan Tribute a un amigo?')
    .setBounds(0, 10).setLabels('Nada probable', 'Muy probable').setRequired(true);
  form.addGridItem().setTitle('Califica cada aspecto (1 = muy malo, 5 = excelente)')
    .setRows(['Música y DJs', 'Sonido', 'Luces y ambiente', 'Temática y decoración de Halloween', 'El lugar', 'Ingreso y lectura del QR', 'Bar y consumo', 'Atención del staff', 'Seguridad', 'Precio frente a lo que recibiste'])
    .setColumns(['1', '2', '3', '4', '5', 'No aplica']);
  form.addParagraphTextItem().setTitle('¿Qué fue lo que más te gustó?');
  form.addParagraphTextItem().setTitle('¿Qué deberíamos mejorar para el próximo evento?').setRequired(true);
  form.addCheckboxItem().setTitle('¿Qué te gustaría para los próximos eventos?')
    .setChoiceValues(['Más EDM de los 2010s', 'Clásicos de los 2000 (EDM y reggaetón)', 'Reggaetón clásico', 'Más eventos de Halloween o temáticos', 'Eventos en otras ciudades', 'Zonas VIP y Backstage'])
    .showOtherOption(true);
  form.addMultipleChoiceItem().setTitle('¿Cómo te enteraste del evento?')
    .setChoiceValues(['Instagram', 'TikTok', 'WhatsApp', 'Un amigo', 'Ya conocía Fan Tribute'])
    .showOtherOption(true);
  form.addMultipleChoiceItem().setTitle('¿Volverías a un evento de Fan Tribute?')
    .setChoiceValues(['Sí, seguro', 'Tal vez', 'No']).setRequired(true);
  form.addTextItem().setTitle('Si quieres que te contactemos por tu respuesta, deja tu WhatsApp o correo (opcional)');

  // Las respuestas quedan en una pestaña de esta misma hoja
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  Utilities.sleep(2000);
  ss.getSheets().forEach(function (sh) {
    try {
      if (sh.getFormUrl() && sh.getFormUrl().indexOf(form.getId()) !== -1) sh.setName('Respuestas encuesta');
    } catch (e) {}
  });

  const url = form.shortenFormUrl(form.getPublishedUrl());
  props.setProperty('ENCUESTA_URL', url);
  props.setProperty('ENCUESTA_EDITAR', form.getEditUrl());
  Logger.log('Encuesta creada.\nLink para responder: ' + url + '\nLink para editar: ' + form.getEditUrl());
}

/** 2) Te manda el correo de la encuesta a ti, para revisarlo. */
function enviarEncuestaPrueba() {
  enviarCorreoEncuesta_(Session.getActiveUser().getEmail(), 'Fan Tribute');
  Logger.log('Correo de prueba enviado a ' + Session.getActiveUser().getEmail());
}

/** 3) Envía la encuesta a los compradores (una vez por correo). */
function enviarEncuestaHalloween() {
  const url = PropertiesService.getScriptProperties().getProperty('ENCUESTA_URL');
  if (!url) throw new Error('Primero ejecuta crearEncuestaHalloween().');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const repo = ss.getSheetByName('Repositorio QR');
  let envios = ss.getSheetByName(ENCUESTA_HOJA_ENVIOS);
  if (!envios) {
    envios = ss.insertSheet(ENCUESTA_HOJA_ENVIOS);
    envios.appendRow(['Fecha envío', 'Email', 'Nombre']);
    envios.setFrozenRows(1);
  }
  const yaEnviados = {};
  envios.getDataRange().getValues().slice(1).forEach(function (f) { yaEnviados[String(f[1]).toLowerCase()] = true; });

  // Compradores únicos del evento
  const pendientes = [], vistos = {};
  repo.getDataRange().getValues().slice(1).forEach(function (f) {
    const evento = String(f[1] || '').toLowerCase();
    const email = String(f[8] || '').trim().toLowerCase();
    const estado = String(f[11] || '').toUpperCase();
    if (evento.indexOf(ENCUESTA_FILTRO) === -1 || estado === 'ANULADA') return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || vistos[email] || yaEnviados[email]) return;
    vistos[email] = true;
    pendientes.push({ email: email, nombre: String(f[7] || '').trim() });
  });

  const cupoGmail = MailApp.getRemainingDailyQuota() - 25;   // margen para boletas y avisos
  const tanda = Math.max(0, Math.min(ENCUESTA_POR_DIA, cupoGmail, pendientes.length));
  let enviados = 0;
  for (let i = 0; i < tanda; i++) {
    const p = pendientes[i];
    try {
      enviarCorreoEncuesta_(p.email, p.nombre);
      envios.appendRow([new Date(), p.email, p.nombre]);
      enviados++;
      Utilities.sleep(400);
    } catch (err) {
      Logger.log('No salió a ' + p.email + ': ' + err);
      if (String(err).indexOf('quota') !== -1 || String(err).indexOf('cuota') !== -1) break;
    }
  }

  const faltan = pendientes.length - enviados;
  programarSiguienteTanda_(faltan > 0);
  const msg = 'Encuesta enviada a ' + enviados + ' personas. ' +
    (faltan > 0 ? 'Faltan ' + faltan + ': se envían solas mañana (máximo ' + ENCUESTA_POR_DIA + ' por día).' : 'Ya les llegó a todos los compradores.');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Encuesta ' + ENCUESTA_EVENTO, msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}

function programarSiguienteTanda_(hayMas) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarEncuestaHalloween') ScriptApp.deleteTrigger(t);
  });
  if (hayMas) ScriptApp.newTrigger('enviarEncuestaHalloween').timeBased().everyDays(1).atHour(10).create();
}

function enviarCorreoEncuesta_(email, nombre) {
  const url = PropertiesService.getScriptProperties().getProperty('ENCUESTA_URL');
  const primer = (String(nombre || '').trim().split(/\s+/)[0] || '').toLowerCase();
  const saludo = primer && primer !== 'sin' ? primer.charAt(0).toUpperCase() + primer.slice(1) : '';
  const F = "font-family:Roboto,'Helvetica Neue',Arial,sans-serif;";
  const html =
    '<div style="background:#0B0805;padding:30px 12px;' + F + 'color:#F5EBDD;">' +
    '<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;border-collapse:collapse;">' +
    '<tr><td style="text-align:center;padding:0 0 16px;' + F + 'font-size:12px;font-weight:700;letter-spacing:3px;color:#FF7A1A;text-transform:uppercase;">Fan Tribute · Back to Halloween 2016</td></tr>' +
    '<tr><td style="background:#16110C;border:1px solid #2E2318;padding:28px 26px;">' +
    '<p style="margin:0 0 10px;' + F + 'font-size:26px;font-weight:900;color:#F5EBDD;">' + (saludo ? '¡Hola, ' + escEnc_(saludo) + '!' : '¡Hola!') + ' 🎃</p>' +
    '<p style="margin:0 0 14px;' + F + 'font-size:15px;line-height:1.65;color:#D8CBB8;">Gracias por venir a <strong style="color:#F5EBDD;">Back to Halloween 2016</strong>. Fue una noche increíble y queremos que la próxima sea todavía mejor.</p>' +
    '<p style="margin:0 0 22px;' + F + 'font-size:15px;line-height:1.65;color:#D8CBB8;">¿Nos regalas <strong style="color:#F5EBDD;">2 minutos</strong> para contarnos qué te gustó y qué mejorarías? Es anónima y leemos cada respuesta.</p>' +
    '<p style="margin:0 0 22px;text-align:center;"><a href="' + url + '" style="display:inline-block;padding:15px 26px;background:#FF7A1A;color:#0B0805;text-decoration:none;' + F +
    'font-size:15px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase;">Responder la encuesta</a></p>' +
    '<p style="margin:0;' + F + 'font-size:13px;line-height:1.6;color:#9C8E7B;">Si el botón no abre, copia este link: <a href="' + url + '" style="color:#FF9A4D;">' + url + '</a></p>' +
    '</td></tr>' +
    '<tr><td style="text-align:center;padding:18px 0 0;' + F + 'font-size:12px;line-height:1.7;color:#7E705E;">Síguenos en Instagram y TikTok <strong style="color:#D8CBB8;">@fantribute_col</strong> para enterarte primero de lo que viene.</td></tr>' +
    '</table></div>';
  const texto = (saludo ? 'Hola ' + saludo : 'Hola') + ', gracias por venir a Back to Halloween 2016. ¿Nos regalas 2 minutos para contarnos qué te gustó y qué mejorarías? ' + url;
  const opciones = { htmlBody: html, name: 'Fan Tribute' };
  if (typeof enviarCorreo_ === 'function') enviarCorreo_(email, ENCUESTA_ASUNTO, texto, opciones);
  else GmailApp.sendEmail(email, ENCUESTA_ASUNTO, texto, opciones);
}

function escEnc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
