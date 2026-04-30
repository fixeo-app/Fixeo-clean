(function (window, document) {
  'use strict';

  const CONVERSATION_KEY = 'fixeo_chat_conversations_v1';
  const MESSAGE_KEY = 'fixeo_chat_messages_v1';
  const PRESENCE_KEY = 'fixeo_chat_presence_v1';
  const ACTIVE_KEY = 'fixeo_chat_active_conversation_v1';
  const ARTISAN_FALLBACK = { id: 'art_demo_1', name: 'Karim Benali', service: 'Plomberie' };
  const CLIENT_FALLBACK = { id: 'client_demo_1', name: 'Sarah Alami' };

  function parseJSON(value, fallback) {
    try { return JSON.parse(value); } catch (error) { return fallback; }
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatTime(value) {
    const date = new Date(value || nowIso());
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatConversationTime(value) {
    const date = new Date(value || nowIso());
    const diff = Date.now() - date.getTime();
    if (diff < 60 * 1000) return 'à l’instant';
    if (diff < 60 * 60 * 1000) return Math.max(1, Math.round(diff / 60000)) + ' min';
    if (diff < 24 * 60 * 60 * 1000) return formatTime(value);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  function formatDay(value) {
    const date = new Date(value || nowIso());
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function getPageName() {
    const path = window.location.pathname || '';
    return path.split('/').pop() || 'index.html';
  }

  function getStoredName() {
    const direct = localStorage.getItem('fixeo_user_name');
    if (direct && direct.trim()) return direct.trim();
    const legacy = parseJSON(localStorage.getItem('user'), null);
    if (legacy && legacy.name) return String(legacy.name).trim();
    return '';
  }

  function getCurrentUser() {
    const page = getPageName();
    const dashType = document.body && document.body.dataset ? document.body.dataset.dashType : '';
    const storedRole = localStorage.getItem('fixeo_role') || localStorage.getItem('role') || '';
    const storedId = localStorage.getItem('fixeo_user') || localStorage.getItem('user_id') || '';
    const storedName = getStoredName();
    const isArtisanPage = dashType === 'artisan' || storedRole === 'artisan' || page === 'dashboard-artisan.html';
    if (isArtisanPage) {
      return {
        role: 'artisan',
        id: storedId || ARTISAN_FALLBACK.id,
        name: storedName || ARTISAN_FALLBACK.name,
        service: localStorage.getItem('fixeo_artisan_service') || ARTISAN_FALLBACK.service
      };
    }
    return {
      role: 'client',
      id: storedId || CLIENT_FALLBACK.id,
      name: storedName || CLIENT_FALLBACK.name,
      service: ''
    };
  }

  function getDefaultQuickReplies(role) {
    return role === 'artisan'
      ? ['Oui, je suis disponible cet\u2011après-midi', 'Proposition : 200 MAD', 'Pouvez-vous partager des photos ?']
      : ['Êtes-vous disponible aujourd’hui ?', 'Quel est votre prix ?', 'Je peux vous envoyer des photos'];
  }

  function normalizeConversation(raw) {
    return {
      id: String(raw && raw.id || uid('conv')),
      mission_id: String(raw && raw.mission_id || uid('mission')),
      client_id: String(raw && raw.client_id || CLIENT_FALLBACK.id),
      artisan_id: String(raw && raw.artisan_id || ARTISAN_FALLBACK.id),
      client_name: String(raw && raw.client_name || CLIENT_FALLBACK.name),
      artisan_name: String(raw && raw.artisan_name || ARTISAN_FALLBACK.name),
      artisan_service: String(raw && raw.artisan_service || ARTISAN_FALLBACK.service),
      mission_label: String(raw && raw.mission_label || 'Mission Fixeo'),
      created_at: raw && raw.created_at || nowIso(),
      updated_at: raw && raw.updated_at || raw && raw.created_at || nowIso(),
      last_price: Number(raw && raw.last_price || 0),
      price_accepted: !!(raw && raw.price_accepted)
    };
  }

  function normalizeMessage(raw) {
    return {
      id: String(raw && raw.id || uid('msg')),
      conversation_id: String(raw && raw.conversation_id || ''),
      sender_id: String(raw && raw.sender_id || 'system'),
      receiver_id: String(raw && raw.receiver_id || 'global'),
      message: String(raw && raw.message || ''),
      type: String(raw && raw.type || 'text'),
      created_at: raw && raw.created_at || nowIso(),
      seen_at: raw && raw.seen_at || null,
      meta: raw && raw.meta || {}
    };
  }

  function readConversations() {
    return parseJSON(localStorage.getItem(CONVERSATION_KEY), []).map(normalizeConversation);
  }

  function writeConversations(items) {
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(items.map(normalizeConversation)));
  }

  function readMessages() {
    return parseJSON(localStorage.getItem(MESSAGE_KEY), []).map(normalizeMessage);
  }

  function writeMessages(items) {
    localStorage.setItem(MESSAGE_KEY, JSON.stringify(items.map(normalizeMessage)));
  }

  function readPresence() {
    // JSON.parse(null) returns null (not an error), so we must guard explicitly
    var raw = localStorage.getItem(PRESENCE_KEY);
    if (!raw) return {};
    try { var parsed = JSON.parse(raw); return parsed && typeof parsed === 'object' ? parsed : {}; } catch (_) { return {}; }
  }

  function writePresence(presence) {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
  }

  function getMissionSystem() {
    return window.FixeoMissionSystem || null;
  }

  function getMissionList() {
    const missionSystem = getMissionSystem();
    if (!missionSystem || typeof missionSystem.list !== 'function') return [];
    try { return missionSystem.list(); } catch (error) { return []; }
  }

  function detectPrice(text) {
    const value = String(text || '');
    const match = value.match(/(?:proposition\s*:?)?\s*(\d{2,5})\s*(?:mad|dh|dhs)?/i);
    if (!match) return 0;
    return Math.round(Number(match[1]) || 0);
  }

  function isPriceMessage(message) {
    if (!message) return false;
    if (message.type === 'price') return true;
    return detectPrice(message.message) > 0;
  }

  function getConversationOtherParty(conversation, user) {
    if (user.role === 'artisan') {
      return { id: conversation.client_id, name: conversation.client_name, service: 'Client Fixeo', role: 'client' };
    }
    return { id: conversation.artisan_id, name: conversation.artisan_name, service: conversation.artisan_service || ARTISAN_FALLBACK.service, role: 'artisan' };
  }

  function getConversationMessages(conversationId) {
    return readMessages()
      .filter(function (message) { return message.conversation_id === conversationId; })
      .sort(function (a, b) { return new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); });
  }

  function getUnreadCountForConversation(conversation, user) {
    return getConversationMessages(conversation.id).filter(function (message) {
      return message.receiver_id === user.id && !message.seen_at;
    }).length;
  }

  function findConversationByMission(missionId) {
    return readConversations().find(function (conversation) { return conversation.mission_id === missionId; }) || null;
  }

  function upsertConversation(input) {
    const conversations = readConversations();
    const normalized = normalizeConversation(input);
    const index = conversations.findIndex(function (conversation) {
      return conversation.id === normalized.id || conversation.mission_id === normalized.mission_id;
    });
    if (index >= 0) {
      conversations[index] = Object.assign({}, conversations[index], normalized, { updated_at: nowIso() });
    } else {
      conversations.unshift(normalized);
    }
    writeConversations(conversations);
    return normalizeConversation(index >= 0 ? conversations[index] : normalized);
  }

  function updateConversation(conversationId, updater) {
    const conversations = readConversations();
    const index = conversations.findIndex(function (conversation) { return conversation.id === conversationId; });
    if (index === -1) return null;
    conversations[index] = normalizeConversation(updater(Object.assign({}, conversations[index])));
    writeConversations(conversations);
    return conversations[index];
  }

  function appendMessage(payload) {
    const messages = readMessages();
    const message = normalizeMessage(payload);
    messages.push(message);
    writeMessages(messages);
    updateConversation(message.conversation_id, function (conversation) {
      conversation.updated_at = message.created_at;
      if (isPriceMessage(message)) conversation.last_price = detectPrice(message.message);
      return conversation;
    });
    return message;
  }

  function notifyUser(receiverId, title, message, type, meta) {
    if (!window.notifications || typeof window.notifications.createNotification !== 'function') return;
    window.notifications.createNotification(receiverId, message, type || 'new_message', {
      title: title,
      action_href: window.location.pathname.split('/').pop() || 'dashboard-client.html',
      meta: meta || {}
    });
  }

  function buildConversationFromMission(mission) {
    const proposal = (mission.proposals || [])[0] || {};
    return normalizeConversation({
      id: findConversationByMission(mission.id) ? findConversationByMission(mission.id).id : uid('conv'),
      mission_id: mission.id,
      client_id: mission.client_id || CLIENT_FALLBACK.id,
      artisan_id: mission.artisan_id || mission.target_artisan_id || proposal.artisan_id || ARTISAN_FALLBACK.id,
      client_name: mission.client_name || CLIENT_FALLBACK.name,
      artisan_name: mission.artisan_name || mission.target_artisan_name || proposal.artisan_name || ARTISAN_FALLBACK.name,
      artisan_service: mission.service || ARTISAN_FALLBACK.service,
      mission_label: (mission.service || 'Mission') + ' • ' + (mission.city || 'Casablanca'),
      created_at: mission.created_at || nowIso(),
      updated_at: mission.updated_at || mission.created_at || nowIso(),
      last_price: Number(mission.final_price || proposal.price || 0),
      price_accepted: !!mission.price_validated
    });
  }

  function ensureConversationForMission(mission) {
    const existing = findConversationByMission(mission.id);
    if (existing) return existing;
    const conversation = upsertConversation(buildConversationFromMission(mission));
    const messages = getConversationMessages(conversation.id);
    if (!messages.length) {
      const firstPrice = Number(mission.final_price || (mission.proposals && mission.proposals[0] && mission.proposals[0].price) || 200);
      appendMessage({
        conversation_id: conversation.id,
        sender_id: conversation.client_id,
        receiver_id: conversation.artisan_id,
        message: 'Bonjour, êtes-vous disponible aujourd’hui ?',
        type: 'text',
        created_at: mission.created_at || nowIso()
      });
      appendMessage({
        conversation_id: conversation.id,
        sender_id: conversation.artisan_id,
        receiver_id: conversation.client_id,
        message: 'Oui, je suis disponible cet après-midi. Proposition : ' + firstPrice + ' MAD',
        type: 'price',
        created_at: mission.created_at || nowIso(),
        meta: { amount: firstPrice }
      });
    }
    return conversation;
  }

  function ensureMissionBackedConversations() {
    getMissionList().forEach(function (mission) {
      const hasArtisan = mission.artisan_id || mission.target_artisan_id || (mission.proposals || []).length;
      if (hasArtisan) ensureConversationForMission(mission);
    });
  }

  function ensureProfileDraftConversation() {
    const currentUser = api.currentUser;
    const missionId = 'profile-karim-benali';
    const existing = findConversationByMission(missionId);
    if (existing) return existing;
    const conversation = upsertConversation({
      mission_id: missionId,
      client_id: currentUser.id,
      artisan_id: ARTISAN_FALLBACK.id,
      client_name: currentUser.name,
      artisan_name: ARTISAN_FALLBACK.name,
      artisan_service: ARTISAN_FALLBACK.service,
      mission_label: 'Prise de contact • Casablanca',
      created_at: nowIso(),
      updated_at: nowIso()
    });
    appendMessage({
      conversation_id: conversation.id,
      sender_id: conversation.artisan_id,
      receiver_id: conversation.client_id,
      message: 'Bonjour, je peux vous aider rapidement. Quel est votre besoin ?',
      type: 'text'
    });
    return conversation;
  }

  function markConversationSeen(conversationId) {
    const currentUser = api.currentUser;
    const messages = readMessages();
    let changed = false;
    messages.forEach(function (message) {
      if (message.conversation_id === conversationId && message.receiver_id === currentUser.id && !message.seen_at) {
        message.seen_at = nowIso();
        changed = true;
      }
    });
    if (changed) writeMessages(messages);
  }

  function ensurePriceAccepted(conversation, amount) {
    let missionId = conversation.mission_id;
    const missionSystem = getMissionSystem();
    if (missionSystem && typeof missionSystem.get === 'function' && !missionSystem.get(missionId) && typeof missionSystem.createMissionFromQuote === 'function') {
      const created = missionSystem.createMissionFromQuote({
        artisanId: conversation.artisan_id,
        artisanName: conversation.artisan_name,
        service: conversation.artisan_service || 'Plomberie',
        city: 'Casablanca',
        description: 'Conversation démarrée depuis le profil artisan',
        suggestedPrice: amount
      });
      if (created && created.id) {
        missionId = created.id;
        updateConversation(conversation.id, function (draft) {
          draft.mission_id = missionId;
          draft.mission_label = (created.service || draft.artisan_service) + ' • ' + (created.city || 'Casablanca');
          return draft;
        });
      }
    }
    if (missionSystem && typeof missionSystem.chooseArtisan === 'function' && typeof missionSystem.validatePrice === 'function') {
      missionSystem.chooseArtisan(missionId, conversation.artisan_id);
      missionSystem.validatePrice(missionId, amount);
    }
    updateConversation(conversation.id, function (item) {
      item.mission_id = missionId;
      item.last_price = amount;
      item.price_accepted = true;
      item.updated_at = nowIso();
      return item;
    });
    appendMessage({
      conversation_id: conversation.id,
      sender_id: 'system',
      receiver_id: conversation.artisan_id,
      message: 'Prix accepté : ' + amount + ' MAD. La mission passe en statut acceptée.',
      type: 'system',
      meta: { amount: amount, action: 'price_accepted' }
    });
    notifyUser(conversation.artisan_id, 'Prix accepté', api.currentUser.name + ' a accepté votre prix de ' + amount + ' MAD.', 'mission_accepted', {
      mission_id: missionId,
      amount: amount,
      conversation_id: conversation.id
    });
  }

  function getAutoReply(text) {
    const value = String(text || '').toLowerCase();
    if (value.indexOf('prix') >= 0 || value.indexOf('mad') >= 0) return 'Proposition : 200 MAD';
    if (value.indexOf('dispon') >= 0 || value.indexOf('aujourd') >= 0) return 'Oui, je peux intervenir aujourd’hui en fin d’après-midi.';
    if (value.indexOf('photo') >= 0) return 'Oui, envoyez-moi des photos et je vous confirme rapidement.';
    return 'Merci pour votre message. Je vous réponds rapidement avec une proposition claire.';
  }

  function sendMessage(text, options) {
    const content = String(text || '').trim();
    if (!content || !api.activeConversationId) return null;
    const currentUser = api.currentUser;
    const conversation = api.getConversation(api.activeConversationId);
    if (!conversation) return null;
    const other = getConversationOtherParty(conversation, currentUser);
    const amount = detectPrice(content);
    const message = appendMessage({
      id: uid('msg'),
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      receiver_id: other.id,
      message: content,
      type: amount ? 'price' : 'text',
      created_at: nowIso(),
      meta: amount ? { amount: amount } : {}
    });
    notifyUser(other.id, 'Nouveau message reçu', content, 'new_message', {
      mission_id: conversation.mission_id,
      conversation_id: conversation.id
    });
    api.render();
    if (!(options && options.skipAutoReply) && getPageName() === 'artisan.html' && currentUser.role === 'client') {
      window.setTimeout(function () {
        appendMessage({
          conversation_id: conversation.id,
          sender_id: conversation.artisan_id,
          receiver_id: conversation.client_id,
          message: getAutoReply(content),
          type: detectPrice(getAutoReply(content)) ? 'price' : 'text',
          created_at: nowIso(),
          meta: detectPrice(getAutoReply(content)) ? { amount: detectPrice(getAutoReply(content)) } : {}
        });
        notifyUser(conversation.client_id, 'Réponse artisan', conversation.artisan_name + ' vous a répondu.', 'new_message', {
          mission_id: conversation.mission_id,
          conversation_id: conversation.id
        });
        api.render();
      }, 900);
    }
    return message;
  }

  const api = {
    currentUser: getCurrentUser(),
    activeConversationId: localStorage.getItem(ACTIVE_KEY) || '',
    root: null,
    launcher: null,
    textarea: null,
    priceInput: null,
    getConversation: function (conversationId) {
      return readConversations().find(function (conversation) { return conversation.id === conversationId; }) || null;
    },
    listConversations: function () {
      const user = this.currentUser;
      const visibleIds = user.role === 'artisan'
        ? [user.id, ARTISAN_FALLBACK.id, 'artisan', 'artisan_local']
        : [user.id, CLIENT_FALLBACK.id, 'client', 'client_local'];
      return readConversations()
        .filter(function (conversation) {
          return user.role === 'artisan'
            ? visibleIds.indexOf(conversation.artisan_id) >= 0
            : visibleIds.indexOf(conversation.client_id) >= 0;
        })
        .sort(function (a, b) { return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(); });
    },
    getActiveConversation: function () {
      return this.getConversation(this.activeConversationId) || this.listConversations()[0] || null;
    },
    openConversation: function (conversationId) {
      this.activeConversationId = conversationId;
      localStorage.setItem(ACTIVE_KEY, conversationId);
      markConversationSeen(conversationId);
      if (this.root) {
        this.root.classList.add('open');
        if (window.innerWidth <= 768) {
          const shell = this.root.querySelector('.fixeo-chat-shell');
          if (shell) shell.classList.add('mobile-main');
        }
      }
      this.render();
    },
    openBestConversation: function () {
      ensureMissionBackedConversations();
      const conversation = this.getActiveConversation() || this.listConversations()[0] || ensureProfileDraftConversation();
      if (conversation) this.openConversation(conversation.id);
    },
    openMissionConversation: function (missionId) {
      ensureMissionBackedConversations();
      const conversation = findConversationByMission(missionId) || this.listConversations()[0];
      if (conversation) this.openConversation(conversation.id);
    },
    openProfileConversation: function () {
      const conversation = ensureProfileDraftConversation();
      this.openConversation(conversation.id);
    },
    close: function () {
      if (this.root) this.root.classList.remove('open');
    },
    updatePresence: function () {
      if (!this.currentUser || !this.currentUser.id) return;
      const presence = readPresence();
      if (!presence || typeof presence !== 'object') return;
      presence[this.currentUser.id] = {
        name: this.currentUser.name || '',
        role: this.currentUser.role || 'client',
        last_seen: nowIso(),
        online: true
      };
      writePresence(presence);
    },
    isOnline: function (userId) {
      const presence = readPresence();
      const item = presence[userId];
      if (!item || !item.last_seen) return false;
      return Date.now() - new Date(item.last_seen).getTime() < 2 * 60 * 1000;
    },
    getLastOwnSeenStatus: function (messages, user) {
      const ownMessages = messages.filter(function (message) { return message.sender_id === user.id && message.sender_id !== 'system'; });
      return ownMessages.length ? ownMessages[ownMessages.length - 1].seen_at : null;
    },
    renderConversationList: function (container) {
      const user = this.currentUser;
      const conversations = this.listConversations();
      if (!conversations.length) {
        container.innerHTML = '<div class="fixeo-chat-empty"><div><strong>Aucune conversation</strong><br>Ouvrez un contact pour démarrer.</div></div>';
        return;
      }
      container.innerHTML = conversations.map(function (conversation) {
        const other = getConversationOtherParty(conversation, user);
        const messages = getConversationMessages(conversation.id);
        const lastMessage = messages[messages.length - 1];
        const unread = getUnreadCountForConversation(conversation, user);
        const activeClass = api.activeConversationId === conversation.id ? ' active' : '';
        const online = api.isOnline(other.id) ? '<span class="fixeo-chat-online-dot"></span>' : '';
        return '' +
          '<button type="button" class="fixeo-chat-conversation' + activeClass + '" data-conversation-id="' + escapeHtml(conversation.id) + '">' +
            '<span class="fixeo-chat-avatar">' + escapeHtml((other.name || '?').slice(0, 1).toUpperCase()) + '</span>' +
            '<span style="min-width:0;text-align:left">' +
              '<span class="fixeo-chat-conv-name">' + escapeHtml(other.name) + online + '</span>' +
              '<span class="fixeo-chat-conv-sub">' + escapeHtml(conversation.mission_label) + '</span>' +
              '<span class="fixeo-chat-conv-last">' + escapeHtml(lastMessage ? lastMessage.message : 'Conversation prête') + '</span>' +
            '</span>' +
            '<span style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">' +
              '<span class="fixeo-chat-time">' + escapeHtml(formatConversationTime(conversation.updated_at)) + '</span>' +
              (unread ? '<span class="fixeo-chat-unread">' + unread + '</span>' : '') +
            '</span>' +
          '</button>';
      }).join('');
    },
    renderMessages: function (container, conversation) {
      const user = this.currentUser;
      const messages = getConversationMessages(conversation.id);
      if (!messages.length) {
        container.innerHTML = '<div class="fixeo-chat-empty"><div>Commencez la conversation.</div></div>';
        return;
      }
      let lastDay = '';
      const ownMessages = messages.filter(function (message) { return message.sender_id === user.id && message.sender_id !== 'system'; });
      const lastOwnMessageId = ownMessages.length ? ownMessages[ownMessages.length - 1].id : '';
      container.innerHTML = messages.map(function (message) {
        const day = formatDay(message.created_at);
        const showDay = day !== lastDay;
        lastDay = day;
        const rowClass = message.type === 'system' || message.sender_id === 'system'
          ? 'system'
          : (message.sender_id === user.id ? 'own' : 'other');
        const amount = Number(message.meta && message.meta.amount || detectPrice(message.message));
        const showAccept = user.role === 'client' && rowClass === 'other' && amount > 0 && !conversation.price_accepted;
        const meta = rowClass === 'own' && message.id === lastOwnMessageId && message.seen_at ? 'Vu ✔' : '';
        return (showDay ? '<div class="fixeo-chat-day">' + escapeHtml(day) + '</div>' : '') +
          '<div class="fixeo-chat-row ' + rowClass + '">' +
            '<div class="fixeo-chat-bubble">' +
              '<div>' + escapeHtml(message.message) + '</div>' +
              (amount > 0 && rowClass !== 'system' ? '<div class="fixeo-chat-price-chip">💰 Proposition : ' + amount + ' MAD</div>' : '') +
              (showAccept ? '<button type="button" class="fixeo-chat-accept-btn" data-accept-price="' + amount + '" data-conversation-id="' + escapeHtml(conversation.id) + '">Accepter le prix</button>' : '') +
            '</div>' +
            '<div class="fixeo-chat-meta">' + escapeHtml(formatTime(message.created_at)) + (meta ? '<span>' + escapeHtml(meta) + '</span>' : '') + '</div>' +
          '</div>';
      }).join('');
      container.scrollTop = container.scrollHeight;
    },
    renderMain: function (conversation) {
      const main = this.root.querySelector('[data-chat-main]');
      if (!main) return;
      if (!conversation) {
        main.innerHTML = '<div class="fixeo-chat-empty"><div><strong>Chat Fixeo</strong><br>Sélectionnez une conversation.</div></div>';
        return;
      }
      const other = getConversationOtherParty(conversation, this.currentUser);
      const online = this.isOnline(other.id);
      main.innerHTML = '' +
        '<div class="fixeo-chat-main-head">' +
          '<button type="button" class="fixeo-chat-mobile-back" data-chat-back>←</button>' +
          '<div class="fixeo-chat-avatar">' + escapeHtml((other.name || '?').slice(0, 1).toUpperCase()) + '</div>' +
          '<div class="fixeo-chat-main-meta">' +
            '<h3>' + escapeHtml(other.name) + ' • ' + escapeHtml(other.service || 'Fixeo') + '</h3>' +
            '<p><span>' + escapeHtml(conversation.mission_label) + '</span><span>' + (online ? 'en ligne' : 'hors ligne') + '</span><span>' + (conversation.price_accepted ? 'prix accepté' : 'discussion active') + '</span></p>' +
          '</div>' +
          '<span class="fixeo-chat-state">' + (online ? '● en ligne' : 'vu récemment') + '</span>' +
        '</div>' +
        '<div class="fixeo-chat-body" data-chat-body></div>' +
        '<div class="fixeo-chat-composer">' +
          '<div class="fixeo-chat-quick">' + getDefaultQuickReplies(this.currentUser.role).map(function (item) {
            return '<button type="button" data-quick-message="' + escapeHtml(item) + '">' + escapeHtml(item) + '</button>';
          }).join('') + '</div>' +
          (this.currentUser.role === 'artisan' ?
            '<div class="fixeo-chat-price-box show"><span>Envoyer un prix</span><input type="number" min="0" step="10" data-price-input placeholder="200"><button type="button" data-send-price>Proposer</button></div>' :
            '<div class="fixeo-chat-price-box"><span>Le client peut accepter le prix directement dans le chat.</span></div>') +
          '<div class="fixeo-chat-input-row">' +
            '<textarea class="fixeo-chat-textarea" data-chat-input placeholder="Écrire un message..."></textarea>' +
            '<button type="button" class="fixeo-chat-send" data-send-message>Envoyer</button>' +
          '</div>' +
          '<div class="fixeo-chat-helper"><span>UX MVP rapide • sans WebSocket</span><span>Auto-scroll activé</span></div>' +
        '</div>';
      const body = this.root.querySelector('[data-chat-body]');
      this.renderMessages(body, conversation);
      this.textarea = this.root.querySelector('[data-chat-input]');
      this.priceInput = this.root.querySelector('[data-price-input]');
      if (this.textarea) this.textarea.focus();
    },
    updateLauncherBadge: function () {
      const badge = this.launcher && this.launcher.querySelector('.badge');
      if (!badge) return;
      const unread = this.listConversations().reduce(function (sum, conversation) {
        return sum + getUnreadCountForConversation(conversation, api.currentUser);
      }, 0);
      badge.textContent = unread;
      badge.classList.toggle('has-unread', unread > 0);
    },
    injectHeroButtons: function () {
      if (!document.querySelector('.fixeo-chat-hero-btn') && document.querySelector('.dashboard-hero-actions')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary fixeo-chat-hero-btn';
        btn.type = 'button';
        btn.textContent = '💬 Contacter un client';
        btn.addEventListener('click', this.openBestConversation.bind(this));
        document.querySelector('.dashboard-hero-actions').appendChild(btn);
      }
      if (!document.querySelector('.fixeo-chat-hero-btn-client') && document.querySelector('.client-hero-actions')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary fixeo-chat-hero-btn fixeo-chat-hero-btn-client';
        btn.type = 'button';
        btn.textContent = '💬 Ouvrir le chat';
        btn.addEventListener('click', this.openBestConversation.bind(this));
        document.querySelector('.client-hero-actions').appendChild(btn);
      }
    },
    bindLegacyHooks: function () {
      const originalShowSection = typeof window.showSection === 'function' ? window.showSection : null;
      window.showSection = function (name) {
        if (name === 'messages') window.FixeoChat.openBestConversation();
        if (originalShowSection) return originalShowSection.apply(this, arguments);
      };
      window.startChat = this.openProfileConversation.bind(this);
      window.toggleChat = function () { window.FixeoChat.openBestConversation(); };
      window.sendMessage = function () {
        const field = document.getElementById('chat-input-field');
        if (field && field.value.trim()) {
          const value = field.value.trim();
          field.value = '';
          window.FixeoChat.openBestConversation();
          sendMessage(value);
          return;
        }
        window.FixeoChat.openBestConversation();
      };
      window.sendDashMessage = function () {
        const field = document.getElementById('dash-chat-input');
        if (field && field.value.trim()) {
          const value = field.value.trim();
          field.value = '';
          window.FixeoChat.openBestConversation();
          sendMessage(value);
          return;
        }
        window.FixeoChat.openBestConversation();
      };
    },
    bindEvents: function () {
      this.launcher.addEventListener('click', this.openBestConversation.bind(this));
      this.root.addEventListener('click', function (event) {
        if (event.target.classList.contains('fixeo-chat-backdrop')) api.close();
        const closeTarget = event.target.closest('.fixeo-chat-close');
        if (closeTarget) api.close();
        const backTarget = event.target.closest('[data-chat-back]');
        if (backTarget) {
          const shell = api.root.querySelector('.fixeo-chat-shell');
          if (shell) shell.classList.remove('mobile-main');
        }
        const conversationTarget = event.target.closest('[data-conversation-id]');
        if (conversationTarget && conversationTarget.classList.contains('fixeo-chat-conversation')) {
          api.openConversation(conversationTarget.getAttribute('data-conversation-id'));
        }
        const quickTarget = event.target.closest('[data-quick-message]');
        if (quickTarget) {
          const text = quickTarget.getAttribute('data-quick-message') || '';
          if (api.textarea) {
            api.textarea.value = text;
            api.textarea.focus();
          }
        }
        const sendTarget = event.target.closest('[data-send-message]');
        if (sendTarget && api.textarea && api.textarea.value.trim()) {
          const text = api.textarea.value.trim();
          api.textarea.value = '';
          sendMessage(text);
        }
        const sendPriceTarget = event.target.closest('[data-send-price]');
        if (sendPriceTarget && api.priceInput && Number(api.priceInput.value) > 0) {
          const amount = Math.round(Number(api.priceInput.value));
          api.priceInput.value = '';
          sendMessage('Proposition : ' + amount + ' MAD', { skipAutoReply: true });
        }
        const acceptTarget = event.target.closest('[data-accept-price]');
        if (acceptTarget) {
          const amount = Math.round(Number(acceptTarget.getAttribute('data-accept-price')) || 0);
          const conversation = api.getConversation(acceptTarget.getAttribute('data-conversation-id'));
          if (conversation && amount > 0) {
            ensurePriceAccepted(conversation, amount);
            api.render();
          }
        }
      });
      this.root.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') api.close();
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && api.root.classList.contains('open')) api.close();
      });
      window.addEventListener('storage', function (event) {
        if ([CONVERSATION_KEY, MESSAGE_KEY, PRESENCE_KEY, ACTIVE_KEY].indexOf(event.key) >= 0) api.render();
      });
      window.setInterval(function () { api.updatePresence(); api.updateLauncherBadge(); }, 30000);
      window.addEventListener('beforeunload', function () {
        if (!api.currentUser || !api.currentUser.id) return;
        const presence = readPresence();
        if (presence && presence[api.currentUser.id]) {
          presence[api.currentUser.id].online = false;
          presence[api.currentUser.id].last_seen = nowIso();
          writePresence(presence);
        }
      });
    },
    createUI: function () {
      const launcher = document.createElement('button');
      launcher.id = 'fixeo-chat-launcher';
      launcher.type = 'button';
      launcher.innerHTML = '<span>💬 Chat mission</span><span class="badge"></span>';
      document.body.appendChild(launcher);
      this.launcher = launcher;
      const root = document.createElement('div');
      root.id = 'fixeo-chat-root';
      root.innerHTML = '' +
        '<div class="fixeo-chat-backdrop"></div>' +
        '<div class="fixeo-chat-shell">' +
          '<aside class="fixeo-chat-sidebar">' +
            '<div class="fixeo-chat-sidebar-head">' +
              '<div><h3>Conversations</h3><p>Client ↔ artisan ↔ mission</p></div>' +
              '<button type="button" class="fixeo-chat-close">✕</button>' +
            '</div>' +
            '<div class="fixeo-chat-conversation-list" data-chat-list></div>' +
          '</aside>' +
          '<section class="fixeo-chat-main" data-chat-main></section>' +
        '</div>';
      document.body.appendChild(root);
      this.root = root;
    },
    render: function () {
      ensureMissionBackedConversations();
      const active = this.getActiveConversation();
      if (active) {
        this.activeConversationId = active.id;
        localStorage.setItem(ACTIVE_KEY, active.id);
        markConversationSeen(active.id);
      }
      const list = this.root.querySelector('[data-chat-list]');
      this.renderConversationList(list);
      this.renderMain(active);
      this.updateLauncherBadge();
      this.injectHeroButtons();
    },
    init: function () {
      ensureMissionBackedConversations();
      if (getPageName() === 'artisan.html') ensureProfileDraftConversation();
      this.updatePresence();
      this.createUI();
      this.bindEvents();
      this.bindLegacyHooks();
      this.render();
    }
  };

  window.FixeoChat = api;
  document.addEventListener('DOMContentLoaded', function () {
    api.init();
  });
})(window, document);
