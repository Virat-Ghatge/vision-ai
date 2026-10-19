import { describe, it, expect, beforeEach } from 'vitest';
import {
  distillViewport,
  ElementRegistry,
  DOMDeltaTracker,
  formatElementDescriptor,
  collectAllElementsDeep,
} from '../src/lib/dom';
import { estimateTokenCount } from '../src/lib/llm';

describe('M2.3: DOM Distillation & Mutation Delta Benchmark Suite', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    document.body.innerHTML = '';
    registry = new ElementRegistry();
  });

  function buildComplex1000NodeEcommerceDOM(): void {
    const container = document.createElement('div');
    container.id = 'app-root';

    // Header & Navbar
    const nav = document.createElement('nav');
    nav.innerHTML = `
      <h1>TechStore Pro</h1>
      <input type="text" id="search-input" placeholder="Search 50,000+ products..." value="" />
      <button type="button" id="search-btn">Search</button>
      <a href="/categories">All Categories</a>
      <a href="/deals">Daily Deals</a>
      <button id="cart-btn" aria-label="Shopping Cart">Cart (0)</button>
    `;
    container.appendChild(nav);

    // Hidden promotional banner (should be filtered out by visibility check)
    const hiddenBanner = document.createElement('div');
    hiddenBanner.style.display = 'none';
    hiddenBanner.innerHTML = `
      <p>Secret VIP Discount Code: VIP2026</p>
      <button>Claim Secret Deal</button>
    `;
    container.appendChild(hiddenBanner);

    // Main product listing grid (50 complex product cards with lots of nested non-interactive markup)
    const main = document.createElement('main');
    const productGrid = document.createElement('div');
    productGrid.className = 'grid-container';

    for (let i = 1; i <= 50; i++) {
      const card = document.createElement('div');
      card.className = 'product-card';

      // Non-interactive decorative wrappers and badges
      card.innerHTML = `
        <div class="card-media-wrapper">
          <img src="https://images.example.com/p${i}.jpg" alt="Product image ${i}" />
          <div class="badge-overlay">
            <span class="rating-star">★ 4.8</span>
            <span class="review-count">(1,240 reviews)</span>
          </div>
        </div>
        <div class="card-body">
          <div class="category-crumb">Electronics > Peripherals</div>
          <h2 class="product-title">UltraGlide Pro Ergonomic Wireless Mouse Series ${i}</h2>
          <p class="description">Features 26K DPI optical sensor, ultra-lightweight 58g chassis, hybrid optical switches, and dual wireless modes.</p>
          <div class="spec-table">
            <div class="spec-row"><span>Weight:</span><span>58 grams</span></div>
            <div class="spec-row"><span>Battery:</span><span>95 hours continuous</span></div>
            <div class="spec-row"><span>Connectivity:</span><span>2.4GHz / Bluetooth 5.3</span></div>
          </div>
          <div class="pricing-container">
            <span class="currency">$</span>
            <span class="price-value">${79 + i}.99</span>
            <span class="original-strike">$129.99</span>
            <span class="discount-badge">-35%</span>
          </div>
          <div class="card-actions">
            <select aria-label="Color option for product ${i}">
              <option value="black">Matte Black</option>
              <option value="white">Ghost White</option>
            </select>
            <button class="add-cart-btn" data-product-id="${i}">Add to Cart</button>
          </div>
        </div>
      `;

      productGrid.appendChild(card);
    }

    main.appendChild(productGrid);
    container.appendChild(main);

    // Footer with boilerplate links
    const footer = document.createElement('footer');
    footer.innerHTML = `
      <div class="footer-links">
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/support">Help Center</a>
      </div>
      <p class="copyright">&copy; 2026 TechStore Inc. All rights reserved.</p>
    `;
    container.appendChild(footer);

    document.body.appendChild(container);
  }

  it('compresses a 1,000+ node DOM to under 800 tokens', () => {
    buildComplex1000NodeEcommerceDOM();

    const allElements = document.querySelectorAll('*');
    expect(allElements.length).toBeGreaterThanOrEqual(1000);

    // Measure raw HTML token size
    const rawHtml = document.body.innerHTML;
    const rawTokens = estimateTokenCount(rawHtml);
    expect(rawTokens).toBeGreaterThan(15000); // 15,000+ tokens raw

    // Run distillation
    const startTime = performance.now();
    const result = distillViewport(document, registry);
    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(1000); // Sub-second execution

    // Assert token cap (< 800 tokens)
    const distilledTokens = estimateTokenCount(result.text);
    expect(distilledTokens).toBeLessThan(800);

    // Verify compression ratio: >90% token reduction
    const compressionRatio = (rawTokens - distilledTokens) / rawTokens;
    expect(compressionRatio).toBeGreaterThan(0.9);

    // Verify key interactive elements are captured with sequential IDs
    expect(result.text).toContain('<input type="text"');
    expect(result.text).toContain('placeholder="Search 50,000+ products..."');
    expect(result.text).toContain('Search</button>');
    expect(result.text).toContain('Add to Cart');

    // Verify hidden element was properly excluded
    expect(result.text).not.toContain('Secret VIP Discount');
    expect(result.text).not.toContain('Claim Secret Deal');
  });

  it('emits compact mutation deltas under 100 tokens during action execution', async () => {
    buildComplex1000NodeEcommerceDOM();
    const initialDistill = distillViewport(document, registry);
    expect(initialDistill.interactiveCount).toBeGreaterThan(10);

    const deltaTracker = new DOMDeltaTracker(registry);
    deltaTracker.start(document.body);

    // Action 1: Modify input value
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchInput.value = 'wireless gaming mouse';
    searchInput.setAttribute('value', 'wireless gaming mouse');

    // Action 2: Mutate DOM by adding an alert notification
    const alertDiv = document.createElement('div');
    alertDiv.setAttribute('role', 'alert');
    alertDiv.className = 'toast-alert error-badge';
    alertDiv.textContent = 'Only 2 items left in stock!';
    document.body.appendChild(alertDiv);

    // Action 3: Remove an element
    const dealsLink = document.querySelector('a[href="/deals"]') as HTMLElement;
    const dealsId = registry.getId(dealsLink);
    expect(dealsId).toBeDefined();
    dealsLink.remove();

    // Flush delta
    const delta = deltaTracker.flushDelta();
    deltaTracker.stop();

    expect(delta.addedCount).toBeGreaterThanOrEqual(1);
    expect(delta.modifiedCount).toBeGreaterThanOrEqual(1);
    expect(delta.removedCount).toBeGreaterThanOrEqual(1);
    expect(delta.hasAlertOrError).toBe(true);

    // Assert hard budget cap: mutation delta MUST be under 100 tokens!
    const deltaTokens = estimateTokenCount(delta.text);
    expect(deltaTokens).toBeLessThan(100);

    // Verify format contains expected sections
    expect(delta.text).toContain('[DELTA]');
    expect(delta.text).toContain('ADDED:');
    expect(delta.text).toContain('MODIFIED:');
    expect(delta.text).toContain('REMOVED:');
    expect(delta.text).toContain(`[${dealsId}]`);
  });

  it('registry accurately preserves element identities and coordinates', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Checkout';
    document.body.appendChild(btn);

    const id = registry.register(btn);
    expect(registry.getElement(id)).toBe(btn);
    expect(registry.getId(btn)).toBe(id);

    // Re-registering the same element returns identical ID
    expect(registry.register(btn)).toBe(id);

    // Dereferenced / disconnected element cleanup
    btn.remove();
    expect(registry.getElement(id)).toBeNull();
  });

  it('captures buttons inside nested Shadow DOM roots and below-the-fold Mark as complete actions', () => {
    // 1. Create a host component with open shadow root
    const customPlayer = document.createElement('div');
    customPlayer.id = 'adapt-lms-player';
    const shadowRoot = customPlayer.attachShadow({ mode: 'open' });

    // Inside shadowRoot: nested custom component with its own shadowRoot
    const innerComponent = document.createElement('div');
    innerComponent.className = 'inner-scorm-module';
    const innerShadow = innerComponent.attachShadow({ mode: 'open' });

    const shadowPlayBtn = document.createElement('button');
    shadowPlayBtn.textContent = 'Play Video Lecture';
    shadowPlayBtn.setAttribute('aria-expanded', 'false');
    innerShadow.appendChild(shadowPlayBtn);

    shadowRoot.appendChild(innerComponent);
    document.body.appendChild(customPlayer);

    // 2. Below-the-fold button (rect.top > innerHeight + 50)
    const belowFoldBtn = document.createElement('button');
    belowFoldBtn.textContent = 'Mark as complete';
    belowFoldBtn.setAttribute('title', 'Complete this module');
    belowFoldBtn.setAttribute('aria-checked', 'false');

    // Mock getBoundingClientRect so it appears below the fold (e.g. top: 2000px)
    belowFoldBtn.getBoundingClientRect = () => ({
      top: 2000,
      bottom: 2040,
      left: 100,
      right: 300,
      width: 200,
      height: 40,
      x: 100,
      y: 2000,
      toJSON: () => ({}),
    });
    document.body.appendChild(belowFoldBtn);

    const result = distillViewport(document, registry);

    // Assert that shadowPlayBtn inside nested shadow root is captured
    expect(result.text).toContain('Play Video Lecture');
    expect(result.text).toContain('expanded=false');

    // Assert that below-the-fold Mark as complete button is captured with label & checked
    expect(result.text).toContain('Mark as complete');
    expect(result.text).toContain('label="Complete this module"');
    expect(result.text).toContain('checked=false');
  });

  it('collectAllElementsDeep recursively collects elements inside open Shadow DOM roots', () => {
    const host = document.createElement('div');
    host.id = 'shadow-host';
    const shadowRoot = host.attachShadow({ mode: 'open' });

    const innerDiv = document.createElement('div');
    innerDiv.className = 'inner-scorm-module';

    const innerShadowHost = document.createElement('section');
    const nestedShadowRoot = innerShadowHost.attachShadow({ mode: 'open' });

    const nestedBtn = document.createElement('button');
    nestedBtn.textContent = 'Coursera Lesson Next';
    nestedShadowRoot.appendChild(nestedBtn);

    innerDiv.appendChild(innerShadowHost);
    shadowRoot.appendChild(innerDiv);
    document.body.appendChild(host);

    const elements = collectAllElementsDeep(document.body);
    expect(elements).toContain(host);
    expect(elements).toContain(innerDiv);
    expect(elements).toContain(innerShadowHost);
    expect(elements).toContain(nestedBtn);
  });

  it('self-heals React SPA re-rendered elements using role + accessible name + nthIndex position matching', () => {
    // Simulate a list of accordion items or module buttons on Coursera / React SPA
    const container = document.createElement('div');
    container.id = 'module-list';

    for (let i = 0; i < 3; i++) {
      const btn = document.createElement('button');
      btn.className = 'module-expand-btn';
      btn.textContent = 'Expand Module';
      container.appendChild(btn);
    }
    document.body.appendChild(container);

    const buttons = container.querySelectorAll<HTMLElement>('button');
    const id0 = registry.register(buttons[0]);
    const id1 = registry.register(buttons[1]);
    const id2 = registry.register(buttons[2]);

    // Simulate React re-rendering the whole container with new DOM nodes
    container.innerHTML = `
      <button class="module-expand-btn">Expand Module</button>
      <button class="module-expand-btn">Expand Module</button>
      <button class="module-expand-btn">Expand Module</button>
    `;

    const newButtons = container.querySelectorAll<HTMLElement>('button');
    // Original references are now disconnected
    expect(registry.getElement(id1)).toBeNull();

    // NthIndex self-healing locates the exact corresponding sibling replacement
    const healed1 = registry.findReplacementElement(id1);
    expect(healed1).not.toBeNull();
    expect(healed1).toBe(newButtons[1]);

    const healed0 = registry.findReplacementElement(id0);
    expect(healed0).toBe(newButtons[0]);

    const healed2 = registry.findReplacementElement(id2);
    expect(healed2).toBe(newButtons[2]);
  });
});

