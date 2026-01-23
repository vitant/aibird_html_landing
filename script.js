(() => {
  const now = Date.now();
  const sessionId =
    sessionStorage.getItem('session_id') ||
    (crypto.randomUUID ? crypto.randomUUID() : `sess_${now}_${Math.random().toString(16).slice(2)}`);
  const sessionStart = Number(sessionStorage.getItem('session_start')) || now;
  const isNewSession = !sessionStorage.getItem('session_id');
  sessionStorage.setItem('session_id', sessionId);
  sessionStorage.setItem('session_start', String(sessionStart));

  const sessionPageviews = Number(sessionStorage.getItem('session_pageviews') || 0) + 1;
  sessionStorage.setItem('session_pageviews', String(sessionPageviews));

  const totalPageviews = Number(localStorage.getItem('total_pageviews') || 0) + 1;
  localStorage.setItem('total_pageviews', String(totalPageviews));

  const firstVisitTs = localStorage.getItem('first_visit_ts') || new Date().toISOString();
  localStorage.setItem('first_visit_ts', firstVisitTs);

  if (isNewSession) {
    const visitCount = Number(localStorage.getItem('visit_count') || 0) + 1;
    localStorage.setItem('visit_count', String(visitCount));
  }

  const header = document.querySelector('.site-header');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');

  if (navToggle && header && nav) {
    navToggle.addEventListener('click', () => {
      const isOpen = header.getAttribute('data-nav-open') === 'true';
      header.setAttribute('data-nav-open', String(!isOpen));
      navToggle.setAttribute('aria-expanded', String(!isOpen));
    });

    nav.addEventListener('click', (event) => {
      if (event.target.tagName === 'A') {
        header.setAttribute('data-nav-open', 'false');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('click', (event) => {
      if (!header.contains(event.target) && header.getAttribute('data-nav-open') === 'true') {
        header.setAttribute('data-nav-open', 'false');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  const revealItems = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    revealItems.forEach((item) => observer.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  const params = new URLSearchParams(window.location.search);
  const utmInputs = document.querySelectorAll('[data-utm]');
  utmInputs.forEach((input) => {
    const key = input.dataset.utm;
    if (!key) return;

    if (key === 'referrer') {
      input.value = document.referrer || '';
      return;
    }

    if (key === 'landing_page') {
      input.value = window.location.href;
      return;
    }

    if (params.has(key)) {
      input.value = params.get(key);
    }
  });

  const analyticsConfig = {
    gaId: document.documentElement.dataset.gaId || '',
    ymId: document.documentElement.dataset.ymId || ''
  };

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

  if (analyticsConfig.gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function gtag() {
        window.dataLayer.push(arguments);
      };
    window.gtag('js', new Date());
    window.gtag('config', analyticsConfig.gaId);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${analyticsConfig.gaId}`).catch(
      () => {}
    );
  }

  if (analyticsConfig.ymId) {
    (function (m, e, t, r, i, k, a) {
      m[i] =
        m[i] ||
        function () {
          (m[i].a = m[i].a || []).push(arguments);
        };
      m[i].l = 1 * new Date();
      (k = e.createElement(t)), (a = e.getElementsByTagName(t)[0]);
      k.async = 1;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(Number(analyticsConfig.ymId), 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true
    });
  }

  const trackEvent = (name, params = {}) => {
    if (window.gtag && analyticsConfig.gaId) {
      window.gtag('event', name, params);
    }

    if (window.ym && analyticsConfig.ymId) {
      window.ym(Number(analyticsConfig.ymId), 'reachGoal', name, params);
    }
  };

  const trackTelegramClicks = () => {
    const links = document.querySelectorAll('[data-telegram]');
    links.forEach((link) => {
      link.addEventListener('click', () => {
        trackEvent('telegram_click', { href: link.getAttribute('href') || '' });
      });
    });
  };

  trackTelegramClicks();

  const getOrientation = () => {
    const orientation = screen.orientation && screen.orientation.type ? screen.orientation.type : '';
    if (orientation.includes('portrait')) return 'portrait';
    if (orientation.includes('landscape')) return 'landscape';
    if (window.matchMedia('(orientation: portrait)').matches) return 'portrait';
    if (window.matchMedia('(orientation: landscape)').matches) return 'landscape';
    return '';
  };

  const getColorGamut = () => {
    if (window.matchMedia('(color-gamut: rec2020)').matches) return 'rec2020';
    if (window.matchMedia('(color-gamut: p3)').matches) return 'p3';
    if (window.matchMedia('(color-gamut: srgb)').matches) return 'srgb';
    return '';
  };

  const getHdrSupport = () => {
    if (
      window.matchMedia('(dynamic-range: high)').matches ||
      window.matchMedia('(video-dynamic-range: high)').matches
    ) {
      return 'yes';
    }
    if (window.matchMedia('(dynamic-range: standard)').matches) {
      return 'no';
    }
    return '';
  };

  const getPointerInfo = () => {
    const pointer = window.matchMedia('(pointer: coarse)').matches
      ? 'coarse'
      : window.matchMedia('(pointer: fine)').matches
      ? 'fine'
      : window.matchMedia('(pointer: none)').matches
      ? 'none'
      : 'unknown';
    const hover = window.matchMedia('(hover: hover)').matches
      ? 'hover'
      : window.matchMedia('(hover: none)').matches
      ? 'none'
      : 'unknown';
    const anyPointer = window.matchMedia('(any-pointer: coarse)').matches
      ? 'coarse'
      : window.matchMedia('(any-pointer: fine)').matches
      ? 'fine'
      : window.matchMedia('(any-pointer: none)').matches
      ? 'none'
      : 'unknown';
    const anyHover = window.matchMedia('(any-hover: hover)').matches
      ? 'hover'
      : window.matchMedia('(any-hover: none)').matches
      ? 'none'
      : 'unknown';
    const inputType =
      pointer === 'coarse' ? 'touch' : pointer === 'fine' ? 'mouse' : pointer === 'none' ? 'none' : 'unknown';
    return { pointer, hover, anyPointer, anyHover, inputType };
  };

  const getWebGLInfo = () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        return { vendor: '', renderer: '' };
      }
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        return {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '',
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
        };
      }
      return {
        vendor: gl.getParameter(gl.VENDOR) || '',
        renderer: gl.getParameter(gl.RENDERER) || ''
      };
    } catch (error) {
      return { vendor: '', renderer: '' };
    }
  };

  const getAdBlockStatus = (() => {
    let cached = null;
    return () => {
      if (cached !== null) {
        return cached;
      }
      if (!document.body) {
        return '';
      }
      const bait = document.createElement('div');
      bait.className = 'ad adsbox adsbygoogle ad-banner ad-slot';
      bait.style.position = 'absolute';
      bait.style.left = '-999px';
      bait.style.height = '10px';
      bait.style.width = '10px';
      document.body.appendChild(bait);
      const styles = window.getComputedStyle(bait);
      const blocked =
        bait.offsetHeight === 0 ||
        bait.clientHeight === 0 ||
        bait.offsetParent === null ||
        styles.display === 'none' ||
        styles.visibility === 'hidden';
      bait.remove();
      cached = blocked ? 'yes' : 'no';
      return cached;
    };
  })();

  const forms = document.querySelectorAll('form[data-lead]');
  forms.forEach((form) => {
    const status = form.querySelector('.form-status');
    const endpoint = form.dataset.endpoint || '';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const honeypot = form.querySelector('input[name="company"]');
      if (honeypot && honeypot.value) {
        return;
      }

      if (status) {
        status.className = 'form-status';
        status.textContent = 'Отправляем...';
      }

      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      Object.assign(payload, collectMeta());

      try {
        if (!endpoint) {
          throw new Error('Missing endpoint');
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => null);

        if (!response.ok || (data && data.ok === false)) {
          throw new Error('Request failed');
        }

        form.reset();
        if (status) {
          status.classList.add('success');
          status.textContent = 'Заявка отправлена. Мы свяжемся с вами в ближайшее время.';
        }
        trackEvent('form_submit', { form: form.dataset.formName || 'lead_form' });
      } catch (error) {
        if (status) {
          status.classList.add('error');
          status.textContent = 'Не удалось отправить заявку. Попробуйте позже или напишите в Telegram.';
        }
      }
    });
  });

  const scrollMarks = [25, 50, 75, 100];
  const fired = new Set();
  let ticking = false;

  const handleScroll = () => {
    const scrollTop = window.scrollY || window.pageYOffset;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrolled = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;

    scrollMarks.forEach((mark) => {
      if (scrolled >= mark && !fired.has(mark)) {
        fired.add(mark);
        trackEvent('scroll_depth', { percent: mark });
      }
    });
  };

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
      ticking = true;
    }
  });

  function collectMeta() {
    const connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    const timeOnSiteMs = Date.now() - sessionStart;
    const pointerInfo = getPointerInfo();
    const webglInfo = getWebGLInfo();

    return {
      page_title: document.title,
      page_url: window.location.href,
      page_path: window.location.pathname,
      page_hash: window.location.hash,
      page_search: window.location.search,
      page_host: window.location.host,
      referrer: document.referrer || '',
      user_agent: navigator.userAgent,
      language: navigator.language,
      languages: Array.isArray(navigator.languages) ? navigator.languages.join(', ') : '',
      platform: navigator.platform || '',
      cookies_enabled: navigator.cookieEnabled ? 'yes' : 'no',
      do_not_track: navigator.doNotTrack || '',
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      utc_offset_min: String(new Date().getTimezoneOffset()),
      screen_width: String(window.screen.width || ''),
      screen_height: String(window.screen.height || ''),
      screen_color_depth: String(window.screen.colorDepth || ''),
      device_pixel_ratio: String(window.devicePixelRatio || ''),
      viewport_width: String(window.innerWidth || ''),
      viewport_height: String(window.innerHeight || ''),
      screen_orientation: getOrientation(),
      color_gamut: getColorGamut(),
      hdr_support: getHdrSupport(),
      hardware_concurrency: String(navigator.hardwareConcurrency || ''),
      device_memory: String(navigator.deviceMemory || ''),
      max_touch_points: String(navigator.maxTouchPoints || ''),
      connection_type: connection && connection.type ? connection.type : '',
      connection_effective_type: connection && connection.effectiveType ? connection.effectiveType : '',
      connection_downlink: connection && connection.downlink ? String(connection.downlink) : '',
      connection_rtt: connection && connection.rtt ? String(connection.rtt) : '',
      connection_save_data: connection && connection.saveData ? 'yes' : 'no',
      prefers_color_scheme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
      prefers_reduced_motion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'reduce'
        : 'no-preference',
      webgl_vendor: webglInfo.vendor,
      webgl_renderer: webglInfo.renderer,
      adblock_detected: getAdBlockStatus(),
      input_type: pointerInfo.inputType,
      pointer_primary: pointerInfo.pointer,
      hover_primary: pointerInfo.hover,
      any_pointer: pointerInfo.anyPointer,
      any_hover: pointerInfo.anyHover,
      client_time_local: new Date().toLocaleString(),
      client_time_iso: new Date().toISOString(),
      session_id: sessionId,
      session_start: new Date(sessionStart).toISOString(),
      session_pageviews: String(sessionPageviews),
      total_pageviews: String(totalPageviews),
      visit_count: localStorage.getItem('visit_count') || '1',
      first_visit_ts: firstVisitTs,
      time_on_site_ms: String(timeOnSiteMs)
    };
  }
})();
