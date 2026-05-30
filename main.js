(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  function cleanText(value) {
    return String(value || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/`/g, '')
      .trim();
  }

  function cleanURL(value) {
    const raw = cleanText(value);
    try {
      return new URL(raw).origin;
    } catch {
      return raw.replace(/\s/g, '').replace(/\/+$/, '');
    }
  }

  const _urlParams = new URLSearchParams(window.location.search);
  const iframeState = {
    token: cleanText(_urlParams.get('token')),
    srcHost: cleanURL(_urlParams.get('src_host')),
    userId: cleanText(_urlParams.get('user_id')),
    isEmbedded: cleanText(_urlParams.get('ui_mode')) === 'embedded'
  };
  console.log('[生图调试] iframe参数:', {
    hasToken: !!iframeState.token,
    tokenLen: iframeState.token.length,
    srcHost: iframeState.srcHost,
    userId: iframeState.userId,
    isEmbedded: iframeState.isEmbedded
  });

  async function callSub2API(path) {
    if (!iframeState.token || !iframeState.srcHost) return null;
    const url = new URL(path, iframeState.srcHost + '/').toString();
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + iframeState.token,
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store'
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error('API ' + resp.status + ': ' + text);
    }
    return resp.json();
  }

  function showToast(message, type = 'info') {
    let container = $('#toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  (() => {
    const modes = ['text', 'image', 'history'];
    const tabs = $$('.image-tabs .image-tab[data-mode]');
    const panels = $$('[data-panel]');
    if (!tabs.length || !panels.length) return;

    function setMode(mode, updateHash = false) {
      const next = modes.includes(mode) ? mode : modes[0];
      for (const tab of tabs) {
        const active = tab.dataset.mode === next;
        tab.classList.toggle('image-tab-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
      }
      for (const panel of panels) {
        const active = panel.dataset.panel === next;
        panel.hidden = !active;
        panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      }
      if (updateHash) {
        history.replaceState(null, '', '#' + next);
      }
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode, true));
    });

    const tabList = $('.image-tabs');
    if (tabList) {
      tabList.addEventListener('keydown', e => {
        const current = tabs.findIndex(t => t.classList.contains('image-tab-active'));
        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          next = (current + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          next = (current - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
          e.preventDefault();
          next = 0;
        } else if (e.key === 'End') {
          e.preventDefault();
          next = tabs.length - 1;
        }
        if (next >= 0) {
          tabs[next].focus();
          setMode(tabs[next].dataset.mode, true);
        }
      });
    }

    const fromHash = location.hash.replace('#', '');
    const initial = modes.includes(fromHash) ? fromHash : (tabs.find(t => t.classList.contains('image-tab-active'))?.dataset.mode || modes[0]);
    setMode(initial, false);
  })();

  (() => {
    const panels = $$('.advanced-panel');
    if (!panels.length) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const duration = 300;

    function setExpanded(details, expanded) {
      const summary = details.querySelector('summary');
      if (summary) summary.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function finishAnimation(body, callback) {
      let done = false;
      const cleanup = () => {
        if (done) return;
        done = true;
        body.removeEventListener('transitionend', onEnd);
        callback();
      };
      const onEnd = event => {
        if (event.target === body && event.propertyName === 'height') cleanup();
      };
      body.addEventListener('transitionend', onEnd);
      window.setTimeout(cleanup, duration + 60);
    }

    function openPanel(details, body) {
      details.open = true;
      setExpanded(details, true);
      body.style.paddingBottom = '0px';
      if (motionQuery.matches) {
        body.style.height = 'auto';
        body.style.opacity = '1';
        body.style.paddingBottom = '';
        return;
      }
      body.style.height = '0px';
      body.style.opacity = '0';
      body.style.transform = 'translateY(-6px)';
      body.dataset.animating = 'true';
      requestAnimationFrame(() => {
        body.style.paddingBottom = '';
        body.style.height = body.scrollHeight + 'px';
        body.style.opacity = '1';
        body.style.transform = 'translateY(0)';
      });
      finishAnimation(body, () => {
        body.dataset.animating = 'false';
        body.style.height = 'auto';
        body.style.paddingBottom = '';
        body.style.transform = '';
      });
    }

    function closePanel(details, body) {
      setExpanded(details, false);
      body.style.paddingBottom = window.getComputedStyle(body).paddingBottom;
      if (motionQuery.matches) {
        body.style.height = '0px';
        body.style.opacity = '0';
        details.open = false;
        body.style.paddingBottom = '';
        return;
      }
      body.style.height = body.scrollHeight + 'px';
      body.style.opacity = '1';
      body.dataset.animating = 'true';
      requestAnimationFrame(() => {
        body.style.height = '0px';
        body.style.opacity = '0';
        body.style.paddingBottom = '0px';
        body.style.transform = 'translateY(-6px)';
      });
      finishAnimation(body, () => {
        body.dataset.animating = 'false';
        details.open = false;
        body.style.paddingBottom = '';
        body.style.transform = '';
      });
    }

    panels.forEach(details => {
      const summary = details.querySelector('summary');
      const body = details.querySelector('.advanced-body');
      if (!summary || !body) return;
      details.open = false;
      body.style.height = '0px';
      body.style.opacity = '0';
      summary.setAttribute('aria-expanded', 'false');
      summary.addEventListener('click', event => {
        event.preventDefault();
        if (body.dataset.animating === 'true') return;
        if (details.open) {
          closePanel(details, body);
        } else {
          openPanel(details, body);
        }
      });
    });
  })();

  const SELECT_OPTIONS = {
    'api-key': [
      { value: 'pool-gpt', label: '对接中转 · GPT【主推号池】' },
      { value: 'pool-claude', label: '对接中转 · Claude【备用号池】' },
      { value: 'direct-gpt4o', label: '直连官方 · GPT-4o' }
    ],
      'model': [
        { value: 'gpt-image-2', label: 'gpt-image-2' },
        { value: 'gpt-image-1.5', label: 'gpt-image-1.5' },
        { value: 'gpt-image-1', label: 'gpt-image-1' }
      ],
      'quality': [
        { value: 'auto', label: '自动' },
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' }
      ],
      'background': [
        { value: 'auto', label: '自动' },
        { value: 'transparent', label: '透明' },
        { value: 'opaque', label: '不透明' }
      ],
      'format': [
        { value: 'png', label: 'PNG' },
        { value: 'webp', label: 'WebP' },
        { value: 'jpeg', label: 'JPEG' }
      ]
    };

  (() => {
    let openDropdown = null;

    function closeDropdown() {
      if (openDropdown) {
        openDropdown.classList.remove('select-open');
        const menu = openDropdown.querySelector('.select-menu');
        if (menu) menu.remove();
        openDropdown = null;
      }
    }

    document.addEventListener('click', e => {
      if (openDropdown && !openDropdown.contains(e.target)) {
        closeDropdown();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDropdown();
    });

    function createSelect(field, optionsKey) {
      const trigger = field.querySelector('.select-trigger');
      if (!trigger) return;
      const wrapper = trigger.closest('.relative') || trigger.parentElement;
      const options = SELECT_OPTIONS[optionsKey] || [];
      let currentValue = options[0]?.value || '';

      trigger.addEventListener('click', e => {
        e.stopPropagation();
        if (openDropdown === wrapper) {
          closeDropdown();
          return;
        }
        closeDropdown();

        const menu = document.createElement('div');
        menu.className = 'select-menu';
        options.forEach(opt => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'select-option' + (opt.value === currentValue ? ' select-option-active' : '');
          item.textContent = opt.label;
          item.addEventListener('click', ev => {
            ev.stopPropagation();
            currentValue = opt.value;
            trigger.querySelector('.select-value').textContent = opt.label;
            closeDropdown();
            updateCost();
          });
          menu.appendChild(item);
        });

        wrapper.classList.add('select-open');
        wrapper.appendChild(menu);
        openDropdown = wrapper;

        const firstItem = menu.querySelector('.select-option');
        if (firstItem) firstItem.focus();
      });

      trigger.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger.click();
        }
      });
    }

    function initPanelSelects(panel) {
      if (!panel) return;
      const fields = $$('.image-field', panel);
      fields.forEach(field => {
        const trigger = field.querySelector('.select-trigger');
        if (!trigger) return;
        const label = field.querySelector('.input-label');
        if (!label) return;
        const labelText = label.textContent.trim();
        let key = '';
        if (labelText.includes('API') || labelText.includes('密钥')) key = 'api-key';
        else if (labelText.includes('模型')) key = 'model';
        else if (labelText.includes('质量')) key = 'quality';
        else if (labelText.includes('背景')) key = 'background';
        else if (labelText.includes('输出格式')) key = 'format';
        if (key) createSelect(field, key);
      });
    }

    async function fetchAndPopulateApiKeys() {
      if (!iframeState.isEmbedded || !iframeState.token) return;

      try {
        const resp = await callSub2API('/api/v1/keys').catch(() => null);
        const items = resp?.data?.items || resp?.data || [];
        if (!Array.isArray(items) || items.length === 0) return;

        const apiKeys = items.map(item => ({
          value: cleanText(item.key),
          label: cleanText(item.name || item.key || '未命名密钥')
        }));
        console.log('[生图调试] 获取到API密钥数量:', apiKeys.length, apiKeys.map(k => ({ label: k.label, valueLen: k.value.length })));

        if (apiKeys.length > 0) {
          SELECT_OPTIONS['api-key'] = apiKeys;
        }

        $$('.select-trigger').forEach(trigger => {
          const field = trigger.closest('.image-field');
          if (!field) return;
          const label = field.querySelector('.input-label');
          if (!label) return;
          if (label.textContent.trim().includes('API') || label.textContent.trim().includes('密钥')) {
            trigger.querySelector('.select-value').textContent = SELECT_OPTIONS['api-key'][0]?.label || '';
          }
        });
      } catch (e) {
        // fallback to hardcoded options
      }
    }

    (async () => {
      await fetchAndPopulateApiKeys();
      initPanelSelects($('#panel-text'));
      initPanelSelects($('#panel-image'));
    })();
  })();

  (() => {
    $$('.field-ratio').forEach(field => {
      const cards = $$('.ratio-card', field);
      const tierBtns = $$('.tier-btn', field);
      const display = $('.image-active-value', field);

      cards.forEach(card => {
        card.addEventListener('click', () => {
          cards.forEach(c => c.classList.remove('ratio-card-active'));
          card.classList.add('ratio-card-active');
          const ratio = card.querySelector('.ratio-label')?.textContent || '';
          if (display) display.textContent = ratio;
          updateCost();
        });
      });

      tierBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          tierBtns.forEach(b => b.classList.remove('tier-btn-active'));
          btn.classList.add('tier-btn-active');
          updateCost();
        });
      });
    });
  })();

  (() => {
    $$('.image-range').forEach(range => {
      const field = range.closest('.field-prompt');
      if (!field) return;
      const display = $('.image-active-value', field);
      if (display) {
        const update = () => {
          display.textContent = range.value;
          updateCost();
        };
        range.addEventListener('input', update);
        update();
      }
    });

    $$('textarea.input, textarea.prompt-textarea').forEach(textarea => {
      const field = textarea.closest('.image-field');
      if (!field) return;
      const counter = $('.char-count', field);
      if (counter) {
        const update = () => {
          counter.textContent = textarea.value.length + ' 字符';
        };
        textarea.addEventListener('input', update);
        update();
      }
    });
  })();

  (() => {
    $$('.prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const field = chip.closest('.image-field');
        if (!field) return;
        const textarea = $('textarea.input, textarea.prompt-textarea', field);
        if (textarea) {
          textarea.value = chip.textContent;
          textarea.dispatchEvent(new Event('input'));
          textarea.focus();
        }
      });
    });
  })();

  (() => {
    const panel = $('#panel-image');
    if (!panel) return;
    const fileInput = $('input[type="file"]', panel);
    const uploadLabel = $('.reference-upload', panel);
    const listContainer = $('.mock-reference-list', panel);
    const countDisplay = $('.image-muted', panel);
    if (!fileInput || !listContainer) return;

    let files = [];

    function updateCount() {
      if (countDisplay) countDisplay.textContent = files.length + ' / 4';
      if (uploadLabel) uploadLabel.style.display = files.length >= 4 ? 'none' : '';
    }

    function renderList() {
      listContainer.innerHTML = '';
      files.forEach((f, i) => {
        const item = document.createElement('div');
        item.className = 'reference-item';

        if (f.dataUrl) {
          const img = document.createElement('img');
          img.src = f.dataUrl;
          img.alt = f.name;
          img.className = 'reference-thumb';
          item.appendChild(img);
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'reference-name';
        nameSpan.textContent = f.name;
        nameSpan.title = f.name;
        item.appendChild(nameSpan);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'reference-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = '移除';
        removeBtn.addEventListener('click', () => {
          files.splice(i, 1);
          renderList();
          updateCount();
        });
        item.appendChild(removeBtn);

        listContainer.appendChild(item);
      });
      updateCost();
    }

    fileInput.addEventListener('change', () => {
      const newFiles = Array.from(fileInput.files);
      const remaining = 4 - files.length;
      if (remaining <= 0) {
        showToast('最多上传 4 张参考图', 'warning');
        fileInput.value = '';
        return;
      }
      const toAdd = newFiles.slice(0, remaining);
      if (newFiles.length > remaining) {
        showToast('已达上限，仅添加前 ' + remaining + ' 张', 'warning');
      }
      let loaded = 0;
      toAdd.forEach(file => {
        if (file.size > 20 * 1024 * 1024) {
          showToast(file.name + ' 超过 20MB 限制', 'error');
          loaded++;
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          files.push({ name: file.name, dataUrl: reader.result });
          loaded++;
          if (loaded === toAdd.length) renderList();
        };
        reader.onerror = () => {
          loaded++;
          showToast(file.name + ' 读取失败', 'error');
          if (loaded === toAdd.length) renderList();
        };
        reader.readAsDataURL(file);
      });
      fileInput.value = '';
    });

    if (uploadLabel) {
      uploadLabel.addEventListener('dragover', e => {
        e.preventDefault();
        uploadLabel.classList.add('reference-upload-hover');
      });
      uploadLabel.addEventListener('dragleave', () => {
        uploadLabel.classList.remove('reference-upload-hover');
      });
      uploadLabel.addEventListener('drop', e => {
        e.preventDefault();
        uploadLabel.classList.remove('reference-upload-hover');
        const dt = e.dataTransfer;
        if (dt.files.length) {
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event('change'));
        }
      });
    }

    panel._getFiles = () => files;
    updateCount();
  })();

  function updateCost() {
    const PRICE_PER_IMAGE = 0.06;

    $$('.mode-panel').forEach(panel => {
      const costEl = $('.cost-value', panel);
      if (!costEl) return;

      let count = 1;

      const range = $('.image-range', panel);
      if (range) count = parseInt(range.value) || 1;

      const total = (PRICE_PER_IMAGE * count).toFixed(2);
      costEl.textContent = '$' + total;
    });
  }

  updateCost();

  const MAX_ATTEMPTS = 3;
  const RETRY_BACKOFF_MS = 15000;

  function isRetryableError(err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('service temporarily unavailable')) return true;
    if (msg.includes('524') || msg.includes('504') || msg.includes('gateway time-out')) return true;
    if (msg.includes('origin_gateway_timeout')) return true;
    if (msg.includes('api_error') || msg.includes('server_error')) return true;
    if (/http 50[234]/.test(msg) || /http 524/.test(msg)) return true;
    return false;
  }

  function getErrorHint(err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('moderation_blocked') || msg.includes('content_policy_violation'))
      return '上游内容审核拦截，提示词可能包含违规内容';
    if (msg.includes('rate_limit_exceeded'))
      return '上游限速，请稍后再试';
    if (msg.includes('insufficient_quota') || msg.includes('billing_hard_limit_reached'))
      return '上游账户额度不足，请更换 API 密钥';
    if (msg.includes('model_not_found'))
      return '上游找不到指定模型，请检查模型配置';
    if (msg.includes('service temporarily unavailable'))
      return '服务暂时不可用，已自动重试';
    if (msg.includes('524') || msg.includes('504') || msg.includes('gateway time-out'))
      return '上游网关超时，生成可能仍在进行';
    return '';
  }

  function walkForImageCall(value) {
    if (!value) return null;
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = walkForImageCall(child);
        if (found) return found;
      }
      return null;
    }
    if (typeof value === 'object') {
      if (value.type === 'image_generation_call' && value.result) return value;
      for (const child of Object.values(value)) {
        const found = walkForImageCall(child);
        if (found) return found;
      }
    }
    return null;
  }

  function extractImageResult(raw) {
    let partialB64 = '';
    let partialPrompt = '';
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      let event;
      try { event = JSON.parse(payload); } catch { continue; }
      if (event.type === 'response.image_generation_call.partial_image' && event.partial_image_b64) {
        partialB64 = event.partial_image_b64;
        partialPrompt = event.revised_prompt || partialPrompt;
        continue;
      }
      if (event.type === 'response.output_item.done' && event.item?.type === 'image_generation_call') {
        if (event.item.result) {
          return { imageB64: event.item.result, revisedPrompt: event.item.revised_prompt || '' };
        }
        if (partialB64) {
          return { imageB64: partialB64, revisedPrompt: partialPrompt };
        }
      }
    }
    try {
      const parsed = JSON.parse(raw);
      const found = walkForImageCall(parsed);
      if (found?.result) {
        return { imageB64: found.result, revisedPrompt: found.revised_prompt || '' };
      }
    } catch {}
    if (partialB64) {
      return { imageB64: partialB64, revisedPrompt: partialPrompt };
    }
    return null;
  }

  async function requestResponsesAPI(baseURL, apiKey, requestBody, onProgress) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const fullURL = baseURL + '/v1/responses';
        const maskedKey = apiKey ? (apiKey.slice(0, 8) + '****' + apiKey.slice(-4)) : 'null';
        console.groupCollapsed('[生图调试] 第 ' + attempt + ' 次请求');
        console.log('请求地址:', fullURL);
        console.log('API Key:', maskedKey);
        console.log('请求体:', JSON.stringify(requestBody, null, 2));
        console.groupEnd();

        if (attempt > 1 && onProgress) {
          onProgress('第 ' + attempt + ' 次重试中...');
        }
        const response = await fetch(fullURL, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream, application/json'
          },
          body: JSON.stringify(requestBody)
        });
        console.log('[生图调试] 响应状态:', response.status, response.statusText);
        if (!response.ok) {
          const errText = await response.text();
          console.error('[生图调试] 错误响应原文:', errText);
          let msg = 'HTTP ' + response.status;
          try {
            const errJson = JSON.parse(errText);
            msg = errJson.error?.message || errJson.message || msg;
            console.error('[生图调试] 错误JSON:', errJson);
          } catch {}
          const err = new Error(msg);
          err.httpStatus = response.status;
          throw err;
        }
        if (!response.body) {
          const raw = await response.text();
          console.log('[生图调试] 非流式响应原文(前2000字符):', raw.slice(0, 2000));
          const result = extractImageResult(raw);
          console.log('[生图调试] 提取结果:', result ? '成功(有imageB64)' : '失败(null)');
          return result;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let raw = '';
        let pending = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          raw += chunk;
          pending += chunk;
          let newline = pending.indexOf('\n');
          while (newline >= 0) {
            const line = pending.slice(0, newline).replace(/\r$/, '');
            pending = pending.slice(newline + 1);
            if (line.startsWith('data: ')) {
              const payload = line.slice(6).trim();
              if (payload && payload !== '[DONE]') {
                try {
                  const evt = JSON.parse(payload);
                  if (evt.type) {
                    console.log('[生图调试] SSE事件:', evt.type, evt.error ? '| 错误:' + JSON.stringify(evt.error) : '');
                    if (onProgress) {
                      const MAP = {
                        'response.created': '请求已创建',
                        'response.in_progress': '模型处理中',
                        'response.image_generation_call.in_progress': '图片工具已启动',
                        'response.image_generation_call.generating': '图片正在生成',
                        'response.image_generation_call.partial_image': '已收到图片数据片段',
                        'response.output_item.done': '图片生成完成',
                        'response.completed': '接口已完成'
                      };
                      const desc = MAP[evt.type];
                      if (desc) onProgress(desc);
                    }
                  }
                } catch {}
              }
            }
            newline = pending.indexOf('\n');
          }
        }
        console.log('[生图调试] SSE流总长度:', raw.length, '字符');
        console.log('[生图调试] SSE流原文(前3000字符):', raw.slice(0, 3000));
        const result = extractImageResult(raw);
        console.log('[生图调试] 提取结果:', result ? '成功(有imageB64)' : '失败(null)');
        return result;
      } catch (err) {
        lastError = err;
        console.error('[生图调试] 第 ' + attempt + ' 次请求失败:', err.message, 'httpStatus:', err.httpStatus || 'N/A');
        if (err.httpStatus === 503) throw err;
        if (attempt < MAX_ATTEMPTS && isRetryableError(err)) {
          if (onProgress) onProgress('服务暂时不可用，' + (RETRY_BACKOFF_MS / 1000) + '秒后重试 (' + attempt + '/' + MAX_ATTEMPTS + ')');
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async function requestImagesAPI(baseURL, apiKey, requestBody, onProgress) {
    const fullURL = baseURL + '/v1/images/generations';
    const maskedKey = apiKey ? (apiKey.slice(0, 8) + '****' + apiKey.slice(-4)) : 'null';
    console.log('[生图调试] 回退到 Images API:', fullURL);
    if (onProgress) onProgress('正在通过备用接口生成...');
    const response = await fetch(fullURL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    console.log('[生图调试] Images API 响应状态:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.error('[生图调试] Images API 错误:', errText);
      let msg = 'HTTP ' + response.status;
      try { msg = JSON.parse(errText).error?.message || msg; } catch {}
      const err = new Error(msg);
      err.httpStatus = response.status;
      throw err;
    }
    const data = await response.json();
    console.log('[生图调试] Images API 返回数据结构:', Object.keys(data));
    const first = data.data?.[0];
    if (!first?.b64_json) {
      throw new Error('Images API 未返回可用图片数据');
    }
    return { imageB64: first.b64_json, revisedPrompt: first.revised_prompt || '' };
  }

  async function requestImagesEditAPI(baseURL, apiKey, formData, onProgress) {
    const fullURL = baseURL + '/v1/images/edits';
    console.log('[生图调试] 回退到 Images Edit API:', fullURL);
    if (onProgress) onProgress('正在通过备用接口生成...');
    const response = await fetch(fullURL, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: formData
    });
    console.log('[生图调试] Images Edit API 响应状态:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.error('[生图调试] Images Edit API 错误:', errText);
      let msg = 'HTTP ' + response.status;
      try { msg = JSON.parse(errText).error?.message || msg; } catch {}
      const err = new Error(msg);
      err.httpStatus = response.status;
      throw err;
    }
    const data = await response.json();
    const first = data.data?.[0];
    if (!first?.b64_json) {
      throw new Error('Images Edit API 未返回可用图片数据');
    }
    return { imageB64: first.b64_json, revisedPrompt: first.revised_prompt || '' };
  }

  function getSelectedApiKey(panel) {
    const trigger = panel.querySelector('.select-trigger');
    if (!trigger) return null;
    const field = trigger.closest('.image-field');
    if (!field) return null;
    const label = field.querySelector('.input-label');
    if (!label) return null;
    if (!label.textContent.trim().includes('API') && !label.textContent.trim().includes('密钥')) return null;
    const selectedLabel = trigger.querySelector('.select-value')?.textContent?.trim();
    if (!selectedLabel) return null;
    const options = SELECT_OPTIONS['api-key'] || [];
    const match = options.find(o => o.label === selectedLabel);
    console.log('[生图调试] 选中的密钥:', { selectedLabel, matched: !!match, allOptions: options.map(o => o.label) });
    return match ? match.value : null;
  }

  function getPanelParams(panel) {
    const textarea = panel.querySelector('textarea.input, textarea.prompt-textarea');
    const prompt = textarea ? textarea.value.trim() : '';
    const modelSelect = panel.querySelectorAll('.select-trigger');
    let model = 'gpt-image-2';
    let quality = 'auto';
    let outputFormat = 'png';
    modelSelect.forEach(trigger => {
      const f = trigger.closest('.image-field');
      if (!f) return;
      const lbl = f.querySelector('.input-label');
      if (!lbl) return;
      const txt = lbl.textContent.trim();
      const val = trigger.querySelector('.select-value')?.textContent?.trim() || '';
      if (txt.includes('模型')) model = SELECT_OPTIONS['model']?.find(o => o.label === val)?.value || model;
      if (txt.includes('质量')) quality = SELECT_OPTIONS['quality']?.find(o => o.label === val)?.value || quality;
      if (txt.includes('输出格式')) outputFormat = SELECT_OPTIONS['format']?.find(o => o.label === val)?.value || outputFormat;
    });
    const activeCard = panel.querySelector('.ratio-card-active');
    const ratio = activeCard?.querySelector('.ratio-label')?.textContent || '自动生成';
    const SIZE_MAP = { '自动生成': 'auto', '1:1 正方形': '1024x1024', '16:9 横版': '1536x1024', '4:3 横版': '1024x768', '3:4 竖版': '768x1024', '9:16 竖版': '1024x1536' };
    const size = SIZE_MAP[ratio] || 'auto';
    return { prompt, model, quality, outputFormat, size, ratio };
  }

  async function textToImage({ prompt, baseURL, apiKey, imageModel, size, quality, outputFormat, onProgress }) {
    const body = {
      model: 'gpt-5.5',
      instructions: 'You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      tools: [{
        type: 'image_generation',
        model: imageModel || 'gpt-image-2',
        action: 'generate',
        size: size === 'auto' ? '1024x1024' : size,
        quality: quality || 'auto',
        output_format: outputFormat || 'png',
        moderation: 'low',
        partial_images: 0
      }],
      tool_choice: { type: 'image_generation' },
      reasoning: { effort: 'xhigh' },
      store: false,
      stream: true
    };
    try {
      return await requestResponsesAPI(baseURL, apiKey, body, onProgress);
    } catch (err) {
      if (err.httpStatus === 503) {
        console.log('[生图调试] Responses API 返回503，自动回退到 Images API');
        const imagesBody = {
          model: imageModel || 'gpt-image-2',
          prompt,
          n: 1,
          size: size === 'auto' ? '1024x1024' : size,
          quality: quality || 'auto',
          output_format: outputFormat || 'png',
          response_format: 'b64_json'
        };
        return requestImagesAPI(baseURL, apiKey, imagesBody, onProgress);
      }
      throw err;
    }
  }

  async function imageToImage({ prompt, sourceImages, baseURL, apiKey, imageModel, size, quality, outputFormat, onProgress }) {
    const content = [{ type: 'input_text', text: prompt }];
    for (const dataURL of sourceImages) {
      content.push({ type: 'input_image', image_url: dataURL });
    }
    const body = {
      model: 'gpt-5.5',
      instructions: 'You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave.',
      input: [{ role: 'user', content }],
      tools: [{
        type: 'image_generation',
        model: imageModel || 'gpt-image-2',
        action: 'edit',
        size: size === 'auto' ? '1024x1024' : size,
        quality: quality || 'auto',
        output_format: outputFormat || 'png',
        moderation: 'low',
        partial_images: 0
      }],
      tool_choice: { type: 'image_generation' },
      reasoning: { effort: 'xhigh' },
      store: false,
      stream: true
    };
    try {
      return await requestResponsesAPI(baseURL, apiKey, body, onProgress);
    } catch (err) {
      if (err.httpStatus === 503) {
        console.log('[生图调试] Responses API 返回503，自动回退到 Images Edit API');
        const form = new FormData();
        for (let i = 0; i < sourceImages.length; i++) {
          const dataURL = sourceImages[i];
          const base64Part = dataURL.slice(dataURL.indexOf(',') + 1);
          const mimeType = dataURL.slice(5, dataURL.indexOf(';')) || 'image/png';
          const ext = mimeType.split('/')[1] || 'png';
          const binary = atob(base64Part);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
          const blob = new Blob([bytes], { type: mimeType });
          form.append(i === 0 ? 'image' : 'image[]', blob, 'source-' + (i + 1) + '.' + ext);
        }
        form.append('prompt', prompt);
        form.append('model', imageModel || 'gpt-image-2');
        form.append('n', '1');
        form.append('size', size === 'auto' ? '1024x1024' : size);
        form.append('quality', quality || 'auto');
        form.append('output_format', outputFormat || 'png');
        form.append('response_format', 'b64_json');
        return requestImagesEditAPI(baseURL, apiKey, form, onProgress);
      }
      throw err;
    }
  }

  (() => {
    function getFormatMime(fmt) {
      return fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
    }

    $$('.image-submit').forEach(btn => {
      btn.addEventListener('click', async () => {
        const panel = btn.closest('.mode-panel');
        if (!panel) return;

        const { prompt, model, quality, outputFormat, size, ratio } = getPanelParams(panel);
        if (!prompt) {
          showToast('请输入提示词', 'warning');
          const ta = panel.querySelector('textarea.input, textarea.prompt-textarea');
          if (ta) ta.focus();
          return;
        }

        const apiKey = getSelectedApiKey(panel);
        if (!apiKey) {
          showToast('请选择 API 密钥', 'warning');
          return;
        }

        const mode = panel.dataset.panel;
        let sourceImages = [];
        if (mode === 'image') {
          const files = panel._getFiles ? panel._getFiles() : [];
          if (files.length === 0) {
            showToast('请先上传参考图', 'warning');
            return;
          }
          sourceImages = files.map(f => f.dataUrl);
        }

        const canvas = panel.querySelector('.image-canvas');
        if (!canvas) return;

        btn.disabled = true;
        btn.dataset.originalHTML = btn.innerHTML;
        btn.innerHTML = '<svg class="h-5 w-5 gen-btn-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"/></svg> 生成中...';

        const startTime = Date.now();
        let timerInterval = null;
        let lastProgress = '';

        canvas.innerHTML = '<div class="gen-loading"><div class="gen-spinner"></div><p class="gen-loading-text">正在生成图片，请稍候...</p><p class="gen-loading-hint gen-timer">已用时 0.0 秒</p><p class="gen-progress-text"></p></div>';

        const timerEl = canvas.querySelector('.gen-timer');
        const progressEl = canvas.querySelector('.gen-progress-text');

        timerInterval = setInterval(() => {
          if (timerEl) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            timerEl.textContent = '已用时 ' + elapsed + ' 秒';
          }
        }, 100);

        function onProgress(desc) {
          lastProgress = desc;
          if (progressEl) progressEl.textContent = desc;
        }

        const baseURL = iframeState.srcHost || '';

        try {
          let result;
          if (mode === 'image') {
            result = await imageToImage({ prompt, sourceImages, baseURL, apiKey, imageModel: model, size, quality, outputFormat, onProgress });
          } else {
            result = await textToImage({ prompt, baseURL, apiKey, imageModel: model, size, quality, outputFormat, onProgress });
          }

          if (timerInterval) clearInterval(timerInterval);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          if (!result || !result.imageB64) {
            throw new Error('接口已返回内容，但没有发现可用的图片数据');
          }

          const mimeType = getFormatMime(outputFormat);
          const dataURL = 'data:' + mimeType + ';base64,' + result.imageB64;

          const now = new Date();
          const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
          const headTitle = mode === 'image' ? '参考图改绘结果' : '本次生成结果';
          const headDesc = mode === 'image'
            ? '基于参考图生成，耗时 ' + elapsed + ' 秒。'
            : '提示词已提交，耗时 ' + elapsed + ' 秒生成完成。';

          const RATIO_CSS = { '自动生成': 'auto', '1:1 正方形': '1/1', '16:9 横版': '16/9', '4:3 横版': '4/3', '3:4 竖版': '3/4', '9:16 竖版': '9/16' };
          const aspectRatio = RATIO_CSS[ratio] || 'auto';
          const previewStyle = aspectRatio !== 'auto' ? ' style="aspect-ratio:' + aspectRatio + '"' : '';

          canvas.innerHTML = '<div class="gen-results"><div class="gen-result-head"><div><h3>' + headTitle + '</h3><p>' + headDesc + '</p></div><span class="gen-status">完成 · ' + timeStr + '</span></div><div class="gen-single-preview"' + previewStyle + '><div class="result-image-wrap"><img src="' + dataURL + '" alt="生成图片" loading="lazy" class="result-image"><span class="result-badge">01</span></div><div class="result-actions"><button type="button" class="result-action-btn" data-action="download" title="下载"><svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></button></div><div class="result-meta"><strong>图片 01</strong><span>' + ratio + ' · ' + outputFormat.toUpperCase() + '</span></div></div></div>';

          canvas.querySelector('.result-action-btn[data-action="download"]')?.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = 'generated-image-' + Date.now() + '.' + outputFormat;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('开始下载图片', 'success');
          });

          saveToHistory({
            id: Date.now(),
            mode: mode === 'image' ? '图生图' : '文生图',
            prompt: prompt.substring(0, 60),
            count: 1,
            ratio: ratio,
            format: outputFormat.toUpperCase(),
            cost: panel.querySelector('.cost-value')?.textContent || '$0.00',
            timestamp: now.toISOString(),
            thumbnail: dataURL
          });

        } catch (err) {
          if (timerInterval) clearInterval(timerInterval);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const hint = getErrorHint(err);
          const hintHtml = hint ? '<p class="gen-loading-hint" style="color:#f59e0b">' + hint + '</p>' : '';
          canvas.innerHTML = '<div class="gen-loading"><div class="image-empty-icon" style="background:linear-gradient(135deg,#fecaca,#fef2f2);color:#ef4444"><svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg></div><h3>生成失败</h3><p>' + (err.message || '未知错误') + '</p>' + hintHtml + '<p class="gen-loading-hint">耗时 ' + elapsed + ' 秒</p></div>';
          showToast('生成失败: ' + (err.message || '未知错误'), 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = btn.dataset.originalHTML || '<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"/></svg> 生成图片';
        }
      });
    });

    $$('.image-canvas').forEach(canvas => {
      if (!canvas.querySelector('.gen-results') && !canvas.querySelector('.mock-results')) {
        canvas.innerHTML = '<div class="image-empty"><div class="image-empty-icon"><svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/></svg></div><h3>等待生成</h3><p>输入提示词并点击「生成图片」按钮开始创作。</p></div>';
      }
    });
  })();

  const HISTORY_KEY = 'image_gen_history';
  const MAX_HISTORY = 20;

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveToHistory(entry) {
    const history = getHistory();
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* storage full */ }
    renderHistory();
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }

  function renderHistory() {
    const panel = $('#panel-history');
    if (!panel) return;
    const list = $('.history-list', panel);
    if (!list) return;

    const history = getHistory();

    if (history.length === 0) {
      list.innerHTML = '<div class="history-empty" style="grid-column:1/-1"><div class="image-empty-icon"><svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><h3>暂无记录</h3><p>生成图片后记录将显示在这里。</p></div>';
      return;
    }

    list.innerHTML = history.map(entry => {
      const date = new Date(entry.timestamp);
      const isToday = new Date().toDateString() === date.toDateString();
      const timeLabel = isToday
        ? '今天 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
        : (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
      const thumbStyle = entry.thumbnail
        ? 'background-image:url(\'' + entry.thumbnail + '\');background-size:cover;background-position:center'
        : '';

      return '<article class="history-card" data-id="' + entry.id + '"><div class="history-thumb" style="' + thumbStyle + '"></div><div class="history-info"><h3>' + (entry.prompt || '未命名') + '</h3><p>' + entry.mode + ' · ' + entry.count + ' 张 · ' + entry.cost + '</p><span>' + timeLabel + ' · ' + entry.ratio + ' · ' + entry.format + '</span></div><button type="button" class="history-delete" data-id="' + entry.id + '" title="删除记录">&times;</button></article>';
    }).join('');

    $$('.history-delete', list).forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const updated = getHistory().filter(h => h.id !== id);
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        } catch (err) { /* ignore */ }
        renderHistory();
        showToast('记录已删除', 'info');
      });
    });
  }

  renderHistory();

  const historyPanel = $('#panel-history');
  if (historyPanel) {
    const head = $('.history-head', historyPanel);
    if (head && !head.querySelector('.history-clear-btn')) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'history-clear-btn';
      clearBtn.textContent = '清空记录';
      clearBtn.addEventListener('click', () => {
        if (getHistory().length === 0) {
          showToast('暂无记录可清空', 'info');
          return;
        }
        if (confirm('确认清空所有历史记录吗？请确认已保存所需图片')) {
          clearHistory();
          showToast('记录已清空', 'success');
        }
      });
      head.appendChild(clearBtn);
    }
  }
})();
