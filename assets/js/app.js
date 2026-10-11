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

  function categoryLabel(key) { return CATEGORIES[key] || 'Quà tặng'; }

  function productUrl(p) { return 'product.html?code=' + encodeURIComponent(p.code); }

  // ---- Product card (dùng chung trang chủ + trang sản phẩm) ----
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

  // ---- Header/footer chung ----
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
        <a class="logo" href="index.html">Herish<span>.</span></a>
        <nav class="main-nav" id="mainNav">
          <a href="index.html" ${active === 'home' ? 'class="active"' : ''}>Trang chủ</a>
          <a href="products.html" ${active === 'products' ? 'class="active"' : ''}>Sản phẩm</a>
          <a href="index.html#why">Vì sao chọn Herish</a>
          <a href="index.html#faq">Hỏi đáp</a>
          <a href="index.html#contact">Liên hệ</a>
          <a class="nav-cta" href="tel:${c.hotline}">📞 Đặt quà ngay</a>
        </nav>
        <button class="nav-toggle" id="navToggle" aria-label="Menu">☰</button>
      </div>
    </header>`;

    const footer = `
    <footer class="site-footer" id="contact-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="logo" href="index.html">Herish<span>.</span></a>
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

  window.Herish = {
    data: D, formatPrice, discountOf, productCard, categoryLabel,
    CATEGORIES, renderChrome, toast, escapeHtml, tryRefreshFromApi, productUrl,
  };
})();
