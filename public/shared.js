// ── State ──────────────────────────────────────────────────────────────────
const sortState = {
    public:  { by: 'date', dir: 'desc' },
    private: { by: 'date', dir: 'desc' }
};

let fileCache = { public: [], private: [] };

let renameContext = null;

// Override per page to reload the relevant file list after delete/rename
function reloadFiles(space) {}

// ── Folder helpers ──────────────────────────────────────────────────────────
function collectFolders(files, prefix) {
    prefix = prefix || '';
    const result = [];
    for (const f of files) {
        if (f.type === 'directory') {
            const folderPath = prefix ? prefix + '/' + f.name : f.name;
            result.push(folderPath);
            if (f.children) result.push(...collectFolders(f.children, folderPath));
        }
    }
    return result;
}

// ── Create Folder ───────────────────────────────────────────────────────────
let createFolderContext = null;

function openCreateFolderModal(space) {
    createFolderContext = { space };
    document.getElementById('createFolderInput').value = '';
    document.getElementById('createFolderModal').style.display = 'block';
    setTimeout(() => document.getElementById('createFolderInput').focus(), 50);
}

function closeCreateFolderModal() {
    document.getElementById('createFolderModal').style.display = 'none';
    createFolderContext = null;
}

async function submitCreateFolder() {
    const folderName = document.getElementById('createFolderInput').value.trim();
    if (!folderName || !createFolderContext) { closeCreateFolderModal(); return; }
    const { space } = createFolderContext;
    closeCreateFolderModal();
    try {
        const res = await fetch(`/files/mkdir/${space}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ folderPath: folderName })
        });
        if (res.ok) {
            reloadFiles(space);
            showMessage(`Folder "${folderName}" created`, 'success');
        } else {
            const err = await res.json();
            showMessage('Create folder failed: ' + err.error, 'error');
        }
    } catch (error) {
        showMessage('Error: ' + error.message, 'error');
    }
}

// ── Move ────────────────────────────────────────────────────────────────────
let moveContext = null;

function moveFile(filePath, space) {
    moveContext = { filePath, space };
    document.getElementById('moveItemName').textContent = filePath;
    const select = document.getElementById('moveDestSelect');
    select.innerHTML = '<option value="">(Root / Kein Ordner)</option>';
    const currentParent = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    collectFolders(fileCache[space])
        .filter(f => f !== filePath && !f.startsWith(filePath + '/'))
        .forEach(f => {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = '📁 ' + f;
            if (f === currentParent) opt.selected = true;
            select.appendChild(opt);
        });
    document.getElementById('moveModal').style.display = 'block';
}

function closeMoveModal() {
    document.getElementById('moveModal').style.display = 'none';
    moveContext = null;
}

async function submitMove() {
    if (!moveContext) return;
    const destFolder = document.getElementById('moveDestSelect').value;
    const { filePath, space } = moveContext;
    const currentParent = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
    if (destFolder === currentParent) {
        showMessage('Datei befindet sich bereits in diesem Ordner', 'error');
        closeMoveModal();
        return;
    }
    closeMoveModal();
    try {
        const res = await fetch(`/files/move/${space}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sourcePath: filePath, destFolder })
        });
        if (res.ok) {
            reloadFiles(space);
            showMessage('Erfolgreich verschoben', 'success');
        } else {
            const err = await res.json();
            showMessage('Verschieben fehlgeschlagen: ' + err.error, 'error');
        }
    } catch (error) {
        showMessage('Fehler: ' + error.message, 'error');
    }
}

// ── Sort & Tile ────────────────────────────────────────────────────────────
function sortFiles(files, by, dir) {
    const sorted = [...files].sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (b.type === 'directory' && a.type !== 'directory') return 1;
        let cmp = by === 'name' ? a.name.localeCompare(b.name)
                : by === 'size' ? (a.size || 0) - (b.size || 0)
                : new Date(a.modified) - new Date(b.modified);
        return dir === 'asc' ? cmp : -cmp;
    });
    return sorted.map(f => f.children
        ? { ...f, children: sortFiles(f.children, by, dir) }
        : f
    );
}

function updateTileSize(space, px) {
    const gridId = space === 'public' ? 'publicFileGrid' : 'privateFileGrid';
    document.getElementById(gridId).style.setProperty('--tile-size', px + 'px');
    document.getElementById(space + 'TileSizeLabel').textContent = px + 'px';
}

function applySort(space) {
    const byEl = document.getElementById(space + 'SortBy');
    if (byEl) sortState[space].by = byEl.value;
    const { by, dir } = sortState[space];
    const sorted = sortFiles(fileCache[space], by, dir);
    const gridId = space === 'public' ? 'publicFileGrid' : 'privateFileGrid';
    const fileGrid = document.getElementById(gridId);
    fileGrid.innerHTML = '';
    if (sorted.length === 0) {
        fileGrid.innerHTML = `<p style="text-align:center;color:#666;padding:20px;">No ${space} files uploaded yet</p>`;
        return;
    }
    sorted.forEach(file => renderFileItem(file, fileGrid, space));
}

function toggleSortDir(space) {
    sortState[space].dir = sortState[space].dir === 'asc' ? 'desc' : 'asc';
    const btn = document.getElementById(space + 'SortDir');
    if (btn) btn.textContent = sortState[space].dir === 'asc' ? '↑' : '↓';
    applySort(space);
}

// ── Rename ─────────────────────────────────────────────────────────────────
function renameFile(filePath, space) {
    renameContext = { filePath, space };
    document.getElementById('renameInput').value = filePath.split('/').pop();
    document.getElementById('renameModal').style.display = 'block';
    setTimeout(() => document.getElementById('renameInput').focus(), 50);
}

function closeRenameModal() {
    document.getElementById('renameModal').style.display = 'none';
    renameContext = null;
}

async function submitRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if (!renameContext) return;
    const currentName = renameContext.filePath.split('/').pop();
    if (!newName || newName === currentName) { closeRenameModal(); return; }
    const { filePath, space } = renameContext;
    closeRenameModal();
    try {
        const res = await fetch(`/files/rename/${space}/${encodeURIComponent(filePath)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ newName })
        });
        if (res.ok) {
            reloadFiles(space);
        } else {
            const err = await res.json();
            showMessage('Rename failed: ' + err.error, 'error');
        }
    } catch (error) {
        showMessage('Rename error: ' + error.message, 'error');
    }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function deleteFile(filePath, space = 'public') {
    if (!confirm(`Are you sure you want to delete ${filePath}?`)) return;
    showLoading(`Deleting ${filePath}...`);
    try {
        const response = await fetch(`/files/delete/${space}/${encodeURIComponent(filePath)}`, {
            method: 'DELETE',
            credentials: space === 'private' ? 'include' : 'same-origin'
        });
        hideLoading();
        if (response.ok) {
            showMessage(`${filePath} deleted successfully`, 'success');
            reloadFiles(space);
        } else {
            showMessage(`Failed to delete ${filePath}`, 'error');
        }
    } catch (error) {
        hideLoading();
        showMessage(`Error deleting ${filePath}: ${error.message}`, 'error');
    }
}

// ── Notifications ──────────────────────────────────────────────────────────
function showMessage(text, type) { showNotification(text, type); }

function showNotification(text, type) {
    document.querySelectorAll('.notification').forEach(n => n.remove());
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${type === 'success' ? '✓' : '✗'}</span>
        <span class="notification-text">${text}</span>
        <button class="notification-close" onclick="closeNotification(this)">&times;</button>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => hideNotification(notification), 5000);
}

function closeNotification(button) { hideNotification(button.closest('.notification')); }

function hideNotification(notification) {
    notification.classList.remove('show');
    setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
}

// ── Loading overlay ────────────────────────────────────────────────────────
function showLoading(text = 'Processing...', progress = '', stats = '', percentage = 0) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingProgress').textContent = progress;
    document.getElementById('uploadStats').textContent = stats;
    document.getElementById('progressFill').style.width = percentage + '%';
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function setUploadButtonLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    if (isLoading) {
        button.classList.add('loading');
        button.disabled = true;
        button.setAttribute('data-original-text', button.textContent);
        button.textContent = 'Uploading...';
    } else {
        button.classList.remove('loading');
        button.disabled = false;
        const orig = button.getAttribute('data-original-text');
        if (orig) { button.textContent = orig; button.removeAttribute('data-original-text'); }
    }
}

// ── File utilities ─────────────────────────────────────────────────────────
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(seconds) {
    if (seconds < 60)   return Math.round(seconds) + 's';
    if (seconds < 3600) return Math.round(seconds / 60) + 'm';
    return Math.round(seconds / 3600) + 'h';
}

function isVideoFile(filename) {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.mkv'].includes(ext);
}

function isImageFile(filename) {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.tiff', '.ico'].includes(ext);
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderFileItem(file, container, space = 'public') {
    if (file.type === 'directory') {
        const folderCard = document.createElement('div');
        folderCard.className = 'folder-card';
        folderCard.innerHTML = `
            <div class="folder-header" onclick="toggleFolder(this)">
                <div>
                    <div class="file-name">📁 ${file.name}</div>
                    <div class="file-info">
                        ${file.fileCount} file(s)<br>
                        Modified: ${new Date(file.modified).toLocaleString()}
                    </div>
                </div>
                <div class="folder-toggle">▶</div>
            </div>
            <div class="file-actions">
                <a href="/files/download-folder/${space}/${encodeURIComponent(file.path)}" class="btn btn-download folder-download">📁 Download Folder</a>
                <button class="btn btn-move"   onclick="moveFile('${file.path}', '${space}')">Move</button>
                <button class="btn btn-rename" onclick="renameFile('${file.path}', '${space}')">Rename</button>
                <button class="btn btn-delete" onclick="deleteFile('${file.path}', '${space}')">Delete</button>
            </div>
            <div class="folder-children"></div>
        `;
        const childrenContainer = folderCard.querySelector('.folder-children');
        file.children.forEach(child => renderFileItem(child, childrenContainer, space));
        container.appendChild(folderCard);
    } else {
        const isVideo = isVideoFile(file.name);
        const isImage = isImageFile(file.name);
        const fileCard = document.createElement('div');

        if (isVideo) {
            fileCard.className = 'video-card';
            fileCard.innerHTML = `
                <div class="file-name">🎬 ${file.name}</div>
                <div class="file-info">Size: ${formatFileSize(file.size)}<br>Modified: ${new Date(file.modified).toLocaleString()}</div>
                <video class="video-player" controls preload="metadata">
                    <source src="/stream/${space}/${encodeURIComponent(file.path)}" type="video/mp4">
                </video>
                <div class="file-actions">
                    <a href="/files/download/${space}/${encodeURIComponent(file.path)}" class="btn btn-download">Download</a>
                    <button class="btn btn-move"   onclick="moveFile('${file.path}', '${space}')">Move</button>
                    <button class="btn btn-rename" onclick="renameFile('${file.path}', '${space}')">Rename</button>
                    <button class="btn btn-delete" onclick="deleteFile('${file.path}', '${space}')">Delete</button>
                </div>
            `;
        } else if (isImage) {
            fileCard.className = 'image-card';
            const icon = file.name.toLowerCase().endsWith('.gif') ? '🎞️' : '🖼️';
            fileCard.innerHTML = `
                <div class="file-name">${icon} ${file.name}</div>
                <div class="file-info">Size: ${formatFileSize(file.size)}<br>Modified: ${new Date(file.modified).toLocaleString()}</div>
                <img class="image-player" src="/image/${space}/${encodeURIComponent(file.path)}"
                     alt="${file.name}"
                     onclick="openLightbox('/image/${space}/${encodeURIComponent(file.path)}', '${file.name}')"
                     onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <div style="display:none;text-align:center;padding:20px;background:#f8f9fa;border-radius:4px;margin:10px 0;">
                    <p style="color:#666;margin:0;">🖼️ Image preview not available</p>
                </div>
                <div class="file-actions">
                    <a href="/files/download/${space}/${encodeURIComponent(file.path)}" class="btn btn-download">Download</a>
                    <button class="btn btn-move"   onclick="moveFile('${file.path}', '${space}')">Move</button>
                    <button class="btn btn-rename" onclick="renameFile('${file.path}', '${space}')">Rename</button>
                    <button class="btn btn-delete" onclick="deleteFile('${file.path}', '${space}')">Delete</button>
                </div>
            `;
        } else {
            fileCard.className = 'file-card';
            fileCard.innerHTML = `
                <div class="file-name">📄 ${file.name}</div>
                <div class="file-info">Size: ${formatFileSize(file.size)}<br>Modified: ${new Date(file.modified).toLocaleString()}</div>
                <div class="file-actions">
                    <a href="/files/download/${space}/${encodeURIComponent(file.path)}" class="btn btn-download">Download</a>
                    <button class="btn btn-move"   onclick="moveFile('${file.path}', '${space}')">Move</button>
                    <button class="btn btn-rename" onclick="renameFile('${file.path}', '${space}')">Rename</button>
                    <button class="btn btn-delete" onclick="deleteFile('${file.path}', '${space}')">Delete</button>
                </div>
            `;
        }
        container.appendChild(fileCard);
    }
}

function toggleFolder(headerElement) {
    const folderCard = headerElement.closest('.folder-card');
    const childrenContainer = folderCard.querySelector('.folder-children');
    const toggleIcon = headerElement.querySelector('.folder-toggle');
    if (childrenContainer.classList.contains('expanded')) {
        childrenContainer.classList.remove('expanded');
        toggleIcon.textContent = '▶';
    } else {
        childrenContainer.classList.add('expanded');
        toggleIcon.textContent = '▼';
    }
}

// ── Upload ─────────────────────────────────────────────────────────────────
async function uploadFiles(filesList, type, buttonId, onComplete) {
    if (filesList.length === 0) { showMessage('Please select files first', 'error'); return; }
    showLoading(`Uploading files to ${type} space...`, `0 of ${filesList.length} files uploaded`);
    setUploadButtonLoading(buttonId, true);
    const results = await uploadWithConcurrencyAndRetry(filesList, type);
    hideLoading();
    setUploadButtonLoading(buttonId, false);
    if (results.successful > 0)
        showMessage(`${results.successful} of ${filesList.length} files uploaded successfully to ${type} space`, 'success');
    if (results.failed.length > 0) {
        showMessage(`Failed to upload ${results.failed.length} file(s): ${results.failed.slice(0, 3).join(', ')}${results.failed.length > 3 ? '...' : ''}`, 'error');
        console.error('Upload failures:', results.failureDetails);
    }
    onComplete();
}

async function uploadWithConcurrencyAndRetry(filesList, type, maxConcurrent = 3, maxRetries = 3) {
    let completedCount = 0, successfulUploads = 0, uploadedBytes = 0;
    const failedUploads = [], failureDetails = {};
    const startTime = Date.now();
    const totalBytes = filesList.reduce((sum, f) => sum + f.size, 0);
    const uploadQueue = filesList.map((file, index) => ({
        file, fileName: file.webkitRelativePath || file.name, index, attempts: 0
    }));

    function updateProgress() {
        const percentage = Math.round((completedCount / filesList.length) * 100);
        const elapsed = Date.now() - startTime;
        const rate = uploadedBytes / (elapsed / 1000);
        const remaining = (totalBytes - uploadedBytes) / rate;
        let statsText = `Speed: ${formatFileSize(rate)}/s`;
        if (remaining > 0 && isFinite(remaining)) statsText += ` • ETA: ${formatTime(remaining)}`;
        showLoading(
            completedCount < filesList.length ? `Uploading files to ${type} space...` : 'Finalizing upload...',
            `${completedCount} of ${filesList.length} files completed`, statsText, percentage
        );
    }

    const activeUploads = new Set();

    async function processUploadItem(uploadItem) {
        const { file, fileName } = uploadItem;
        try {
            const success = await uploadSingleFileWithRetry(file, fileName, type, maxRetries);
            if (success) { successfulUploads++; uploadedBytes += file.size; }
            else { failedUploads.push(fileName); failureDetails[fileName] = 'Upload failed after retries'; }
        } catch (error) {
            failedUploads.push(fileName);
            failureDetails[fileName] = error.message;
            console.error(`Upload error for ${fileName}:`, error);
        } finally {
            completedCount++;
            activeUploads.delete(uploadItem);
            updateProgress();
        }
    }

    updateProgress();
    for (const uploadItem of uploadQueue) {
        while (activeUploads.size >= maxConcurrent)
            await new Promise(resolve => setTimeout(resolve, 100));
        activeUploads.add(uploadItem);
        processUploadItem(uploadItem);
    }
    while (activeUploads.size > 0)
        await new Promise(resolve => setTimeout(resolve, 100));

    return { successful: successfulUploads, failed: failedUploads, failureDetails };
}

async function uploadSingleFileWithRetry(file, fileName, type, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (file.webkitRelativePath) formData.append('relativePath', file.webkitRelativePath);
            formData.append('uploadSpace', type);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            const response = await fetch('/files/upload', {
                method: 'POST', credentials: 'include', body: formData, signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) return true;
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error || 'Upload failed'}`);
        } catch (error) {
            console.warn(`Upload attempt ${attempt} failed for ${fileName}:`, error.message);
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 10000)));
        }
    }
    return false;
}

// targetArray is either selectedPublicFiles or selectedPrivateFiles from the page
async function processEntry(entry, path, targetArray) {
    if (entry.isFile) {
        entry.file(file => {
            file.webkitRelativePath = path + file.name;
            targetArray.push(file);
        });
    } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await new Promise(resolve => dirReader.readEntries(resolve));
        for (const childEntry of entries)
            await processEntry(childEntry, path + entry.name + '/', targetArray);
    }
}

// ── Lightbox ───────────────────────────────────────────────────────────────
function openLightbox(imageSrc, imageName) {
    document.getElementById('lightbox-image').src = imageSrc;
    document.getElementById('lightbox-image').alt = imageName;
    document.getElementById('lightbox').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// ── Auth modals (used on private page) ────────────────────────────────────
function openModal(modalId)  { document.getElementById(modalId).style.display = 'block'; }
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; clearForms(); }
function switchModal(a, b)   { closeModal(a); openModal(b); }

function clearForms() {
    ['loginName', 'loginPassword', 'signupName', 'signupPassword'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

// ── Space animations ───────────────────────────────────────────────────────
function createStars() {
    const container = document.getElementById('stars');
    for (let i = 0; i < 200; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const r = Math.random() * 100;
        star.classList.add(r > 95 ? 'large' : r > 70 ? 'medium' : 'small');
        star.style.left = Math.random() * 100 + '%';
        star.style.top  = Math.random() * 100 + '%';
        star.style.animationDelay    = Math.random() * 2 + 's';
        star.style.animationDuration = (1.5 + Math.random()) + 's';
        container.appendChild(star);
    }
}

function createShootingStars() {
    function getStartPosition(angleDeg) {
        const W = window.innerWidth, H = window.innerHeight;
        const a = ((angleDeg % 360) + 360) % 360;
        // Pick start edge opposite to the travel direction
        if (a >= 45 && a < 135) {
            // Travelling mostly down → start from top
            return { x: Math.random() * (W + 200) - 100, y: -60 };
        } else if (a >= 135 && a < 225) {
            // Travelling mostly left → start from right
            return { x: W + 60, y: Math.random() * (H + 200) - 100 };
        } else if (a >= 225 && a < 315) {
            // Travelling mostly up → start from bottom
            return { x: Math.random() * (W + 200) - 100, y: H + 60 };
        } else {
            // Travelling mostly right → start from left
            return { x: -60, y: Math.random() * (H + 200) - 100 };
        }
    }

    function spawn() {
        const container = document.getElementById('shootingStars');
        if (!container) return;

        const wrap = document.createElement('div');
        wrap.className = 'shooting-star-wrap';
        const star = document.createElement('div');
        star.className = 'shooting-star';

        const length   = 100 + Math.random() * 160;
        const dist     = 600 + Math.random() * 600;
        const dur      = 1.5 + Math.random() * 2.0;  // slower: 1.5–3.5s
        const angleDeg = Math.random() * 360;         // fully random direction

        const { x, y } = getStartPosition(angleDeg);

        star.style.width = length + 'px';
        star.style.setProperty('--dist', dist + 'px');
        star.style.setProperty('--dur',  dur  + 's');

        wrap.style.left      = x + 'px';
        wrap.style.top       = y + 'px';
        wrap.style.transform = `rotate(${angleDeg}deg)`;

        wrap.appendChild(star);
        container.appendChild(wrap);
        setTimeout(() => wrap.remove(), (dur + 0.3) * 1000);
    }

    function scheduleNext() {
        setTimeout(() => { spawn(); scheduleNext(); }, 4000 + Math.random() * 8000);  // 4–12s between stars
    }

    // Two independent streams with staggered starts
    for (let i = 0; i < 2; i++) {
        setTimeout(scheduleNext, Math.random() * 4000);
    }
}

function createParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 4 + 1;
        p.style.width  = size + 'px';
        p.style.height = size + 'px';
        p.style.left   = Math.random() * 100 + '%';
        p.style.bottom = '-10px';
        p.style.animationDelay    = Math.random() * 20 + 's';
        p.style.animationDuration = (15 + Math.random() * 10) + 's';
        container.appendChild(p);
    }
    setInterval(() => {
        if (container.children.length < 50) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 4 + 1;
            p.style.width    = size + 'px';
            p.style.height   = size + 'px';
            p.style.left     = Math.random() * 100 + '%';
            p.style.bottom   = '-10px';
            p.style.animationDuration = (15 + Math.random() * 10) + 's';
            container.appendChild(p);
            setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 25000);
        }
    }, 1000);
}

// ── Global keyboard & modal-backdrop handlers ──────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeLightbox();
            closeRenameModal();
            closeCreateFolderModal();
            closeMoveModal();
        }
    });

    const renameInput = document.getElementById('renameInput');
    if (renameInput) renameInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitRename(); });

    const createFolderInput = document.getElementById('createFolderInput');
    if (createFolderInput) createFolderInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitCreateFolder(); });

    window.addEventListener('click', function (e) {
        document.querySelectorAll('.modal').forEach(modal => {
            if (e.target === modal) modal.style.display = 'none';
        });
    });
});
