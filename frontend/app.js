/* Proviant — Frontend (mobile-first) */

const API = '/api';
let currentStorage = 'freezer';
let activeFilters = new Set(); // multi-select: 'out_of_stock', 'low_stock', 'expiring'
let activeCategories = new Set(); // multi-select categories
let allItems = [];
let icaEnabled = false;

// --- Category icons ---
const categoryIcons = {
    'kött': '🥩', 'fågel': '🍗', 'fisk': '🐟', 'skaldjur': '🦐',
    'grönsaker': '🥦', 'frukt': '🍎', 'bröd': '🍞', 'mejeri': '🧈',
    'glass': '🍦', 'färdigmat': '🍱', 'dryck': '🥤', 'kryddor': '🧂',
    'pasta': '🍝', 'ris': '🍚', 'konserv': '🥫', 'snacks': '🍿',
    'matlåd': '🥡', 'bakning': '🧁', 'såser': '🫙', 'övrigt': '📦',
};

function getCategoryIcon(category) {
    if (!category) return '📦';
    const lower = category.toLowerCase();
    for (const [key, icon] of Object.entries(categoryIcons)) {
        if (lower.includes(key)) return icon;
    }
    return '📦';
}

const storageLabels = {
    freezer: 'frysen', fridge: 'kylen', pantry: 'skafferiet',
};

// --- API calls ---

async function fetchItems() {
    const params = new URLSearchParams({ storage_type: currentStorage });
    const search = document.getElementById('search').value.trim();
    if (search) params.append('search', search);

    const res = await fetch(`${API}/items?${params}`);
    let items = await res.json();

    // Client-side status filtering (OR logic: show items matching ANY active filter)
    if (activeFilters.size > 0) {
        const now = new Date();
        items = items.filter(i => {
            if (activeFilters.has('out_of_stock') && i.quantity === 0) return true;
            if (activeFilters.has('low_stock') && i.quantity > 0 && i.quantity < 1) return true;
            if (activeFilters.has('expiring') && i.expiry_date) {
                const days = Math.ceil((new Date(i.expiry_date) - now) / (1000 * 60 * 60 * 24));
                if (days >= 0 && days <= 30) return true;
            }
            return false;
        });
    }

    // Client-side category filter (multi-select)
    if (activeCategories.size > 0) {
        items = items.filter(i => activeCategories.has(i.category || 'Övrigt'));
    }

    allItems = items;
    renderItems();
    fetchCategoryFilters();
    updateFilterTags();
}

async function fetchCategoryFilters() {
    const res = await fetch(`${API}/categories?storage_type=${currentStorage}`);
    const categories = await res.json();
    const container = document.getElementById('category-filters');

    if (categories.length === 0) {
        container.innerHTML = '<span style="color:var(--text-light);font-size:0.8rem">Inga kategorier ännu</span>';
        return;
    }

    container.innerHTML = categories.map(c =>
        `<button class="filter-chip${activeCategories.has(c) ? ' active' : ''}" data-category="${c}">${getCategoryIcon(c)} ${c}</button>`
    ).join('');

    container.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.category;
            if (activeCategories.has(cat)) {
                activeCategories.delete(cat);
            } else {
                activeCategories.add(cat);
            }
            fetchItems();
        });
    });
}

function updateFilterTags() {
    const container = document.getElementById('active-filter-tags');
    const filterBtn = document.getElementById('filter-toggle');
    const total = activeFilters.size + activeCategories.size;

    if (total === 0) {
        container.innerHTML = '';
        filterBtn.textContent = '🔽 Filter';
        return;
    }

    filterBtn.textContent = `🔽 Filter (${total})`;

    const labels = {
        out_of_stock: '🔴 Slut',
        low_stock: '🟡 Nästan slut',
        expiring: '⏰ Utgår snart',
    };

    let html = '';
    for (const f of activeFilters) {
        html += `<span class="filter-tag" data-type="status" data-value="${f}">${labels[f]} ✕</span>`;
    }
    for (const c of activeCategories) {
        html += `<span class="filter-tag" data-type="category" data-value="${c}">${getCategoryIcon(c)} ${c} ✕</span>`;
    }
    container.innerHTML = html;

    container.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            if (tag.dataset.type === 'status') {
                activeFilters.delete(tag.dataset.value);
            } else {
                activeCategories.delete(tag.dataset.value);
            }
            fetchItems();
        });
    });
}

async function fetchFormCategories() {
    const res = await fetch(`${API}/categories?storage_type=${currentStorage}`);
    const categories = await res.json();
    document.getElementById('categories-list').innerHTML =
        categories.map(c => `<option value="${c}">`).join('');
}

async function updateQuantity(id, newQty) {
    await fetch(`${API}/items/${id}/quantity`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: Math.max(0, newQty) }),
    });
    fetchItems();
}

async function saveItem(data) {
    const id = data.id;
    delete data.id;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API}/items/${id}` : `${API}/items`;
    const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Kunde inte spara');
    return res.json();
}

async function deleteItem(id) {
    await fetch(`${API}/items/${id}`, { method: 'DELETE' });
}

async function addToShoppingList(name) {
    try {
        const res = await fetch(`${API}/shopping-list`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error('ICA-anrop misslyckades');
        const data = await res.json();
        if (data.alreadyOnList) return 'exists';
        return 'added';
    } catch (err) {
        console.error('Shopping list error:', err);
        return 'error';
    }
}

// --- Rendering ---

function renderItems() {
    const container = document.getElementById('items-list');
    const emptyState = document.getElementById('empty-state');
    const summaryBar = document.getElementById('summary-bar');

    if (allItems.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        summaryBar.textContent = '';
        return;
    }

    emptyState.classList.add('hidden');

    // Group by category
    const groups = {};
    for (const item of allItems) {
        const cat = item.category || 'Övrigt';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
    }

    let html = '';
    for (const [category, items] of Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'sv'))) {
        html += `<div class="category-header">${getCategoryIcon(category)} ${category}</div>`;
        for (const item of items) {
            const oosClass = item.quantity === 0 ? ' out-of-stock' : '';
            const meta = buildMeta(item);
            const qtyDisplay = formatQuantity(item);
            const zeroClass = item.quantity === 0 ? ' zero' : '';
            const step = 0.5;

            const onList = item.on_shopping_list;
            const shopIcon = onList ? '📋' : '🛒';
            const shopTitle = onList ? 'Finns på inköpslistan' : 'Lägg på inköpslistan';
            const shopClass = onList ? ' on-list' : '';
            const shopBtn = icaEnabled
                ? `<button class="shop-btn${shopClass}" data-name="${escapeHtml(item.name)}" data-category="${escapeHtml(item.category || '')}" title="${shopTitle}">${shopIcon}</button>`
                : '';

            html += `
                <div class="swipe-container" data-id="${item.id}">
                    <div class="swipe-action-bg" data-id="${item.id}">🗑️ Ta bort</div>
                    <div class="item-card${oosClass}">
                        <div class="item-info" data-id="${item.id}">
                            <div class="item-name">${escapeHtml(item.name)}</div>
                            ${meta ? `<div class="item-meta">${meta}</div>` : ''}
                        </div>
                        ${shopBtn}
                        <div class="qty-controls">
                            <button class="qty-btn minus" data-id="${item.id}" data-step="${step}">−</button>
                            <span class="qty-value${zeroClass}">${qtyDisplay}</span>
                            <button class="qty-btn plus" data-id="${item.id}" data-step="${step}">+</button>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = html;

    const total = allItems.length;
    const oos = allItems.filter(i => i.quantity === 0).length;
    let summary = `${total} sak${total !== 1 ? 'er' : ''} i ${storageLabels[currentStorage]}`;
    if (oos > 0) summary += ` · ${oos} slut`;
    summaryBar.textContent = summary;

    // Event: click item info to edit
    container.querySelectorAll('.item-info').forEach(el => {
        el.addEventListener('click', () => {
            const id = parseInt(el.dataset.id);
            const item = allItems.find(i => i.id === id);
            if (item) openModal(item);
        });
    });

    // Event: shopping list button
    container.querySelectorAll('.shop-btn').forEach(btn => {
        if (btn.classList.contains('on-list')) {
            btn.disabled = true;
            return;
        }
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            let name = btn.dataset.name;
            // Append "fryst" for freezer items unless already present or category is Bröd
            const category = btn.dataset.category || '';
            if (currentStorage === 'freezer' && category.toLowerCase() !== 'bröd') {
                const lower = name.toLowerCase();
                if (!lower.includes('fryst') && !lower.includes('frysta')) {
                    name = name + ' fryst';
                }
            }
            btn.textContent = '⏳';
            btn.disabled = true;
            const result = await addToShoppingList(name);
            if (result === 'added') {
                btn.textContent = '✅';
                btn.classList.add('on-list');
                setTimeout(() => {
                    btn.textContent = '📋';
                    btn.title = 'Finns på inköpslistan';
                }, 2000);
            } else if (result === 'exists') {
                btn.textContent = '📋';
                btn.title = 'Finns redan på listan';
                btn.classList.add('on-list');
            } else {
                btn.textContent = '❌';
                setTimeout(() => {
                    btn.textContent = '🛒';
                    btn.title = 'Lägg på inköpslistan';
                    btn.disabled = false;
                }, 2000);
            }
        });
    });

    // Event: +/- buttons
    container.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const step = parseFloat(btn.dataset.step);
            const item = allItems.find(i => i.id === id);
            if (!item) return;
            const delta = btn.classList.contains('plus') ? step : -step;
            const newQty = Math.round(Math.max(0, item.quantity + delta) * 10) / 10;
            updateQuantity(id, newQty);
        });
    });

    // Swipe-to-delete
    initSwipe(container);
}

function formatQuantity(item) {
    const q = item.quantity;
    const u = item.unit || '';
    const qStr = q % 1 === 0 ? q.toString() : q.toFixed(1);
    return u ? `${qStr} ${u}` : qStr;
}

function buildMeta(item) {
    const parts = [];
    if (item.note) parts.push(item.note);
    if (item.expiry_date) {
        const exp = new Date(item.expiry_date);
        const now = new Date();
        const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        if (days < 0) {
            parts.push(`<span class="item-expiry-warning">Utgått ${Math.abs(days)}d sedan</span>`);
        } else if (days <= 30) {
            parts.push(`<span class="item-expiry-soon">Bäst före om ${days}d</span>`);
        } else {
            parts.push(`Bäst före ${exp.toLocaleDateString('sv-SE')}`);
        }
    }
    return parts.join(' · ');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Swipe-to-delete ---

let openSwipeContainer = null;

function closeOpenSwipe() {
    if (openSwipeContainer) {
        const card = openSwipeContainer.querySelector('.item-card');
        if (card) {
            card.style.transform = '';
            card.classList.remove('swiping');
        }
        openSwipeContainer.classList.remove('swiping');
        openSwipeContainer = null;
    }
}

function swipeDelete(sc) {
    const card = sc.querySelector('.item-card');
    const id = parseInt(sc.dataset.id);
    if (openSwipeContainer === sc) openSwipeContainer = null;

    // Slide card fully off-screen, then collapse
    card.classList.remove('swiping');
    card.style.transition = 'transform 0.2s ease';
    card.style.transform = `translateX(-${sc.offsetWidth}px)`;

    setTimeout(() => {
        sc.style.transition = 'max-height 0.2s ease, opacity 0.2s ease';
        sc.style.maxHeight = sc.offsetHeight + 'px';
        sc.style.overflow = 'hidden';
        requestAnimationFrame(() => {
            sc.style.maxHeight = '0';
            sc.style.opacity = '0';
        });
    }, 180);

    deleteItem(id);
    setTimeout(() => fetchItems(), 400);
}

function triggerHaptic() {
    // Best-effort haptic: works on Android, no-op on iOS
    if (navigator.vibrate) navigator.vibrate(1);
}

function initSwipe(container) {
    const THRESHOLD = 80;          // px to snap open (slow swipe)
    const REVEAL_WIDTH = 100;      // matches CSS .swipe-action-bg width
    const FULL_SWIPE_RATIO = 0.7;  // swipe past 70% of card width = instant delete

    container.querySelectorAll('.swipe-container').forEach(sc => {
        const card = sc.querySelector('.item-card');
        const actionBg = sc.querySelector('.swipe-action-bg');
        let startX, startY, currentX, isSwiping, directionLocked;
        let pastDeleteThreshold;

        card.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            currentX = 0;
            isSwiping = false;
            directionLocked = false;
            pastDeleteThreshold = false;
            card.classList.add('swiping');
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (directionLocked && !isSwiping) return;

            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            // Lock direction after 10px of movement
            if (!directionLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                directionLocked = true;
                if (Math.abs(dy) > Math.abs(dx)) {
                    card.classList.remove('swiping');
                    return;
                }
                isSwiping = true;
                sc.classList.add('swiping');
                if (openSwipeContainer && openSwipeContainer !== sc) {
                    closeOpenSwipe();
                }
            }

            if (!isSwiping) return;

            e.preventDefault();

            // Allow swiping full card width
            const isOpen = openSwipeContainer === sc;
            const base = isOpen ? -REVEAL_WIDTH : 0;
            const cardWidth = sc.offsetWidth;
            currentX = Math.min(0, Math.max(-cardWidth, base + dx));
            card.style.transform = `translateX(${currentX}px)`;

            // Check if past delete threshold
            const isPast = Math.abs(currentX) > cardWidth * FULL_SWIPE_RATIO;
            if (isPast && !pastDeleteThreshold) {
                // Just crossed the threshold — expand bg and haptic
                pastDeleteThreshold = true;
                actionBg.classList.add('full-swipe');
                triggerHaptic();
            } else if (!isPast && pastDeleteThreshold) {
                // Dragged back below threshold
                pastDeleteThreshold = false;
                actionBg.classList.remove('full-swipe');
            }
        }, { passive: false });

        card.addEventListener('touchend', () => {
            card.classList.remove('swiping');
            if (!isSwiping) return;

            // Past 70% of card width → instant delete
            if (pastDeleteThreshold) {
                swipeDelete(sc);
                return;
            }

            // Slow swipe — snap open or closed
            actionBg.classList.remove('full-swipe');
            if (currentX < -THRESHOLD) {
                card.style.transform = `translateX(-${REVEAL_WIDTH}px)`;
                openSwipeContainer = sc;
            } else {
                card.style.transform = '';
                sc.classList.remove('swiping');
                if (openSwipeContainer === sc) openSwipeContainer = null;
            }
        }, { passive: true });
    });

    // Delete action buttons (tap after slow reveal)
    container.querySelectorAll('.swipe-action-bg').forEach(btn => {
        btn.addEventListener('click', () => {
            const sc = btn.closest('.swipe-container');
            swipeDelete(sc);
        });
    });

    // Close open swipe on tap elsewhere
    document.addEventListener('touchstart', (e) => {
        if (openSwipeContainer && !openSwipeContainer.contains(e.target)) {
            closeOpenSwipe();
        }
    }, { passive: true });
}

// --- Modal ---

let scrollPosition = 0;

function openModal(item = null) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('form-delete');

    if (item) {
        title.textContent = 'Redigera';
        document.getElementById('form-id').value = item.id;
        document.getElementById('form-name').value = item.name;
        document.getElementById('form-quantity').value = item.quantity;
        document.getElementById('form-unit').value = item.unit || '';
        document.getElementById('form-category').value = item.category || '';
        document.getElementById('form-note').value = item.note || '';
        document.getElementById('form-expiry').value = item.expiry_date ? item.expiry_date.split('T')[0] : '';
        deleteBtn.classList.remove('hidden');
    } else {
        title.textContent = 'Lägg till';
        document.getElementById('item-form').reset();
        document.getElementById('form-id').value = '';
        document.getElementById('form-quantity').value = '1';
        deleteBtn.classList.add('hidden');
    }

    // Lock body scroll, preserve position
    scrollPosition = window.scrollY;
    document.body.classList.add('modal-open');
    document.body.style.top = `-${scrollPosition}px`;

    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('form-name').focus(), 100);
    fetchFormCategories();
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');

    // Restore body scroll
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, scrollPosition);
}

// --- Event listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    // Check if ICA integration is enabled
    try {
        const res = await fetch(`${API}/ica-config`);
        const data = await res.json();
        icaEnabled = data.enabled;
    } catch { /* ICA disabled if endpoint unreachable */ }

    fetchItems();

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.tab.active').classList.remove('active');
            tab.classList.add('active');
            currentStorage = tab.dataset.storage;
            activeCategories.clear();
            fetchItems();
        });
    });

    // Filter panel toggle
    document.getElementById('filter-toggle').addEventListener('click', () => {
        const panel = document.getElementById('filter-panel');
        const btn = document.getElementById('filter-toggle');
        panel.classList.toggle('hidden');
        const arrow = panel.classList.contains('hidden') ? '🔽' : '🔼';
        const match = btn.textContent.match(/Filter(.*)/);
        btn.textContent = `${arrow} Filter${match ? match[1] : ''}`;
    });

    // Status filters (multi-select toggle)
    document.querySelectorAll('#filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const filter = chip.dataset.filter;
            if (activeFilters.has(filter)) {
                activeFilters.delete(filter);
                chip.classList.remove('active');
            } else {
                activeFilters.add(filter);
                chip.classList.add('active');
            }
            fetchItems();
        });
    });

    // Search (debounced)
    let searchTimeout;
    document.getElementById('search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(fetchItems, 250);
    });

    // Add button
    document.getElementById('add-btn').addEventListener('click', () => openModal());

    // Modal close
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('form-cancel').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Form submit
    document.getElementById('item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('form-name').value.trim(),
            storage_type: currentStorage,
            quantity: parseFloat(document.getElementById('form-quantity').value) || 0,
            unit: document.getElementById('form-unit').value || null,
            category: document.getElementById('form-category').value.trim() || null,
            note: document.getElementById('form-note').value.trim() || null,
            expiry_date: document.getElementById('form-expiry').value || null,
        };

        const id = document.getElementById('form-id').value;
        if (id) data.id = parseInt(id);

        try {
            await saveItem(data);
            closeModal();
            fetchItems();
        } catch (err) {
            alert('Fel: ' + err.message);
        }
    });

    // Delete button
    document.getElementById('form-delete').addEventListener('click', async () => {
        const id = document.getElementById('form-id').value;
        if (!id) return;
        if (!confirm('Ta bort?')) return;
        try {
            await deleteItem(parseInt(id));
            closeModal();
            fetchItems();
        } catch (err) {
            alert('Fel: ' + err.message);
        }
    });
});
