/* ============ HERISH — logic dùng chung ============ */
(function () {
  'use strict';

  const D = window.HERISH_DATA;

  // ---- Helpers ----
  // Định dạng giá: "649.000đ" (đ đứng SAU số — tránh lỗi "d500.000" như bug #6)
  function formatPrice(v) {
    if (v == null) return '';
    return Math.round(v).toLocaleString('vi-VN') + 'đ';
  }

  // % giảm giá tính MỘT chỗ duy nhất, dùng chung cho card + trang chi tiết
  // (tránh bug #2: tỉ lệ giảm lệch giữa màn ngoài và màn detail)
  function discountOf(p) {
    if (!p.price || !p.sale || p.sale >= p.price) return 0;
    return Math.round((1 - p.sale / p.price) * 100);
  }

  const CATEGORIES = {
    'hop-qua-cao-cap': 'Hộp quà cao cấp',
    'hop-trai-tim': 'Hộp quà trái tim',
    'set-gau-bong': 'Set quà gấu bông',
  };

  // Dịp tặng / tặng ai — gắn thẻ theo bộ sưu tập
  const OCCASIONS = {
    'ban-gai': '💝 Bạn gái · Vợ',
    'me': '🌷 Mẹ & người thân',
    'sinh-nhat': '🎂 Sinh nhật',
    'valentine': '❤️ Valentine',
    '8-3-20-10': '🌸 8/3 · 20/10',
    'giang-sinh': '🎄 Giáng sinh',
    'doanh-nghiep': '🏢 Doanh nghiệp',
  };

  function occasionsOf(p) {
    const occ = ['ban-gai', 'sinh-nhat', '8-3-20-10'];
    if (p.category === 'hop-trai-tim') occ.push('valentine');
    if (p.category === 'hop-qua-cao-cap') occ.push('valentine', 'me', 'giang-sinh');
    if (p.category === 'set-gau-bong') occ.push('giang-sinh');
    return occ;
  }

  function categoryLabel(key) { return CATEGORIES[key] || 'Quà tặng'; }

  function productUrl(p) { return 'product.html?code=' + encodeURIComponent(p.code); }

  // ---- Product card (dùng chung các trang) ----
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---- Header/footer chung (menu căn giữa, CTA tách riêng bên phải) ----
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
          <a href="index.html#why">Vì sao chọn Herish</a>
          <a href="index.html#faq">Hỏi đáp</a>
          <a href="index.html#contact">Liên hệ</a>
        </nav>
        <div class="header-actions">
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
              <li><a href="products.html?cat=hop-trai-tim">Hộp quà trái tim</a></li>
              <li><a href="products.html?cat=hop-qua-cao-cap">Hộp quà cao cấp</a></li>
              <li><a href="products.html?cat=set-gau-bong">Set quà gấu bông</a></li>
              <li><a href="reminders.html">Nhắc hẹn tặng quà</a></li>
            </ul>
          </div>
          <div>
            <h4>Liên hệ</h4>
            <ul>
              <li><a href="tel:${c.hotline}">📞 ${c.hotline}</a></li>
              <li><a href="mailto:${c.email}">✉️ ${c.email}</a></li>
              <li>🕣 ${c.availability}</li>
              <li><a href="https://zalo.me/${c.hotline}" target="_blank" rel="noopener">💬 Chat Zalo</a></li>
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

    document.getElementById('navToggle').addEventListener('click', () => {
      document.getElementById('mainNav').classList.toggle('open');
    });
    const fab = document.getElementById('fabTop');
    window.addEventListener('scroll', () => {
      fab.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });
    fab.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---- Làm mới dữ liệu từ API thật (nếu backend còn sống); lỗi thì im lặng dùng snapshot ----
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
              code: p.product_code,
              name,
              short: p.short_description || '',
              desc: p.description || '',
              price: p.price,
              sale: p.sale_price,
              stock: p.stock || 0,
              sold: p.sold_count || 0,
              views: p.views || 0,
              image: (old && old.image) || (p.thumbnail ? p.thumbnail.replace('http://', 'https://') : ''),
              category: cat,
            };
          });
        if (fresh.length) {
          D.products = fresh;
          if (onUpdate) onUpdate();
        }
      })
      .catch(() => { /* backend sập → giữ snapshot, web vẫn chạy */ });
  }

  // ---- Nhắc hẹn: lưu hồ sơ + danh sách nhắc trên máy người dùng ----
  const Reminder = {
    getProfile() {
      try { return JSON.parse(localStorage.getItem('herish_profile')); } catch (e) { return null; }
    },
    saveProfile(p) { localStorage.setItem('herish_profile', JSON.stringify(p)); },
    clearProfile() { localStorage.removeItem('herish_profile'); },
    list() {
      try { return JSON.parse(localStorage.getItem('herish_reminders')) || []; } catch (e) { return []; }
    },
    save(items) { localStorage.setItem('herish_reminders', JSON.stringify(items)); },
    add(r) { const items = this.list(); r.id = 'r' + (items.length ? Math.max(...items.map(x => +x.id.slice(1))) + 1 : 1); items.push(r); this.save(items); return r; },
    remove(id) { this.save(this.list().filter(r => r.id !== id)); },

    // Ngày sự kiện sắp tới (tự nhảy sang năm sau nếu đã qua, với lịch lặp hằng năm)
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
    // Link Google Calendar: sự kiện đặt vào NGÀY NHẮC (trước sự kiện N ngày), lặp hằng năm
    // → Google tự thông báo về Gmail của người dùng đúng ngày nhắc
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
    CATEGORIES, OCCASIONS, occasionsOf, renderChrome, toast, escapeHtml,
    tryRefreshFromApi, productUrl, Reminder,
  };
})();
