/* ============ HERISH — logic dùng chung ============ */
(function () {
  'use strict';

  const D = window.HERISH_DATA;

  // ===== KÊNH ĐẶT HÀNG CHÍNH — thay link shop thật TẠI ĐÂY là đồng bộ toàn trang =====
  const SOCIAL = {
    tiktok: 'https://www.tiktok.com/search?q=herish',   // TODO: thay bằng link TikTok Shop Herish
    shopee: 'https://shopee.vn/search?keyword=herish',  // TODO: thay bằng link Shopee Herish
    zalo: 'https://zalo.me/0972340107',
  };

  // 3 nút đặt hàng dùng chung mọi nơi
  function orderButtons() {
    return `
    <div class="order-channels">
      <a class="btn btn-tiktok" href="${SOCIAL.tiktok}" target="_blank" rel="noopener">♪ TikTok</a>
      <a class="btn btn-shopee" href="${SOCIAL.shopee}" target="_blank" rel="noopener">🛒 Shopee</a>
      <a class="btn btn-zalo" href="${SOCIAL.zalo}" target="_blank" rel="noopener">💬 Zalo</a>
    </div>`;
  }

  // ---- Helpers ----
  // Định dạng giá: "649.000đ" (đ đứng SAU số — tránh lỗi "d500.000" như bug #6)
  function formatPrice(v) {
    if (v == null) return '';
    return Math.round(v).toLocaleString('vi-VN') + 'đ';
  }

  // % giảm giá tính MỘT chỗ duy nhất, dùng chung cho card + trang chi tiết
  function discountOf(p) {
    if (!p.price || !p.sale || p.sale >= p.price) return 0;
    return Math.round((1 - p.sale / p.price) * 100);
  }

  const CATEGORIES = {
    'hop-qua-cao-cap': 'Hộp quà cao cấp',
    'hop-trai-tim': 'Hộp quà trái tim',
    'set-gau-bong': 'Set quà gấu bông',
  };

  // Tặng ai — bộ lọc chính trang sản phẩm
  const RECIPIENTS = {
    'cha-me': '🌷 Quà tặng cha mẹ',
    'be': '🧸 Quà tặng bé',
    'doanh-nghiep': '🏢 Quà tặng Doanh nghiệp',
    'nguoi-yeu': '❤️ Quà tặng người yêu',
    'ban-gai': '💝 Quà tặng bạn gái',
  };

  function recipientsOf(p) {
    const rec = ['ban-gai'];                                  // mọi set quà đều hợp tặng bạn gái
    if (p.category === 'hop-trai-tim') rec.push('nguoi-yeu');
    if (p.category === 'hop-qua-cao-cap') rec.push('nguoi-yeu', 'cha-me');
    if (p.category === 'set-gau-bong') rec.push('be');
    return rec;
  }

  // Dịp tặng — bộ lọc phụ
  const OCCASIONS = {
    'sinh-nhat': '🎂 Sinh nhật',
    'valentine': '❤️ Valentine',
    '8-3-20-10': '🌸 8/3 · 20/10',
    'giang-sinh': '🎄 Giáng sinh',
  };

  function occasionsOf(p) {
    const occ = ['sinh-nhat', '8-3-20-10'];
    if (p.category === 'hop-trai-tim') occ.push('valentine');
    if (p.category === 'hop-qua-cao-cap') occ.push('valentine', 'giang-sinh');
    if (p.category === 'set-gau-bong') occ.push('giang-sinh');
    return occ;
  }

  function categoryLabel(key) { return CATEGORIES[key] || 'Quà tặng'; }
  function productUrl(p) { return 'product.html?code=' + encodeURIComponent(p.code); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---- Product card ----
  function productCard(p) {
    const disc = discountOf(p);
    const img = p.image
      ? `<img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy">`
      : `<div class="no-img"><span class="gift-ico">🎁</span><span>${escapeHtml(p.code)}</span></div>`;
    return `
    <article class="prod-card">
      <a class="prod-thumb" href="${productUrl(p)}" aria-label="${escapeHtml(p.name)}">
        ${img}
        ${disc > 0 ? `<span class="badge-discount">-${disc}%</span>` : ''}
        ${p.stock <= 0 ? `<span class="badge-soldout">Hết hàng</span>` : ''}
      </a>
      <div class="prod-body">
        <a class="prod-name" href="${productUrl(p)}">${escapeHtml(p.name)}</a>
        <div class="prod-price">
          <span class="price-sale">${formatPrice(p.sale)}</span>
          ${disc > 0 ? `<span class="price-old">${formatPrice(p.price)}</span>` : ''}
        </div>
        <div class="prod-meta">
          <span>👁 ${p.views} lượt xem</span>
          <span>🛒 Đã bán ${p.sold}</span>
        </div>
        <a class="prod-btn" href="${productUrl(p)}">Xem chi tiết</a>
      </div>
    </article>`;
  }

  // ============ CỔNG ĐĂNG NHẬP ============
  // Web tĩnh (GitHub Pages) → tài khoản lưu trên trình duyệt người dùng.
  // Mật khẩu KHÔNG lưu trần: băm SHA-256 kèm salt ngẫu nhiên riêng mỗi người.
  const Auth = {
    async _hash(password, salt) {
      const data = new TextEncoder().encode(salt + '::' + password);
      const buf = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    _salt() {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
    },
    _today() { return new Date().toISOString().slice(0, 10); },
    users() { try { return JSON.parse(localStorage.getItem('herish_users')) || {}; } catch (e) { return {}; } },
    _saveUsers(u) { localStorage.setItem('herish_users', JSON.stringify(u)); },

    async register({ name, email, password, phone }) {
      email = (email || '').trim().toLowerCase();
      name = (name || '').trim();
      if (!name) throw new Error('Bạn hãy nhập tên nhé.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email chưa đúng định dạng.');
      phone = (phone || '').trim();
      if (!/^[0-9+][0-9+ ]{7,14}$/.test(phone)) throw new Error('Bạn hãy nhập số điện thoại để Herish nhắc hẹn qua điện thoại nhé.');
      if ((password || '').length < 6) throw new Error('Mật khẩu cần ít nhất 6 ký tự.');
      const users = this.users();
      if (users[email]) throw new Error('Email này đã có tài khoản — bạn hãy đăng nhập nhé.');
      const salt = this._salt();
      const hash = await this._hash(password, salt);
      users[email] = { name, email, phone, salt, hash, created: this._today() };
      this._saveUsers(users);
      this._setSession(email);
      this._migrateGuest(email);
      return this.current();
    },

    async login(email, password) {
      email = (email || '').trim().toLowerCase();
      const users = this.users();
      const u = users[email];
      if (!u) throw new Error('Email này chưa đăng ký. Bạn hãy tạo tài khoản mới nhé.');
      const hash = await this._hash(password || '', u.salt);
      if (hash !== u.hash) throw new Error('Mật khẩu không đúng. Bạn thử lại nhé.');
      this._setSession(email);
      this._migrateGuest(email);
      return this.current();
    },

    _setSession(email) { localStorage.setItem('herish_session', email); },
    logout() { localStorage.removeItem('herish_session'); },

    current() {
      const email = localStorage.getItem('herish_session');
      if (!email) return null;
      const u = this.users()[email];
      if (!u) return null;
      const { salt, hash, ...safe } = u;   // không trả ra salt/hash
      return safe;
    },

    // Gộp lịch nhắc đã tạo lúc chưa đăng nhập (khách) vào tài khoản vừa vào
    _migrateGuest(email) {
      const old = localStorage.getItem('herish_reminders');
      if (old) {
        const key = 'herish_reminders_' + email;
        if (!localStorage.getItem(key)) localStorage.setItem(key, old);
        localStorage.removeItem('herish_reminders');
      }
      localStorage.removeItem('herish_profile');
    },
  };

  // ---- Header/footer chung (menu căn giữa, có khu vực đăng nhập) ----
  function renderChrome(active) {
    const c = D.contact;
    const header = `
    <div class="topbar">
      <div class="container">
        <span>🎁 Freeship đơn từ 300K — Gói quà miễn phí</span>
        <span>Hotline: <a href="tel:${c.hotline}">${c.hotline}</a> · ${c.availability}</span>
      </div>
    </div>
    <header class="site-header">
      <div class="container">
        <a class="logo" href="index.html">Her<span class="i-dot">ı</span>sh</a>
        <nav class="main-nav" id="mainNav">
          <a href="index.html" ${active === 'home' ? 'class="active"' : ''}>Trang chủ</a>
          <a href="products.html" ${active === 'products' ? 'class="active"' : ''}>Sản phẩm</a>
          <a href="reminders.html" ${active === 'reminders' ? 'class="active"' : ''}>Nhắc hẹn</a>
          <a href="index.html#faq">Hỏi đáp</a>
          <a href="index.html#contact">Liên hệ</a>
        </nav>
        <div class="header-actions">
          <span id="authSlot"></span>
          <a class="nav-cta" href="products.html">🎁 Đặt quà ngay</a>
          <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
        </div>
      </div>
    </header>`;

    const footer = `
    <footer class="site-footer" id="contact-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="logo" href="index.html">Her<span class="i-dot">ı</span>sh</a>
            <p>Herish — thương hiệu quà tặng giúp bạn trao gửi yêu thương trọn vẹn.
            Mỗi hộp quà được tuyển chọn và gói ghém tỉ mỉ, sẵn sàng thay bạn nói lời trân quý nhất.</p>
          </div>
          <div>
            <h4>Khám phá</h4>
            <ul>
              <li><a href="products.html">Tất cả sản phẩm</a></li>
              <li><a href="products.html?rec=nguoi-yeu">Quà tặng người yêu</a></li>
              <li><a href="products.html?rec=cha-me">Quà tặng cha mẹ</a></li>
              <li><a href="products.html?rec=be">Quà tặng bé</a></li>
              <li><a href="reminders.html">Nhắc hẹn tặng quà</a></li>
            </ul>
          </div>
          <div>
            <h4>Tài khoản & đặt hàng</h4>
            <ul>
              <li><a href="login.html">Đăng nhập / Đăng ký</a></li>
              <li><a href="${SOCIAL.tiktok}" target="_blank" rel="noopener">♪ TikTok Shop</a></li>
              <li><a href="${SOCIAL.shopee}" target="_blank" rel="noopener">🛒 Shopee</a></li>
              <li><a href="${SOCIAL.zalo}" target="_blank" rel="noopener">💬 Chat Zalo</a></li>
              <li><a href="tel:${c.hotline}">📞 ${c.hotline}</a></li>
              <li><a href="mailto:${c.email}">✉️ ${c.email}</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">© ${new Date().getFullYear()} Herish. Trao quà — gửi trọn yêu thương.</div>
      </div>
    </footer>
    <button class="fab-top" id="fabTop" aria-label="Lên đầu trang">↑</button>
    <div class="toast" id="toast"></div>`;

    document.getElementById('app-header').innerHTML = header;
    document.getElementById('app-footer').innerHTML = footer;

    renderAuthSlot();

    document.getElementById('navToggle').addEventListener('click', () => {
      document.getElementById('mainNav').classList.toggle('open');
    });
    const fab = document.getElementById('fabTop');
    // Trang chủ: menu trong suốt đè lên banner, cuộn xuống mới hiện nền
    const sh = document.querySelector('.site-header');
    if (active === 'home') sh.classList.add('home-hero', 'at-top');
    window.addEventListener('scroll', () => {
      fab.classList.toggle('show', window.scrollY > 500);
      if (active === 'home') sh.classList.toggle('at-top', window.scrollY < 50);
    }, { passive: true });
    fab.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Khu vực đăng nhập trên header
  function renderAuthSlot() {
    const slot = document.getElementById('authSlot');
    if (!slot) return;
    const user = Auth.current();
    if (!user) {
      slot.innerHTML = `<a class="nav-login" href="login.html">👤 Đăng nhập</a>`;
      return;
    }
    const callName = user.name.trim().split(/\s+/).slice(-1)[0] || user.name;
    const initial = callName.charAt(0).toUpperCase();
    slot.innerHTML = `
      <div class="user-chip" id="userChip" tabindex="0">
        <span class="avatar-sm">${escapeHtml(initial)}</span>
        <span class="user-name">${escapeHtml(callName)}</span>
        <span class="caret">▾</span>
        <div class="user-menu" id="userMenu">
          <div class="user-menu-head">
            <b>${escapeHtml(user.name)}</b>
            <span>${escapeHtml(user.email)}</span>
          </div>
          <a href="reminders.html">⏰ Nhắc hẹn của tôi</a>
          <button type="button" id="logoutBtn">↩ Đăng xuất</button>
        </div>
      </div>`;
    const chip = document.getElementById('userChip');
    const menu = document.getElementById('userMenu');
    chip.addEventListener('click', (e) => {
      if (e.target.id === 'logoutBtn') return;
      menu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!chip.contains(e.target)) menu.classList.remove('open');
    });
    document.getElementById('logoutBtn').addEventListener('click', () => {
      Auth.logout();
      toast('Đã đăng xuất. Hẹn gặp lại bạn 💜');
      setTimeout(() => { window.location.href = 'index.html'; }, 700);
    });
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---- Làm mới dữ liệu từ API thật (nếu backend còn sống) ----
  function tryRefreshFromApi(onUpdate) {
    fetch(D.api + '/products?per_page=100', { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(res => {
        if (!res.success || !res.data || !res.data.items) return;
        const fresh = res.data.items
          .filter(p => p.status === 'active')
          .map(p => {
            const old = D.products.find(o => o.code === p.product_code);
            const name = p.product_name || '';
            let cat = 'hop-qua-cao-cap';
            if (name.toUpperCase().includes('SET QUÀ')) cat = 'set-gau-bong';
            else if (name.toUpperCase().includes('TRÁI TIM')) cat = 'hop-trai-tim';
            return {
              code: p.product_code, name,
              short: p.short_description || '', desc: p.description || '',
              price: p.price, sale: p.sale_price, stock: p.stock || 0,
              sold: p.sold_count || 0, views: p.views || 0,
              image: (old && old.image) || (p.thumbnail ? p.thumbnail.replace('http://', 'https://') : ''),
              category: cat,
            };
          });
        if (fresh.length) { D.products = fresh; if (onUpdate) onUpdate(); }
      })
      .catch(() => { /* backend sập → giữ snapshot */ });
  }

  // ---- Nhắc hẹn: lưu THEO TỪNG TÀI KHOẢN ----
  const Reminder = {
    _key() {
      const u = Auth.current();
      return 'herish_reminders_' + (u ? u.email : 'guest');
    },
    list() { try { return JSON.parse(localStorage.getItem(this._key())) || []; } catch (e) { return []; } },
    save(items) { localStorage.setItem(this._key(), JSON.stringify(items)); },
    add(r) {
      const items = this.list();
      r.id = 'r' + (items.length ? Math.max(...items.map(x => +x.id.slice(1))) + 1 : 1);
      items.push(r); this.save(items); return r;
    },
    remove(id) { this.save(this.list().filter(r => r.id !== id)); },

    nextDate(r) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let d = new Date(r.date + 'T00:00:00');
      if (r.yearly) {
        d.setFullYear(today.getFullYear());
        if (d < today) d.setFullYear(today.getFullYear() + 1);
      }
      return d;
    },
    daysUntil(r) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return Math.round((this.nextDate(r) - today) / 86400000);
    },
    calendarUrl(r, profile) {
      const ev = this.nextDate(r);
      const remind = new Date(ev); remind.setDate(remind.getDate() - (+r.before || 0));
      const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '');
      const end = new Date(remind); end.setDate(end.getDate() + 1);
      const text = encodeURIComponent(`🎁 Nhắc: còn ${r.before} ngày đến "${r.title}"`);
      const details = encodeURIComponent(
        `Lời nhắc từ Herish — còn ${r.before} ngày nữa là đến "${r.title}" (${ev.toLocaleDateString('vi-VN')}).\n` +
        `Chọn quà sớm tại: https://dotruongtr7-sketch.github.io/herish-web/products.html\n` +
        `Hotline Herish: ${D.contact.hotline}`);
      let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(remind)}/${fmt(end)}&details=${details}`;
      if (r.yearly) url += '&recur=RRULE:FREQ=YEARLY';
      return url;
    },
  };

  window.Herish = {
    data: D, formatPrice, discountOf, productCard, categoryLabel,
    CATEGORIES, RECIPIENTS, recipientsOf, OCCASIONS, occasionsOf,
    SOCIAL, orderButtons, renderChrome, renderAuthSlot, toast,
    escapeHtml, tryRefreshFromApi, productUrl, Reminder, Auth,
  };
})();
