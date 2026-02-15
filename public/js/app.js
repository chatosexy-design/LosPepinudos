let API_URL = localStorage.getItem('API_URL');
if (!API_URL) {
    if (window.location.hostname === 'localhost') {
        API_URL = 'http://localhost:3000/api';
    } else {
        API_URL = '/api';
    }
}
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user'));

// --- AUTH FUNCTIONS ---
function toggleAuth() {
    document.getElementById('login-form').classList.toggle('hidden');
    document.getElementById('register-form').classList.toggle('hidden');
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        alert('Registro exitoso. ¡Inicia sesión!');
        toggleAuth();
    } catch (err) {
        alert(err.message);
    }
}

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        token = data.token;
        currentUser = data.user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(currentUser));
        
        showDashboard();
    } catch (err) {
        alert(err.message);
    }
}

function logout() {
    localStorage.clear();
    location.reload();
}

function showDashboard() {
    if (!currentUser) {
        currentUser = { username: 'Invitado', streak: 0 };
    }

    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    document.getElementById('streak-count').innerText = currentUser.streak || 0;
    document.getElementById('settings-username').innerText = currentUser.username;
    
    // Load saved theme
    const savedTheme = localStorage.getItem('themeColor') || '#39FF14';
    setTheme(savedTheme);

    loadDailyLogs();
    loadHabits();
    loadStats();
}

function toggleSettings() {
    document.getElementById('settings-modal').classList.toggle('hidden');
}

function setTheme(color) {
    document.documentElement.style.setProperty('--vibrant-green', color);
    // Update Tailwind config dynamically for some elements
    tailwind.config.theme.extend.colors['vibrant-green'] = color;
    localStorage.setItem('themeColor', color);
    
    // Update all elements with dynamic color classes if needed, 
    // but here we'll use a CSS variable for easier management
    const style = document.getElementById('dynamic-theme') || document.createElement('style');
    style.id = 'dynamic-theme';
    style.innerHTML = `
        :root { --vibrant-green: ${color}; }
        .text-vibrant-green { color: ${color} !important; }
        .bg-vibrant-green { background-color: ${color} !important; }
        .border-vibrant-green { border-color: ${color} !important; }
        .bg-gradient-green { background: linear-gradient(135deg, ${color} 0%, #00A86B 100%) !important; }
    `;
    document.head.appendChild(style);
}

// --- APP LOGIC ---

// Meal Builder Logic
let currentMealIngredients = [];

function toggleMealBuilder() {
    const modal = document.getElementById('meal-builder-modal');
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        currentMealIngredients = [];
        updateMealBuilderUI();
        document.getElementById('custom-meal-name').value = '';
        document.getElementById('ing-search').value = '';
        document.getElementById('ing-results').innerHTML = '';
    }
}

async function searchIngredients() {
    const query = document.getElementById('ing-search').value;
    const resultsContainer = document.getElementById('ing-results');
    
    if (query.length < 2) {
        resultsContainer.innerHTML = '';
        return;
    }

    try {
        const res = await fetch(`${API_URL}/search-food?q=${query}`);
        const data = await res.json();
        
        resultsContainer.innerHTML = data.map(item => `
            <button onclick="addIngredient('${item.name}', ${item.calories})" class="w-full text-left p-2 hover:bg-vibrant-green/10 rounded-lg text-sm flex justify-between items-center transition-colors">
                <span class="font-medium">${item.name}</span>
                <span class="text-xs text-gray-500">${item.calories} kcal</span>
            </button>
        `).join('');
    } catch (err) {
        console.error("Error searching ingredients:", err);
    }
}

function addIngredient(name, cals) {
    currentMealIngredients.push({ name, calories: cals, id: Date.now() });
    updateMealBuilderUI();
    document.getElementById('ing-search').value = '';
    document.getElementById('ing-results').innerHTML = '';
}

function removeIngredient(id) {
    currentMealIngredients = currentMealIngredients.filter(i => i.id !== id);
    updateMealBuilderUI();
}

function updateMealBuilderUI() {
    const list = document.getElementById('custom-meal-list');
    const totalDisplay = document.getElementById('custom-meal-total');
    const countDisplay = document.getElementById('ing-count');
    const emptyMsg = document.getElementById('empty-meal-msg');

    if (currentMealIngredients.length === 0) {
        list.innerHTML = `<p id="empty-meal-msg" class="text-sm text-gray-400 text-center py-4 italic">Aún no has añadido nada. ¡Empieza a construir!</p>`;
        totalDisplay.innerHTML = '0 <span class="text-sm font-normal">kcal</span>';
        countDisplay.textContent = '0';
        return;
    }

    const total = currentMealIngredients.reduce((sum, i) => sum + i.calories, 0);
    countDisplay.textContent = currentMealIngredients.length;
    totalDisplay.innerHTML = `${total} <span class="text-sm font-normal">kcal</span>`;

    list.innerHTML = currentMealIngredients.map(i => `
        <div class="flex justify-between items-center bg-white p-2 rounded-xl shadow-sm border border-gray-50">
            <div class="flex items-center">
                <div class="w-2 h-2 rounded-full bg-vibrant-green mr-2"></div>
                <span class="text-sm font-bold text-gray-700">${i.name}</span>
            </div>
            <div class="flex items-center">
                <span class="text-xs text-gray-500 mr-3">${i.calories} kcal</span>
                <button onclick="removeIngredient(${i.id})" class="text-red-400 hover:text-red-600 p-1">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function saveCustomMeal() {
    const name = document.getElementById('custom-meal-name').value || 'Plato Personalizado';
    const totalCals = currentMealIngredients.reduce((sum, i) => sum + i.calories, 0);

    if (currentMealIngredients.length === 0) {
        alert("¡Añade al menos un ingrediente!");
        return;
    }

    await logFood(name, totalCals);
    toggleMealBuilder();
    
    // Show a small success toast/notification logic could go here
}

// Stats & Graphs
async function loadStats() {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(`${API_URL}/stats`, { headers });
    const stats = await res.json();
    
    const container = document.getElementById('stats-container');
    if (stats.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center w-full">Aún no hay datos suficientes.</p>';
        return;
    }

    const maxCals = Math.max(...stats.map(s => s.total), 2000);
    container.innerHTML = stats.reverse().map(s => `
        <div class="flex-1 flex flex-col items-center group">
            <div class="w-full bg-soft-green rounded-t-lg relative" style="height: ${(s.total / maxCals) * 100}%">
                <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-deep-green text-white text-[10px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    ${s.total}
                </div>
                <div class="w-full h-full bg-vibrant-green/50 rounded-t-lg"></div>
            </div>
            <span class="text-[10px] text-gray-400 mt-2">${s.date.split('-').slice(1).join('/')}</span>
        </div>
    `).join('');
}

async function searchFood() {
    const query = document.getElementById('food-search').value;
    const container = document.getElementById('search-results');
    
    if (query.length < 2) {
        container.innerHTML = '';
        return;
    }
    
    // Show loading state
    container.innerHTML = `
        <div class="flex items-center justify-center p-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-vibrant-green"></div>
            <span class="ml-3 text-gray-500">Buscando en la base de datos mundial...</span>
        </div>
    `;
    
    try {
        // Check if it's a "combo" like "Pollo con Arroz"
        let comboHTML = '';
        if (query.toLowerCase().includes(' con ')) {
            const parts = query.toLowerCase().split(' con ');
            const res1 = await fetch(`${API_URL}/search-food?q=${parts[0].trim()}`);
            const res2 = await fetch(`${API_URL}/search-food?q=${parts[1].trim()}`);
            const data1 = await res1.json();
            const data2 = await res2.json();

            if (data1.length > 0 && data2.length > 0) {
                const comboName = `${data1[0].name} con ${data2[0].name}`;
                const comboCals = data1[0].calories + data2[0].calories;
                comboHTML = `
                    <div class="bg-vibrant-green/20 p-4 rounded-xl border-2 border-vibrant-green mb-4">
                        <div class="flex justify-between items-center">
                            <div>
                                <span class="font-bold text-gray-800">✨ Combo: ${comboName}</span>
                                <p class="text-xs text-gray-500">Suma automática de ingredientes</p>
                            </div>
                            <div class="text-right">
                                <span class="block font-bold text-deep-green">${comboCals} kcal</span>
                                <button onclick="logFood('${comboName}', ${comboCals})" class="mt-1 bg-deep-green text-white px-3 py-1 rounded-lg text-sm font-bold">
                                    + Añadir Todo
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        const res = await fetch(`${API_URL}/search-food?q=${query}`);
        const results = await res.json();
        
        if (results.length === 0 && !comboHTML) {
            container.innerHTML = `
                <div class="text-center p-8 text-gray-500">
                    <i class="fas fa-search mb-2 text-2xl"></i>
                    <p>No encontramos resultados exactos.</p>
                    <p class="text-xs">Prueba con términos más simples o agrégalo manualmente abajo.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = comboHTML + results.map(food => `
            <div class="flex justify-between items-center p-4 bg-soft-green rounded-xl hover:bg-vibrant-green/10 transition-all border border-transparent hover:border-vibrant-green mb-2">
                <div>
                    <span class="font-bold text-gray-800">${food.name}</span>
                    <span class="text-xs bg-white/50 px-2 py-0.5 rounded ml-2 text-gray-400">${food.source || 'DB'}</span>
                    <span class="text-sm text-gray-500 ml-2">${food.calories} kcal</span>
                </div>
                <button onclick="logFood('${food.name}', ${food.calories})" class="bg-deep-green text-white px-3 py-1 rounded-lg text-sm font-bold hover:scale-110 transition-transform">
                    + Añadir
                </button>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<p class="text-center text-red-500 p-4">Error de conexión. Intenta de nuevo.</p>`;
    }
}

function toggleManualEntry() {
    const form = document.getElementById('manual-entry-form');
    form.classList.toggle('hidden');
}

async function addManualFood() {
    const name = document.getElementById('manual-name').value;
    const cals = parseInt(document.getElementById('manual-calories').value);
    
    if (!name || !cals) {
        alert('Por favor completa ambos campos.');
        return;
    }
    
    await logFood(name, cals);
    
    // Clear and hide form
    document.getElementById('manual-name').value = '';
    document.getElementById('manual-calories').value = '';
    toggleManualEntry();
}

async function logFood(name, cals) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}/log-food`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ food_name: name, calories: cals })
    });
    const data = await res.json();
    if (data.success) {
        document.getElementById('food-search').value = '';
        document.getElementById('search-results').innerHTML = '';
        currentUser.streak = data.streak;
        document.getElementById('streak-count').innerText = data.streak;
        loadDailyLogs();
    }
}

async function loadDailyLogs() {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(`${API_URL}/daily-logs`, { headers });
    const logs = await res.json();
    
    const container = document.getElementById('daily-log-list');
    let total = 0;
    container.innerHTML = logs.map(log => {
        total += log.calories;
        return `
            <div class="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                <span class="text-gray-700 font-medium">${log.food_name}</span>
                <span class="font-bold text-deep-green">${log.calories} kcal</span>
            </div>
        `;
    }).join('');
    
    document.getElementById('total-calories').innerText = `${total} kcal`;
}

async function loadHabits() {
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(`${API_URL}/habits`, { headers });
    const habits = await res.json();
    
    const container = document.getElementById('habits-list');
    container.innerHTML = habits.map(habit => `
        <div class="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg">
            <input type="checkbox" ${habit.completed ? 'checked' : ''} 
                onchange="toggleHabit(${habit.id}, this.checked)"
                class="w-5 h-5 accent-vibrant-green cursor-pointer">
            <span class="${habit.completed ? 'line-through text-gray-400' : 'text-gray-700'} text-sm font-medium">${habit.habit_name}</span>
        </div>
    `).join('');
}

async function addHabit() {
    const name = document.getElementById('new-habit').value;
    if (!name) return;
    
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_URL}/habits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ habit_name: name })
    });
    document.getElementById('new-habit').value = '';
    loadHabits();
}

async function toggleHabit(id, completed) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_URL}/habits/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ completed })
    });
    loadHabits();
}

async function saveJournal() {
    const entry = document.getElementById('journal-entry').value;
    const mood = document.getElementById('journal-mood').value;
    if (!entry) return;
    
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API_URL}/journal`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ entry, mood })
    });
    alert('Entrada guardada en tu diario.');
    document.getElementById('journal-entry').value = '';
}

const tips = [
    "Camina al menos 30 minutos hoy. ¡Tus piernas te lo agradecerán!",
    "Bebe un vaso de agua antes de cada comida para mejorar tu digestión.",
    "Intenta dormir 8 horas esta noche. El descanso es vital para el metabolismo.",
    "¡Añade más color a tu plato! Las verduras verdes son ricas en magnesio.",
    "Prueba a comer sin distracciones (sin móvil) para ser más consciente.",
    "Un pequeño estiramiento al despertar activa tu circulación."
];

function getAdvice() {
    const msg = tips[Math.floor(Math.random() * tips.length)];
    document.getElementById('assistant-msg').innerText = `"${msg}"`;
}

// Check session on load (guest mode if no stored session)
showDashboard();
