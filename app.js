// app.js - Main Application Logic
'use strict';

// ===== Configuration =====
const APP_VERSION = '2.0.0';
const STORAGE_KEY = 'taskmaster_tasks';
const THEME_KEY = 'taskmaster_theme';
const USER_KEY = 'taskmaster_user';

// ===== Global State =====
let tasks = [];
let currentFilter = 'all';
let currentCategory = 'all';
let currentView = 'list';
let isAuthenticated = false;
let currentUser = null;
let syncEnabled = false;
let draggedTask = null;

// ===== Firebase Instance =====
let db = null;
let auth = null;

// ===== Initialize App =====
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadTasks();
    updateUI();
    
    // Hide loading screen
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 500);
});

// ===== Core Functions =====
function initializeApp() {
    // Check for saved theme
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        updateThemeIcon(true);
    }
    
    // Initialize Firebase
    if (typeof firebase !== 'undefined' && firebaseConfig) {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
        
        // Setup auth state listener
        auth.onAuthStateChanged(user => {
            if (user) {
                handleAuthSuccess(user);
            } else {
                handleAuthLogout();
            }
        });
    }
    
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('pwa-sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Initialize SortableJS for drag & drop
    const tasksList = document.getElementById('tasksList');
    if (tasksList && typeof Sortable !== 'undefined') {
        new Sortable(tasksList, {
            animation: 150,
            ghostClass: 'dragging',
            onEnd: (evt) => {
                const task = tasks[evt.oldIndex];
                tasks.splice(evt.oldIndex, 1);
                tasks.splice(evt.newIndex, 0, task);
                saveTasks();
                updateProgress();
            }
        });
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    
    // Auth buttons
    document.getElementById('loginBtn')?.addEventListener('click', handleLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    
    // Sync button
    document.getElementById('syncBtn')?.addEventListener('click', handleSync);
    
    // Notification button
    document.getElementById('notificationBtn')?.addEventListener('click', showNotifications);
    
    // Task form
    document.getElementById('taskForm')?.addEventListener('submit', handleAddTask);
    
    // AI Split button
    document.getElementById('aiSplitBtn')?.addEventListener('click', handleAISplit);
    
    // Search
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        handleSearch(e.target.value);
    });
    
    // Filters
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            setFilter(e.target.dataset.filter);
        });
    });
    
    // Category filters
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            setCategory(e.target.dataset.category);
        });
    });
    
    // View options
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setView(e.target.closest('.view-btn').dataset.view);
        });
    });
    
    // Export/Import
    document.getElementById('exportBtn')?.addEventListener('click', exportTasks);
    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile')?.addEventListener('change', handleImport);
    
    // Clear completed
    document.getElementById('clearCompletedBtn')?.addEventListener('click', clearCompleted);
}

// ===== Task Management =====
function handleAddTask(e) {
    e.preventDefault();
    
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const category = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;
    const dueDate = document.getElementById('taskDueDate').value;
    
    if (!title) {
        showToast('الرجاء إدخال عنوان المهمة', 'error');
        return;
    }
    
    const task = {
        id: generateId(),
        title: sanitizeInput(title),
        description: sanitizeInput(description),
        category,
        priority,
        dueDate,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: currentUser?.uid || 'local'
    };
    
    tasks.unshift(task);
    saveTasks();
    
    // Sync to Firebase if authenticated
    if (isAuthenticated && syncEnabled) {
        syncTaskToFirebase(task);
    }
    
    // Reset form
    document.getElementById('taskForm').reset();
    
    // Update UI
    updateUI();
    showToast('تمت إضافة المهمة بنجاح', 'success');
    
    // Check for reminders
    if (dueDate) {
        scheduleReminder(task);
    }
}

function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
        task.completed = !task.completed;
        task.updatedAt = new Date().toISOString();
        saveTasks();
        
        if (isAuthenticated && syncEnabled) {
            syncTaskToFirebase(task);
        }
        
        updateUI();
        
        if (task.completed) {
            showToast('أحسنت! تم إكمال المهمة 🎉', 'success');
        }
    }
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // Populate edit modal
    document.getElementById('editTaskId').value = task.id;
    document.getElementById('editTitle').value = task.title;
    document.getElementById('editDescription').value = task.description;
    document.getElementById('editCategory').value = task.category;
    document.getElementById('editPriority').value = task.priority;
    document.getElementById('editDueDate').value = task.dueDate;
    
    // Show modal
    document.getElementById('editModal').classList.add('active');
}

function saveEditedTask() {
    const taskId = document.getElementById('editTaskId').value;
    const task = tasks.find(t => t.id === taskId);
    
    if (!task) return;
    
    task.title = sanitizeInput(document.getElementById('editTitle').value);
    task.description = sanitizeInput(document.getElementById('editDescription').value);
    task.category = document.getElementById('editCategory').value;
    task.priority = document.getElementById('editPriority').value;
    task.dueDate = document.getElementById('editDueDate').value;
    task.updatedAt = new Date().toISOString();
    
    saveTasks();
    
    if (isAuthenticated && syncEnabled) {
        syncTaskToFirebase(task);
    }
    
    closeEditModal();
    updateUI();
    showToast('تم تحديث المهمة بنجاح', 'success');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

function deleteTask(taskId) {
    if (!confirm('هل أنت متأكد من حذف هذه المهمة؟')) return;
    
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    
    if (isAuthenticated && syncEnabled) {
        deleteTaskFromFirebase(taskId);
    }
    
    updateUI();
    showToast('تم حذف المهمة', 'info');
}

// ===== AI Integration =====
async function handleAISplit() {
    const title = document.getElementById('taskTitle').value.trim();
    
    if (!title) {
        showToast('الرجاء إدخال عنوان المهمة أولاً', 'warning');
        return;
    }
    
    showToast('جاري تحليل المهمة بالذكاء الاصطناعي...', 'info');
    
    try {
        const subtasks = await aiSplitTask(title);
        
        if (subtasks && subtasks.length > 0) {
            // Clear current title
            document.getElementById('taskTitle').value = '';
            
            // Add main task
            const mainTask = {
                id: generateId(),
                title: title + ' (رئيسية)',
                description: 'مهمة رئيسية مقسمة إلى مهام فرعية',
                category: document.getElementById('taskCategory').value,
                priority: document.getElementById('taskPriority').value,
                dueDate: document.getElementById('taskDueDate').value,
                completed: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                userId: currentUser?.uid || 'local'
            };
            
            tasks.unshift(mainTask);
            
            // Add subtasks
            subtasks.forEach(subtask => {
                const task = {
                    id: generateId(),
                    title: '↳ ' + subtask,
                    description: `جزء من: ${title}`,
                    category: document.getElementById('taskCategory').value,
                    priority: 'low',
                    dueDate: document.getElementById('taskDueDate').value,
                    completed: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    userId: currentUser?.uid || 'local'
                };
                tasks.unshift(task);
            });
            
            saveTasks();
            updateUI();
            showToast(`تم تقسيم المهمة إلى ${subtasks.length} مهام فرعية`, 'success');
        }
    } catch (error) {
        console.error('AI Split Error:', error);
        showToast('حدث خطأ في تقسيم المهمة', 'error');
    }
}

// ===== Storage Functions =====
function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadTasks() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            tasks = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading tasks:', e);
            tasks = [];
        }
    }
}

// ===== Firebase Functions =====
async function handleLogin() {
    if (!auth) {
        showToast('Firebase غير متوفر', 'error');
        return;
    }
    
    const provider = new firebase.auth.GoogleAuthProvider();
    
    try {
        const result = await auth.signInWithPopup(provider);
        handleAuthSuccess(result.user);
    } catch (error) {
        console.error('Login error:', error);
        showToast('فشل تسجيل الدخول', 'error');
    }
}

function handleAuthSuccess(user) {
    isAuthenticated = true;
    currentUser = user;
    
    // Update UI
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('userInfo').classList.remove('hidden');
    document.getElementById('userName').textContent = user.displayName;
    document.getElementById('userAvatar').src = user.photoURL;
    
    showToast(`مرحباً ${user.displayName}!`, 'success');
    
    // Enable sync
    syncEnabled = true;
    loadTasksFromFirebase();
}

async function handleLogout() {
    if (!auth) return;
    
    try {
        await auth.signOut();
        handleAuthLogout();
    } catch (error) {
        console.error('Logout error:', error);
        showToast('فشل تسجيل الخروج', 'error');
    }
}

function handleAuthLogout() {
    isAuthenticated = false;
    currentUser = null;
    syncEnabled = false;
    
    // Update UI
    document.getElementById('loginBtn').classList.remove('hidden');
    document.getElementById('userInfo').classList.add('hidden');
    
    showToast('تم تسجيل الخروج', 'info');
}

async function handleSync() {
    if (!isAuthenticated) {
        showToast('الرجاء تسجيل الدخول أولاً', 'warning');
        return;
    }
    
    showToast('جاري المزامنة...', 'info');
    
    try {
        // Sync all local tasks to Firebase
        for (const task of tasks) {
            await syncTaskToFirebase(task);
        }
        
        // Load tasks from Firebase
        await loadTasksFromFirebase();
        
        showToast('تمت المزامنة بنجاح', 'success');
    } catch (error) {
        console.error('Sync error:', error);
        showToast('فشلت المزامنة', 'error');
    }
}

async function syncTaskToFirebase(task) {
    if (!db || !currentUser) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('tasks').doc(task.id)
            .set(task);
    } catch (error) {
        console.error('Sync task error:', error);
    }
}

async function deleteTaskFromFirebase(taskId) {
    if (!db || !currentUser) return;
    
    try {
        await db.collection('users').doc(currentUser.uid)
            .collection('tasks').doc(taskId)
            .delete();
    } catch (error) {
        console.error('Delete task error:', error);
    }
}

async function loadTasksFromFirebase() {
    if (!db || !currentUser) return;
    
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid)
            .collection('tasks')
            .orderBy('createdAt', 'desc')
            .get();
        
        const firebaseTasks = [];
        snapshot.forEach(doc => {
            firebaseTasks.push(doc.data());
        });
        
        // Merge with local tasks
        mergeTasks(firebaseTasks);
        updateUI();
    } catch (error) {
        console.error('Load tasks error:', error);
    }
}

function mergeTasks(firebaseTasks) {
    const taskMap = new Map();
    
    // Add local tasks
    tasks.forEach(task => {
        taskMap.set(task.id, task);
    });
    
    // Merge firebase tasks (newer updatedAt wins)
    firebaseTasks.forEach(fbTask => {
        const localTask = taskMap.get(fbTask.id);
        if (!localTask || new Date(fbTask.updatedAt) > new Date(localTask.updatedAt)) {
            taskMap.set(fbTask.id, fbTask);
        }
    });
    
    tasks = Array.from(taskMap.values());
    saveTasks();
}

// ===== UI Functions =====
function updateUI() {
    renderTasks();
    updateStats();
    updateProgress();
    checkOverdueTasks();
}

function renderTasks() {
    const container = document.getElementById('tasksList');
    const emptyState = document.getElementById('emptyState');
    
    // Filter tasks
    let filteredTasks = filterTasks();
    
    if (filteredTasks.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Apply view mode
    container.className = currentView === 'grid' ? 'tasks-list grid-view' : 'tasks-list';
    
    // Render tasks
    container.innerHTML = filteredTasks.map(task => {
        const categoryInfo = getCategoryInfo(task.category);
        const dueInfo = getDueDateInfo(task.dueDate);
        
        return `
            <div class="task-item priority-${task.priority} ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="task-header">
                    <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                           onchange="toggleTaskComplete('${task.id}')">
                    <div class="task-content">
                        <div class="task-title">${task.title}</div>
                        ${task.description ? `<div class="task-description">${task.description}</div>` : ''}
                        <div class="task-meta">
                            <span class="meta-badge category">
                                ${categoryInfo.icon} ${categoryInfo.name}
                            </span>
                            ${dueInfo ? `<span class="meta-badge ${dueInfo.class}">${dueInfo.text}</span>` : ''}
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="task-btn edit" onclick="editTask('${task.id}')" title="تعديل">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
                            </svg>
                        </button>
                        <button class="task-btn delete" onclick="deleteTask('${task.id}')" title="حذف">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filterTasks() {
    let filtered = [...tasks];
    
    // Apply status filter
    switch (currentFilter) {
        case 'active':
            filtered = filtered.filter(t => !t.completed);
            break;
        case 'completed':
            filtered = filtered.filter(t => t.completed);
            break;
        case 'today':
            filtered = filtered.filter(t => isToday(t.dueDate));
            break;
        case 'week':
            filtered = filtered.filter(t => isThisWeek(t.dueDate));
            break;
        case 'overdue':
            filtered = filtered.filter(t => isOverdue(t.dueDate) && !t.completed);
            break;
    }
    
    // Apply category filter
    if (currentCategory !== 'all') {
        filtered = filtered.filter(t => t.category === currentCategory);
    }
    
    return filtered;
}

function setFilter(filter) {
    currentFilter = filter;
    
    // Update UI
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === filter);
    });
    
    renderTasks();
}

function setCategory(category) {
    currentCategory = category;
    
    // Update UI
    document.querySelectorAll('.category-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.category === category);
    });
    
    renderTasks();
}

function setView(view) {
    currentView = view;
    
    // Update UI
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    renderTasks();
}

function handleSearch(query) {
    if (!query) {
        renderTasks();
        return;
    }
    
    const searchLower = query.toLowerCase();
    const filtered = tasks.filter(task => 
        task.title.toLowerCase().includes(searchLower) ||
        task.description.toLowerCase().includes(searchLower)
    );
    
    const container = document.getElementById('tasksList');
    const emptyState = document.getElementById('emptyState');
    
    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
        emptyState.querySelector('h3').textContent = 'لا توجد نتائج';
        emptyState.querySelector('p').textContent = 'جرب البحث بكلمات أخرى';
    } else {
        emptyState.classList.add('hidden');
        // Re-render with filtered tasks
        const temp = tasks;
        tasks = filtered;
        renderTasks();
        tasks = temp;
    }
}

function updateStats() {
    const total = tasks.length;
    const active = tasks.filter(t => !t.completed).length;
    const completed = tasks.filter(t => t.completed).length;
    const overdue = tasks.filter(t => isOverdue(t.dueDate) && !t.completed).length;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('activeTasks').textContent = active;
    document.getElementById('completedTasks').textContent = completed;
    document.getElementById('overdueTasks').textContent = overdue;
}

function updateProgress() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    
    document.getElementById('progressFill').style.width = `${percentage}%`;
}

// ===== Theme Functions =====
function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
    updateThemeIcon(newTheme === 'dark');
    
    showToast(`تم التبديل إلى الوضع ${newTheme === 'dark' ? 'الليلي' : 'النهاري'}`, 'info');
}

function updateThemeIcon(isDark) {
    const icon = document.getElementById('themeIcon');
    if (isDark) {
        icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" fill="none"/>`;
    } else {
        icon.innerHTML = `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    }
}

// ===== Notification Functions =====
function showNotifications() {
    const overdueTasks = tasks.filter(t => isOverdue(t.dueDate) && !t.completed);
    
    if (overdueTasks.length === 0) {
        showToast('لا توجد مهام متأخرة', 'info');
        return;
    }
    
    // Filter to show overdue tasks
    currentFilter = 'overdue';
    setFilter('overdue');
    
    showToast(`لديك ${overdueTasks.length} مهام متأخرة`, 'warning');
}

function checkOverdueTasks() {
    const overdueTasks = tasks.filter(t => isOverdue(t.dueDate) && !t.completed);
    const badge = document.getElementById('notificationBadge');
    
    if (overdueTasks.length > 0) {
        badge.textContent = overdueTasks.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function scheduleReminder(task) {
    if (!task.dueDate || task.completed) return;
    
    const dueDate = new Date(task.dueDate);
    const now = new Date();
    const timeDiff = dueDate - now;
    
    // Schedule notification 1 hour before
    const reminderTime = timeDiff - (60 * 60 * 1000);
    
    if (reminderTime > 0) {
        setTimeout(() => {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('تذكير بمهمة', {
                    body: `موعد "${task.title}" يقترب!`,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png'
                });
            }
            showToast(`تذكير: موعد "${task.title}" يقترب!`, 'warning');
        }, reminderTime);
    }
}

// ===== Export/Import Functions =====
function exportTasks() {
    if (tasks.length === 0) {
        showToast('لا توجد مهام للتصدير', 'warning');
        return;
    }
    
    const data = JSON.stringify(tasks, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `taskmaster_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showToast('تم تصدير المهام بنجاح', 'success');
}

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            
            if (!Array.isArray(imported)) {
                throw new Error('Invalid format');
            }
            
            // Merge imported tasks
            imported.forEach(task => {
                if (!tasks.find(t => t.id === task.id)) {
                    tasks.push(task);
                }
            });
            
            saveTasks();
            updateUI();
            showToast(`تم استيراد ${imported.length} مهمة بنجاح`, 'success');
        } catch (error) {
            console.error('Import error:', error);
            showToast('فشل استيراد الملف', 'error');
        }
    };
    
    reader.readAsText(file);
    e.target.value = '';
}

function clearCompleted() {
    const completedCount = tasks.filter(t => t.completed).length;
    
    if (completedCount === 0) {
        showToast('لا توجد مهام مكتملة', 'info');
        return;
    }
    
    if (confirm(`هل تريد حذف ${completedCount} مهمة مكتملة؟`)) {
        tasks = tasks.filter(t => !t.completed);
        saveTasks();
        updateUI();
        showToast('تم حذف المهام المكتملة', 'success');
    }
}

// ===== Utility Functions =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function getCategoryInfo(category) {
    const categories = {
        personal: { name: 'شخصي', icon: '👤' },
        work: { name: 'عمل', icon: '💼' },
        shopping: { name: 'تسوق', icon: '🛒' },
        health: { name: 'صحة', icon: '🏥' },
        education: { name: 'تعليم', icon: '📚' },
        other: { name: 'أخرى', icon: '📌' }
    };
    return categories[category] || categories.other;
}

function getDueDateInfo(dueDate) {
    if (!dueDate) return null;
    
    const date = new Date(dueDate);
    const now = new Date();
    const diff = date - now;
    
    if (diff < 0) {
        return {
            text: '⏰ متأخرة',
            class: 'overdue'
        };
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days === 0) {
        return {
            text: `📅 اليوم ${date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`,
            class: 'due-date'
        };
    } else if (days === 1) {
        return {
            text: '📅 غداً',
            class: 'due-date'
        };
    } else if (days <= 7) {
        return {
            text: `📅 ${days} أيام`,
            class: 'due-date'
        };
    }
    
    return {
        text: `📅 ${date.toLocaleDateString('ar-SA')}`,
        class: 'due-date'
    };
}

function isToday(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

function isThisWeek(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return date >= now && date <= weekFromNow;
}

function isOverdue(dateString) {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== Export Functions for Testing =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateId,
        sanitizeInput,
        isToday,
        isThisWeek,
        isOverdue
    };
}
