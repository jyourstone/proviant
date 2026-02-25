/* Proviant — Frontend (mobile-first) */

const API = '/api';
let currentStorage = 'freezer';
let activeFilters = new Set(); // multi-select: 'out_of_stock', 'low_stock', 'expiring'
let activeCategories = new Set(); // multi-select categories
let allItems = [];

// --- Category icons ---
const categoryIcons = {
    'kött': '🥩', 'fågel': '🍗', 'fisk': '🐟', 'skaldjur': '🦐',
    'grönsaker': '🥦', 'frukt': '🍎', 'bröd': '🍞', 'mejeri': '🧈',
    'glass': '🍦', 'färdigmat': '🍱', 'dryck': '🥤', 'kryddor': '🧂',
    'pasta': '🍝', 'ris': '🍚', 'konserv': '🥫', 'snacks': '🍿',
    'bakning': '🧁', 'såser': '🫙', 'övrigt': '📦',
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
    if (activeFilters.has('out_of_stock')) params.append('out_of_stock', 'true');
    if (activeFilters.has('low_stock')) params.append('low_stock', 'true');

    const res = await fetch(`${API}/items?${params}`);
    let items = await res.json();

    // Client-side filtering for expiring (within 30 days)
    if (activeFilters.has('expiring')) {
        const now = new Date();
        items = items.filter(i => {
            if (!i.expiry_date) return false;
            const exp = new Date(i.expiry_date);
            const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
            return days >= 0 && days <= 30;
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

            html += `
                <div class="item-card${oosClass}">
                    <div class="item-info" data-id="${item.id}">
                        <div class="item-name">${escapeHtml(item.name)}</div>
                        ${meta ? `<div class="item-meta">${meta}</div>` : ''}
                    </div>
                    <div class="qty-controls">
                        <button class="qty-btn minus" data-id="${item.id}" data-step="${step}">−</button>
                        <span class="qty-value${zeroClass}">${qtyDisplay}</span>
                        <button class="qty-btn plus" data-id="${item.id}" data-step="${step}">+</button>
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

// --- Modal ---

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

    modal.classList.remove('hidden');
    setTimeout(() => document.getElementById('form-name').focus(), 100);
    fetchFormCategories();
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

// --- Event listeners ---

document.addEventListener('DOMContentLoaded', () => {
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
        btn.textContent = btn.textContent.replace(/^[🔽🔼]/, panel.classList.contains('hidden') ? '🔽' : '🔼');
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
