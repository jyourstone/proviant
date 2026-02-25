/* Proviant — Frontend */

const API = '/api';
let currentStorage = 'freezer';
let allItems = [];

// --- Category icons ---
const categoryIcons = {
    'kött': '🥩',
    'fågel': '🍗',
    'fisk': '🐟',
    'skaldjur': '🦐',
    'grönsaker': '🥦',
    'frukt': '🍎',
    'bröd': '🍞',
    'mejeri': '🧈',
    'glass': '🍦',
    'färdigmat': '🍱',
    'dryck': '🥤',
    'kryddor': '🧂',
    'pasta': '🍝',
    'ris': '🍚',
    'konserv': '🥫',
    'snacks': '🍿',
    'bakning': '🧁',
    'övrigt': '📦',
};

function getCategoryIcon(category) {
    if (!category) return '📦';
    const lower = category.toLowerCase();
    for (const [key, icon] of Object.entries(categoryIcons)) {
        if (lower.includes(key)) return icon;
    }
    return '📦';
}

// --- Storage type labels ---
const storageLabels = {
    freezer: 'Frysen',
    fridge: 'Kylen',
    pantry: 'Skafferiet',
};

// --- API calls ---

async function fetchItems() {
    const params = new URLSearchParams({ storage_type: currentStorage });
    const search = document.getElementById('search').value.trim();
    if (search) params.append('search', search);

    const res = await fetch(`${API}/items?${params}`);
    allItems = await res.json();
    renderItems();
}

async function fetchCategories() {
    const res = await fetch(`${API}/categories?storage_type=${currentStorage}`);
    const categories = await res.json();
    const datalist = document.getElementById('categories-list');
    datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');
}

async function saveItem(data) {
    const id = data.id;
    delete data.id;

    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API}/items/${id}` : `${API}/items`;

    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
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
            const qty = formatQuantity(item);
            const meta = buildMeta(item);
            html += `
                <div class="item-card" data-id="${item.id}">
                    <div class="item-icon">${getCategoryIcon(item.category)}</div>
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(item.name)}</div>
                        ${meta ? `<div class="item-meta">${meta}</div>` : ''}
                    </div>
                    <div class="item-quantity">${qty}</div>
                </div>
            `;
        }
    }

    container.innerHTML = html;
    summaryBar.textContent = `${allItems.length} sak${allItems.length !== 1 ? 'er' : ''} i ${storageLabels[currentStorage].toLowerCase()}`;

    // Click to edit
    container.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            const item = allItems.find(i => i.id === id);
            if (item) openModal(item);
        });
    });
}

function formatQuantity(item) {
    const q = item.quantity;
    const u = item.unit || '';
    if (q === 1 && !u) return '1';
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
            parts.push(`<span class="item-expiry-warning">Utgått ${Math.abs(days)} dagar sedan</span>`);
        } else if (days <= 30) {
            parts.push(`<span class="item-expiry-warning">Bäst före om ${days} dagar</span>`);
        } else {
            parts.push(`Bäst före ${exp.toLocaleDateString('sv-SE')}`);
        }
    }
    if (item.added_date) {
        const added = new Date(item.added_date);
        parts.push(`Tillagt ${added.toLocaleDateString('sv-SE')}`);
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
        document.getElementById('form-added').value = item.added_date ? item.added_date.split('T')[0] : '';
        document.getElementById('form-expiry').value = item.expiry_date ? item.expiry_date.split('T')[0] : '';
        deleteBtn.classList.remove('hidden');
    } else {
        title.textContent = 'Lägg till';
        document.getElementById('item-form').reset();
        document.getElementById('form-id').value = '';
        document.getElementById('form-quantity').value = '1';
        document.getElementById('form-added').value = new Date().toISOString().split('T')[0];
        deleteBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    document.getElementById('form-name').focus();
    fetchCategories();
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
            fetchItems();
        });
    });

    // Search
    let searchTimeout;
    document.getElementById('search').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(fetchItems, 300);
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
            quantity: parseFloat(document.getElementById('form-quantity').value) || 1,
            unit: document.getElementById('form-unit').value || null,
            category: document.getElementById('form-category').value.trim() || null,
            note: document.getElementById('form-note').value.trim() || null,
            added_date: document.getElementById('form-added').value || null,
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
