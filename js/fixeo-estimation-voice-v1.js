/* Shared estimation dictation. Uses the same server transcription as the hero. */
(function () {
  'use strict';
  var active = null;
  function attach(input) {
    if (input.dataset.rafiVoice) return;
    input.dataset.rafiVoice = '1';
    var bar = document.createElement('div');
    bar.className = 'rafi-dictation';
    var button = document.createElement('button');
    button.type = 'button';
    var language = document.createElement('select');
    language.setAttribute('aria-label', 'Langue de dictée');
    [['fr-FR', 'Français'], ['ar-MA', 'الدارجة']].forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0]; option.textContent = entry[1]; language.appendChild(option);
    });
    var status = document.createElement('span');
    status.className = 'rafi-dictation-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Dictez, puis relisez avant de continuer.';
    bar.appendChild(button); bar.appendChild(language); bar.appendChild(status);
    if (input.id === 'fxep-nlp-input') input.parentNode.parentNode.insertBefore(bar, input.parentNode.nextSibling);
    else input.parentNode.insertBefore(bar, input.nextSibling);
    var recorder, stream, timer, controller, generation = 0, phase = 'idle';
    function release() {
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    function idle() {
      phase = 'idle'; button.disabled = false; language.disabled = false;
      button.innerHTML = "<svg\n      class=\"rafi-mic-icon\" aria-hidden=\"true\" focusable=\"false\" style=\"display:inline-block;vertical-align:-3px;margin-right:8px;flex-shrink:0\"\n      viewBox=\"0 0 24 24\"\n      width=\"18\"\n      height=\"18\"\n      fill=\"none\"\n      xmlns=\"http://www.w3.org/2000/svg\">\n\n      <rect\n        x=\"8\"\n        y=\"3\"\n        width=\"8\"\n        height=\"12\"\n        rx=\"4\"\n        stroke=\"currentColor\"\n        stroke-width=\"1.7\"/>\n\n      <path\n        d=\"M5.8 11.5C5.8 15 8.55 17.7 12 17.7C15.45 17.7 18.2 15 18.2 11.5\"\n        stroke=\"currentColor\"\n        stroke-width=\"1.7\"\n        stroke-linecap=\"round\"/>\n\n      <path\n        d=\"M12 17.7V21\"\n        stroke=\"currentColor\"\n        stroke-width=\"1.7\"\n        stroke-linecap=\"round\"/>\n\n      <path\n        d=\"M9.5 21H14.5\"\n        stroke=\"currentColor\"\n        stroke-width=\"1.7\"\n        stroke-linecap=\"round\"/>\n\n    </svg>Parler à RAFI"; button.setAttribute('aria-pressed', 'false');
      if (active === cancel) active = null;
    }
    function cancel() {
      generation++;
      if (controller) controller.abort();
      if (recorder && recorder.state === 'recording') recorder.stop();
      release(); idle();
      status.textContent = 'Dictée interrompue. Votre texte est conservé.';
    }
    idle();
    var supported = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder;
    if (!supported) {
      button.disabled = true; language.disabled = true;
      status.textContent = 'Micro indisponible ici. Vous pouvez écrire votre besoin.';
    }
    button.addEventListener('click', async function () {
      if (phase === 'recording') { recorder.stop(); return; }
      if (phase !== 'idle') return;
      if (active) active();
      active = cancel;
      var ticket = ++generation, chunks = [], lang = language.value;
      phase = 'permission'; button.disabled = true; language.disabled = true;
      status.textContent = 'Autorisez le micro pour dicter votre besoin.';
      try {
        var acquired = await navigator.mediaDevices.getUserMedia({audio: true});
        if (ticket !== generation || !input.isConnected) { acquired.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = acquired;
        recorder = new MediaRecorder(stream);
        recorder.addEventListener('dataavailable', function (event) { if (event.data.size) chunks.push(event.data); });
        recorder.addEventListener('error', function () { cancel(); status.textContent = 'Enregistrement impossible. Réessayez ou écrivez votre besoin.'; });
        recorder.addEventListener('stop', async function () {
          release();
          if (ticket !== generation) return;
          phase = 'transcribing'; button.disabled = true; button.textContent = 'RAFI transcrit…';
          status.textContent = 'Transcription en cours…';
          controller = new AbortController();
          timer = setTimeout(function () { controller.abort(); }, 30000);
          try {
            var blob = new Blob(chunks, {type: recorder.mimeType || 'audio/webm'});
            if (!blob.size) throw Error('empty');
            var form = new FormData();
            form.append('audio', blob, 'rafi-voice.' + (blob.type.indexOf('mp4') !== -1 ? 'm4a' : 'webm'));
            form.append('language', lang);
            var response = await fetch('/api/rafi-transcribe', {method: 'POST', body: form, signal: controller.signal});
            var data = await response.json();
            if (!response.ok || !data.ok || typeof data.text !== 'string' || !data.text.trim()) throw Error('transcription');
            if (ticket !== generation || !input.isConnected) return;
            var transcript = data.text.trim(), current = input.value.trim();
            var combined = current ? current + '\n' + transcript : transcript;
            var limit = input.maxLength > 0 ? input.maxLength : 2000;
            if (combined.length > limit) {
              status.textContent = 'Votre texte est trop long. Raccourcissez-le avant de recommencer la dictée.';
            } else {
              input.value = combined;
              input.dispatchEvent(new Event('input', {bubbles: true}));
              status.textContent = 'Dictée ajoutée. Relisez et corrigez si nécessaire.';
            }
          } catch (_) {
            if (ticket === generation) status.textContent = 'Transcription indisponible. Réessayez ou écrivez votre besoin.';
          } finally {
            if (ticket === generation) { clearTimeout(timer); idle(); }
          }
        });
        recorder.start(); phase = 'recording'; button.disabled = false;
        button.textContent = '■ Terminer la dictée'; button.setAttribute('aria-pressed', 'true');
        status.textContent = 'RAFI vous écoute… 20 secondes maximum.';
        timer = setTimeout(function () { if (recorder.state === 'recording') recorder.stop(); }, 20000);
      } catch (_) {
        if (ticket === generation) { release(); idle(); status.textContent = 'Micro inaccessible. Autorisez-le dans votre navigateur ou écrivez votre besoin.'; }
      }
    });
    input._rafiCancelDictation = cancel;
  }
  function scan() {
    document.querySelectorAll('#fxep-nlp-input, .estimator-need-input').forEach(attach);
    if (active) {
      var visible = Array.from(document.querySelectorAll('[data-rafi-voice]')).some(function (input) {
        return input._rafiCancelDictation === active && input.getClientRects().length;
      });
      if (!visible) active();
    }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden && active) active(); });
  window.addEventListener('pagehide', function () { if (active) active(); });
  document.addEventListener('click', function (event) {
    if (active && !event.target.closest('.rafi-dictation')) active();
  }, true);
  new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden']});
  scan();
})();
