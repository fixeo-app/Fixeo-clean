(function() {
  'use strict';

  const STORAGE_KEY = 'fixeo_client_requests';
  const listNode = document.getElementById('demandes-list');
  const emptyNode = document.getElementById('demandes-empty');
  const totalNode = document.getElementById('demandes-total');
  const urgentNode = document.getElementById('demandes-urgent');
  const toastNode = document.getElementById('demandes-toast');
  let toastTimer = null;

  function safeReadRequests() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Impossible de lire les demandes Fixeo', error);
      return [];
    }
  }

  function safeWriteRequests(requests) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
    } catch (error) {
      console.warn('Impossible de sauvegarder les demandes Fixeo', error);
    }
  }

  function normalizeRequest(raw, index) {
    const id = Number(raw?.id) || Date.now() - index;
    const date = raw?.date || new Date(id).toISOString();
    return {
      id,
      probleme: String(raw?.probleme || raw?.problem || 'Demande sans intitulé').trim(),
      ville: String(raw?.ville || 'Ville non renseignée').trim(),
      urgence: String(raw?.urgence || 'Normal').trim(),
      telephone: String(raw?.telephone || 'Non renseigné').trim(),
      date
    };
  }

  function getRequests() {
    return safeReadRequests()
      .map(normalizeRequest)
      .sort((a, b) => {
        const aValue = new Date(a.date).getTime() || a.id;
        const bValue = new Date(b.date).getTime() || b.id;
        return bValue - aValue;
      });
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date inconnue';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function buildCopyText(request) {
    return [
      'Demande client Fixeo',
      'Problème : ' + request.probleme,
      'Ville : ' + request.ville,
      'Urgence : ' + request.urgence,
      'Téléphone : ' + request.telephone,
      'Date : ' + formatDate(request.date)
    ].join('\n');
  }

  function buildArtisanMessage(request) {
    return [
      'Client à ' + request.ville + ' ' + request.probleme + ' Urgence : ' + request.urgence,
      'Disponible ? Prix ?'
    ].join('\n');
  }

  function buildArtisanWhatsappLink(request) {
    return 'https://wa.me/?text=' + encodeURIComponent(buildArtisanMessage(request));
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', 'readonly');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const result = document.execCommand('copy');
    document.body.removeChild(helper);
    return result;
  }

  function showToast(title, text) {
    if (!toastNode) return;
    toastNode.innerHTML = '<strong>' + title + '</strong><span>' + text + '</span>';
    toastNode.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastNode.classList.remove('is-visible');
    }, 2200);
  }

  function updateStats(requests) {
    if (totalNode) totalNode.textContent = String(requests.length);
    if (urgentNode) {
      urgentNode.textContent = String(
        requests.filter((request) => /urgent/i.test(request.urgence)).length
      );
    }
  }

  function removeRequest(id) {
    const current = getRequests();
    const next = current.filter((request) => request.id !== id);
    safeWriteRequests(next);
    render();
    showToast('Demande supprimée', 'La demande a été retirée de la liste locale.');
  }

  function createActionButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'request-action-btn ' + className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderCard(request) {
    const article = document.createElement('article');
    article.className = 'demandes-panel request-record';

    const top = document.createElement('div');
    top.className = 'request-record__top';

    const content = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'request-record__problem';
    title.textContent = request.probleme;

    const meta = document.createElement('div');
    meta.className = 'request-record__meta';
    meta.innerHTML = [
      '<span class="request-chip">📍 ' + request.ville + '</span>',
      '<span class="request-chip ' + (/urgent/i.test(request.urgence) ? 'request-chip--urgent' : '') + '">⏱ ' + request.urgence + '</span>',
      '<span class="request-chip">📞 ' + request.telephone + '</span>'
    ].join('');

    content.appendChild(title);
    content.appendChild(meta);

    const date = document.createElement('div');
    date.className = 'request-record__date';
    date.textContent = formatDate(request.date);

    top.appendChild(content);
    top.appendChild(date);

    const phone = document.createElement('p');
    phone.className = 'request-record__phone';
    phone.textContent = 'Téléphone : ' + request.telephone;

    const actions = document.createElement('div');
    actions.className = 'request-record__actions';

    actions.appendChild(createActionButton('Copier', '', async () => {
      try {
        await copyToClipboard(buildCopyText(request));
        showToast('Texte copié', 'La demande est prête à être collée ou transférée.');
      } catch (error) {
        console.warn('Copie impossible', error);
        showToast('Copie non disponible', 'Utilisez le bouton WhatsApp pour partager la demande.');
      }
    }));

    actions.appendChild(createActionButton('Envoyer aux artisans', 'request-action-btn--primary', () => {
      window.open(buildArtisanWhatsappLink(request), '_blank', 'noopener');
    }));

    actions.appendChild(createActionButton('Supprimer demande', 'request-action-btn--danger', () => {
      removeRequest(request.id);
    }));

    article.appendChild(top);
    article.appendChild(phone);
    article.appendChild(actions);

    return article;
  }

  function render() {
    if (!listNode) return;
    const requests = getRequests();
    updateStats(requests);
    listNode.innerHTML = '';

    if (!requests.length) {
      emptyNode.hidden = false;
      return;
    }

    emptyNode.hidden = true;
    requests.forEach((request) => {
      listNode.appendChild(renderCard(request));
    });
  }

  render();
})();
