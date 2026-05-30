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

  (function initDarkMode() {
    const root = document.documentElement;

    function applyTheme(isDark) {
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
      console.log('[深色模式]', isDark ? '深色' : '浅色');
    }

    function getSystemDark() {
      try {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch (e) {
        return false;
      }
    }

    function getParentDark() {
      try {
        if (window.parent && window.parent !== window) {
          const parentDoc = window.parent.document;
          const parentTheme = parentDoc.documentElement.getAttribute('data-theme');
          if (parentTheme) return parentTheme === 'dark';
          const parentCS = window.parent.getComputedStyle(parentDoc.documentElement);
          if (parentCS.colorScheme && parentCS.colorScheme.includes('dark')) return true;
          const parentBg = parentCS.backgroundColor;
          if (parentBg) {
            const match = parentBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
              const brightness = (parseInt(match[1]) * 299 + parseInt(match[2]) * 587 + parseInt(match[3]) * 114) / 1000;
              return brightness < 128;
            }
          }
        }
      } catch (e) {
        console.log('[深色模式] 无法访问父级窗口:', e.message);
      }
      return null;
    }

    let currentDark = false;

    function syncTheme() {
      const parentDark = getParentDark();
      const isDark = parentDark !== null ? parentDark : getSystemDark();
      if (isDark !== currentDark) {
        currentDark = isDark;
        applyTheme(isDark);
      }
    }

    syncTheme();

    try {
      if (window.parent && window.parent !== window) {
        const parentDoc = window.parent.document;
        const observer = new MutationObserver(function() {
          syncTheme();
        });
        observer.observe(parentDoc.documentElement, {
          attributes: true,
          attributeFilter: ['data-theme', 'class', 'style']
        });
        console.log('[深色模式] 已监听父级窗口变化');
      }
    } catch (e) {
      console.log('[深色模式] 无法监听父级窗口:', e.message);
    }

    try {
      if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = function() {
          if (getParentDark() === null) {
            syncTheme();
          }
        };
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', handler);
        } else if (mediaQuery.addListener) {
          mediaQuery.addListener(handler);
        }
        console.log('[深色模式] 已监听系统主题变化');
      }
    } catch (e) {
      console.log('[深色模式] 无法监听系统主题:', e.message);
    }

    window.addEventListener('focus', syncTheme);
    setInterval(syncTheme, 2000);
  })();

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

  function showConfirm(title, message) {
    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = '<div class="confirm-backdrop"></div><div class="confirm-dialog"><div class="confirm-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg></div><h3 class="confirm-title"></h3><p class="confirm-message"></p><div class="confirm-actions"><button type="button" class="confirm-btn confirm-btn-cancel">取消</button><button type="button" class="confirm-btn confirm-btn-confirm">确认清空</button></div></div>';
      overlay.querySelector('.confirm-title').textContent = title;
      overlay.querySelector('.confirm-message').textContent = message;
      document.body.appendChild(overlay);
      requestAnimationFrame(function() { overlay.classList.add('confirm-active'); });

      function close(result) {
        overlay.classList.remove('confirm-active');
        setTimeout(function() { overlay.remove(); }, 250);
        resolve(result);
      }

      overlay.querySelector('.confirm-backdrop').addEventListener('click', function() { close(false); });
      overlay.querySelector('.confirm-btn-cancel').addEventListener('click', function() { close(false); });
      overlay.querySelector('.confirm-btn-confirm').addEventListener('click', function() { close(true); });
      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handler);
          close(false);
        }
      });
    });
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

  // ============================================================
  // SizeIntent 尺寸意图自动降级模块
  // ============================================================

  const SIZE_MATRIX = {
    '1:1': {
      '1k': [1024, 1024],
      '2k': [2048, 2048],
      '4k': [4096, 4096]
    },
    '4:3': {
      '1k': [1365, 1024],
      '2k': [2730, 2048],
      '4k': [5461, 4096]
    },
    '3:4': {
      '1k': [1024, 1365],
      '2k': [2048, 2730],
      '4k': [4096, 5461]
    },
    '16:9': {
      '1k': [1536, 864],
      '2k': [2048, 1152],
      '4k': [3840, 2160]
    },
    '9:16': {
      '1k': [864, 1536],
      '2k': [1152, 2048],
      '4k': [2160, 3840]
    }
  };

  const ASPECT_PROMPT_MAP = {
    '1:1': 'square composition',
    '4:3': 'landscape composition, 4:3 aspect ratio',
    '3:4': 'portrait composition, 3:4 aspect ratio',
    '16:9': 'cinematic wide composition, 16:9 aspect ratio',
    '9:16': 'vertical mobile composition, 9:16 aspect ratio'
  };

  const RESOLUTION_PROMPT_MAP = {
    '1k': 'high detail',
    '2k': 'ultra detailed, high resolution',
    '4k': 'extremely detailed, 4k quality, ultra high resolution'
  };

  function getGPTModelCapabilities(modelID) {
    const normalized = String(modelID || '').toLowerCase();
    
    if (normalized.startsWith('gpt-image') || normalized.startsWith('chatgpt-image')) {
      return {
        supportsSize: true,
        supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
        maxResolution: 1536
      };
    }
    
    if (normalized.startsWith('dall-e-3')) {
      return {
        supportsSize: true,
        supportedSizes: ['1024x1024', '1792x1024', '1024x1792'],
        maxResolution: 1792
      };
    }
    
    if (normalized.startsWith('dall-e-2')) {
      return {
        supportsSize: true,
        supportedSizes: ['256x256', '512x512', '1024x1024'],
        maxResolution: 1024
      };
    }
    
    return {
      supportsSize: true,
      supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
      maxResolution: 1536
    };
  }

  function buildSizeIntent(ratio, resolutionTier) {
    const isAutoRatio = (ratio === '自动生成');
    const isAutoTier = (resolutionTier === 'auto');
    
    if (isAutoRatio && isAutoTier) {
      return {
        aspect: 'auto',
        resolution: 'auto',
        width: null,
        height: null,
        size: 'auto',
        aspectRatio: null,
        promptEnhancement: ''
      };
    }
    
    const aspectKey = isAutoRatio ? '1:1' : ratio.replace(/ 正方形| 横版| 竖版/g, '');
    const resolutionKey = isAutoTier ? '1k' : resolutionTier.toLowerCase();
    
    const sizeEntry = SIZE_MATRIX[aspectKey]?.[resolutionKey];
    const width = sizeEntry ? sizeEntry[0] : 1024;
    const height = sizeEntry ? sizeEntry[1] : 1024;
    
    const aspectDesc = ASPECT_PROMPT_MAP[aspectKey] || '';
    const resolutionDesc = RESOLUTION_PROMPT_MAP[resolutionKey] || '';
    const promptEnhancement = [aspectDesc, resolutionDesc].filter(Boolean).join(', ');
    
    return {
      aspect: aspectKey,
      resolution: resolutionKey,
      width,
      height,
      size: `${width}x${height}`,
      aspectRatio: `${width}:${height}`,
      promptEnhancement
    };
  }

  function applySizeIntentToTool(tool, sizeIntent, modelID) {
    const capabilities = getGPTModelCapabilities(modelID);
    
    console.log('[生图调试] ===== 尺寸应用 =====');
    console.log('[生图调试] 模型ID:', modelID);
    console.log('[生图调试] 模型能力:', JSON.stringify(capabilities, null, 2));
    console.log('[生图调试] 期望尺寸:', sizeIntent.size);
    
    if (sizeIntent.size === 'auto') {
      tool.size = 'auto';
      console.log('[生图调试] 结果: 自动模式，使用auto');
      return tool;
    }
    
    if (capabilities.supportedSizes.includes(sizeIntent.size)) {
      tool.size = sizeIntent.size;
      console.log('[生图调试] 结果: 模型直接支持，使用', tool.size);
      return tool;
    }
    
    console.log('[生图调试] 模型不直接支持', sizeIntent.size, '，开始降级...');
    
    const scale = Math.min(
      capabilities.maxResolution / sizeIntent.width,
      capabilities.maxResolution / sizeIntent.height,
      1
    );
    const scaledWidth = Math.floor(sizeIntent.width * scale);
    const scaledHeight = Math.floor(sizeIntent.height * scale);
    
    const roundTo64 = (n) => Math.round(n / 64) * 64;
    tool.size = `${roundTo64(scaledWidth)}x${roundTo64(scaledHeight)}`;
    
    console.log('[生图调试] 缩放比例:', scale.toFixed(4));
    console.log('[生图调试] 缩放后:', scaledWidth + 'x' + scaledHeight);
    console.log('[生图调试] 对齐64后:', tool.size);
    console.log('[生图调试] 最终降级: ' + sizeIntent.size + ' -> ' + tool.size + ' (模型最大' + capabilities.maxResolution + ')');
    return tool;
  }

  function enhancePromptWithSizeIntent(prompt, sizeIntent) {
    if (!sizeIntent.promptEnhancement) return prompt;
    
    const lowerPrompt = prompt.toLowerCase();
    const skipKeywords = ['aspect ratio', 'resolution', 'composition', 'detail', '4k', '2k', '1k'];
    const hasExistingSizeHint = skipKeywords.some(kw => lowerPrompt.includes(kw));
    
    if (hasExistingSizeHint) return prompt;
    
    return `${prompt}, ${sizeIntent.promptEnhancement}`;
  }

  console.log('[生图调试] SizeIntent模块已加载');

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

  // 最大重试次数：请求失败时最多重试3次
  const MAX_ATTEMPTS = 3;
  // 重试等待间隔：两次重试之间暂停15秒（单位：毫秒）
  const RETRY_BACKOFF_MS = 15000;
  // 最大并发数：同时生成的图片数量上限，避免并发过高导致接口限流
  const MAX_CONCURRENT = 10;

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

  async function generateWithConcurrency(tasks, maxConcurrent, onProgress) {
    const results = new Array(tasks.length);
    let completedCount = 0;
    let nextIndex = 0;

    function updateProgress() {
      if (onProgress) {
        onProgress('已完成 ' + completedCount + '/' + tasks.length + ' 张图片');
      }
    }

    async function runTask(index) {
      const task = tasks[index];
      try {
        results[index] = await task();
        completedCount++;
        updateProgress();
      } catch (err) {
        results[index] = { error: err, index };
        completedCount++;
        updateProgress();
      }
    }

    const workers = [];
    const concurrentCount = Math.min(maxConcurrent, tasks.length);

    for (let i = 0; i < concurrentCount; i++) {
      workers.push((async () => {
        while (nextIndex < tasks.length) {
          const currentIndex = nextIndex++;
          await runTask(currentIndex);
        }
      })());
    }

    await Promise.all(workers);
    return results;
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
    
    const tierBtn = panel.querySelector('.tier-btn-active');
    const resolutionTier = tierBtn?.dataset?.tier || 'auto';
    
    console.log('[生图调试] ===== 参数解析 =====');
    console.log('[生图调试] 画面比例:', ratio);
    console.log('[生图调试] 分辨率档位:', resolutionTier);
    console.log('[生图调试] 模型:', model);
    console.log('[生图调试] 质量:', quality);
    console.log('[生图调试] 输出格式:', outputFormat);
    
    const sizeIntent = buildSizeIntent(ratio, resolutionTier);
    console.log('[生图调试] SizeIntent:', JSON.stringify(sizeIntent, null, 2));
    
    const range = panel.querySelector('.image-range');
    const count = range ? parseInt(range.value) || 1 : 1;
    return { prompt, model, quality, outputFormat, sizeIntent, ratio, resolutionTier, count };
  }

  async function textToImage({ prompt, baseURL, apiKey, imageModel, sizeIntent, quality, outputFormat, onProgress }) {
    const tool = {
      type: 'image_generation',
      model: imageModel || 'gpt-image-2',
      action: 'generate',
      size: 'auto',
      quality: quality || 'auto',
      output_format: outputFormat || 'png',
      moderation: 'low',
      partial_images: 0
    };
    
    applySizeIntentToTool(tool, sizeIntent, imageModel);
    const enhancedPrompt = enhancePromptWithSizeIntent(prompt, sizeIntent);
    
    console.log('[生图调试] ===== 最终请求 =====');
    console.log('[生图调试] tool.size:', tool.size);
    console.log('[生图调试] tool.model:', tool.model);
    console.log('[生图调试] tool.quality:', tool.quality);
    console.log('[生图调试] enhancedPrompt:', enhancedPrompt);
    
    const body = {
      model: 'gpt-5.5',
      instructions: 'You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave.',
      input: [{ role: 'user', content: [{ type: 'input_text', text: enhancedPrompt }] }],
      tools: [tool],
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
          prompt: enhancedPrompt,
          n: 1,
          size: tool.size === 'auto' ? '1024x1024' : tool.size,
          quality: quality || 'auto',
          output_format: outputFormat || 'png',
          response_format: 'b64_json'
        };
        return requestImagesAPI(baseURL, apiKey, imagesBody, onProgress);
      }
      throw err;
    }
  }

  async function imageToImage({ prompt, sourceImages, baseURL, apiKey, imageModel, sizeIntent, quality, outputFormat, onProgress }) {
    const tool = {
      type: 'image_generation',
      model: imageModel || 'gpt-image-2',
      action: 'edit',
      size: 'auto',
      quality: quality || 'auto',
      output_format: outputFormat || 'png',
      moderation: 'low',
      partial_images: 0
    };
    
    applySizeIntentToTool(tool, sizeIntent, imageModel);
    const enhancedPrompt = enhancePromptWithSizeIntent(prompt, sizeIntent);
    
    console.log('[生图调试] 图生图应用SizeIntent后tool:', { size: tool.size });
    
    const content = [{ type: 'input_text', text: enhancedPrompt }];
    for (const dataURL of sourceImages) {
      content.push({ type: 'input_image', image_url: dataURL });
    }
    const body = {
      model: 'gpt-5.5',
      instructions: 'You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave.',
      input: [{ role: 'user', content }],
      tools: [tool],
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
        form.append('prompt', enhancedPrompt);
        form.append('model', imageModel || 'gpt-image-2');
        form.append('n', '1');
        form.append('size', tool.size === 'auto' ? '1024x1024' : tool.size);
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

        const { prompt, model, quality, outputFormat, sizeIntent, ratio, resolutionTier, count } = getPanelParams(panel);
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

        canvas.innerHTML = '<div class="gen-loading"><div class="gen-spinner"></div><p class="gen-loading-text">正在并行生成 ' + count + ' 张图片，请稍候...</p><p class="gen-loading-hint gen-timer">已用时 0.0 秒</p><p class="gen-progress-text">准备中...</p></div>';

        const timerEl = canvas.querySelector('.gen-timer');
        const progressEl = canvas.querySelector('.gen-progress-text');

        timerInterval = setInterval(() => {
          if (timerEl) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            timerEl.textContent = '已用时 ' + elapsed + ' 秒';
          }
        }, 100);

        function onProgress(desc) {
          if (progressEl) progressEl.textContent = desc;
        }

        const baseURL = iframeState.srcHost || '';

        try {
          const tasks = [];
          for (let i = 0; i < count; i++) {
            tasks.push(async () => {
              if (mode === 'image') {
                return imageToImage({ prompt, sourceImages, baseURL, apiKey, imageModel: model, sizeIntent, quality, outputFormat, onProgress: (desc) => onProgress('图片 ' + (i + 1) + '/' + count + ': ' + desc) });
              } else {
                return textToImage({ prompt, baseURL, apiKey, imageModel: model, sizeIntent, quality, outputFormat, onProgress: (desc) => onProgress('图片 ' + (i + 1) + '/' + count + ': ' + desc) });
              }
            });
          }

          const results = await generateWithConcurrency(tasks, MAX_CONCURRENT, onProgress);

          if (timerInterval) clearInterval(timerInterval);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

          const successfulResults = [];
          const failedIndices = [];
          results.forEach((result, index) => {
            if (result && result.imageB64) {
              successfulResults.push({ ...result, index });
            } else {
              failedIndices.push(index);
              console.error('[生图调试] 图片 ' + (index + 1) + ' 生成失败:', result?.error || '无图片数据');
            }
          });

          if (successfulResults.length === 0) {
            throw new Error('所有图片生成均失败，请稍后重试');
          }

          const mimeType = getFormatMime(outputFormat);
          const now = new Date();
          const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
          const headTitle = mode === 'image' ? '参考图改绘结果' : '本次生成结果';
          const failNote = failedIndices.length > 0 ? '（' + failedIndices.length + ' 张生成失败）' : '';
          const headDesc = mode === 'image'
            ? '基于参考图生成 ' + successfulResults.length + '/' + count + ' 张，耗时 ' + elapsed + ' 秒' + failNote
            : '并行生成 ' + successfulResults.length + '/' + count + ' 张，耗时 ' + elapsed + ' 秒' + failNote;

          let imagesHTML = '';
          successfulResults.forEach((result, idx) => {
            const dataURL = 'data:' + mimeType + ';base64,' + result.imageB64;
            const badge = String(idx + 1).padStart(2, '0');
            imagesHTML += '<div class="result-image-wrap" data-index="' + idx + '"><img src="' + dataURL + '" alt="生成图片 ' + badge + '" loading="lazy" class="result-image" data-action="preview"><span class="result-badge">' + badge + '</span><div class="result-actions"><button type="button" class="result-action-btn" data-action="download" data-index="' + idx + '" title="下载"><svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></button><button type="button" class="result-action-btn" data-action="preview" data-index="' + idx + '" title="放大预览"><svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6"/></svg></button></div></div>';
          });

          canvas.innerHTML = '<div class="gen-results"><div class="gen-result-head"><div><h3>' + headTitle + '</h3><p>' + headDesc + '</p></div><span class="gen-status">完成 · ' + timeStr + '</span></div><div class="gen-multi-preview">' + imagesHTML + '</div></div>';

          const previewImages = canvas.querySelectorAll('.result-image[data-action="preview"], .result-action-btn[data-action="preview"]');
          previewImages.forEach(el => {
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              const wrap = el.closest('.result-image-wrap');
              const idx = parseInt(wrap?.dataset?.index ?? el.dataset?.index ?? '0');
              const result = successfulResults[idx];
              if (result) {
                const dataURL = 'data:' + mimeType + ';base64,' + result.imageB64;
                showImageLightbox(dataURL);
              }
            });
          });

          canvas.querySelectorAll('.result-action-btn[data-action="download"]').forEach(downloadBtn => {
            downloadBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const idx = parseInt(downloadBtn.dataset.index);
              const result = successfulResults[idx];
              if (result) {
                const dataURL = 'data:' + mimeType + ';base64,' + result.imageB64;
                const a = document.createElement('a');
                a.href = dataURL;
                a.download = 'generated-image-' + Date.now() + '-' + (idx + 1) + '.' + outputFormat;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('开始下载图片 ' + (idx + 1), 'success');
              }
            });
          });

          const baseTimestamp = Date.now();
          successfulResults.forEach((result, idx) => {
            saveToHistory({
              id: baseTimestamp + idx,
              mode: mode === 'image' ? '图生图' : '文生图',
              prompt: prompt.substring(0, 60),
              count: 1,
              ratio: ratio,
              format: outputFormat.toUpperCase(),
              cost: panel.querySelector('.cost-value')?.textContent || '$0.00',
              timestamp: now.toISOString(),
              thumbnail: 'data:' + mimeType + ';base64,' + result.imageB64
            });
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

  function showImageLightbox(imageSrc) {
    let overlay = document.getElementById('image-lightbox');
    if (overlay) {
      overlay.remove();
    }

    overlay = document.createElement('div');
    overlay.id = 'image-lightbox';
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = '<div class="lightbox-backdrop"></div><div class="lightbox-container"><img src="' + imageSrc + '" alt="图片预览" class="lightbox-image"><button type="button" class="lightbox-close" title="关闭">&times;</button><button type="button" class="lightbox-download" title="下载"><svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg></button></div>';

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('lightbox-active');
    });

    const closeLightbox = () => {
      overlay.classList.remove('lightbox-active');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    };

    overlay.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);

    overlay.querySelector('.lightbox-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = imageSrc;
      a.download = 'image-' + Date.now() + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('开始下载图片', 'success');
    });

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  const HISTORY_KEY = 'image_gen_history';

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

    let saved = false;

    while (!saved) {
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        saved = true;
      } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
          if (history.length > 1) {
            history.pop();
            console.warn('[历史记录] 存储空间不足，已移除最旧记录，剩余 ' + history.length + ' 条');
          } else {
            console.error('[历史记录] 存储空间严重不足，无法保存');
            break;
          }
        } else {
          console.error('[历史记录] 存储失败:', e.message);
          break;
        }
      }
    }

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
      list.innerHTML = '<div class="history-empty" style="grid-column:1/-1"><div class="image-empty-icon"><svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><h3>暂无记录</h3><p>生成图片后记录将显示在这里</p></div>';
      return;
    }

    list.innerHTML = history.map(entry => {
      const date = new Date(entry.timestamp);
      const isToday = new Date().toDateString() === date.toDateString();
      const timeLabel = isToday
        ? '今天 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0')
        : (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
      const thumbStyle = entry.thumbnail
        ? 'background-image:url(\'' + entry.thumbnail + '\');background-size:cover;background-position:center;cursor:pointer'
        : '';

      return '<article class="history-card" data-id="' + entry.id + '" data-thumbnail="' + (entry.thumbnail || '') + '"><div class="history-thumb" style="' + thumbStyle + '"></div><div class="history-info"><h3>' + (entry.prompt || '未命名') + '</h3><p>' + entry.mode + ' · ' + entry.count + ' 张 · ' + entry.cost + '</p><span>' + timeLabel + ' · ' + entry.ratio + ' · ' + entry.format + '</span></div><button type="button" class="history-delete" data-id="' + entry.id + '" title="删除记录">&times;</button></article>';
    }).join('');

    $$('.history-thumb', list).forEach(thumb => {
      thumb.addEventListener('click', e => {
        e.stopPropagation();
        const card = thumb.closest('.history-card');
        const thumbnail = card?.dataset?.thumbnail;
        if (thumbnail) {
          showImageLightbox(thumbnail);
        }
      });
    });

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
      clearBtn.addEventListener('click', async () => {
        if (getHistory().length === 0) {
          showToast('暂无记录可清空', 'info');
          return;
        }
        const confirmed = await showConfirm('清空记录', '确认清空所有历史记录吗？清空后将无法恢复');
        if (confirmed) {
          clearHistory();
          showToast('记录已清空', 'success');
        }
      });
      head.appendChild(clearBtn);
    }
  }
})();
