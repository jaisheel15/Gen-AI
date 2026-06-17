// ==========================================================================
   State Management & Initialization
   ========================================================================== */
const state = {
    activeTab: 'single-review',
    contracts: [], // List of contract metadata from server
    currentContract: null, // Full detail of the selected contract
    baseline: {}, // Market standard clauses baseline
    apiKeyConfigured: false,
    selectedCompareContracts: [],
    baselineClauseSelected: 'indemnity'
};

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Load config settings
    fetchSettings();
    
    // Register Tab Navigation Click events
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const tabId = item.getAttribute('data-tab');
            if (tabId) {
                switchTab(tabId);
            }
        });
    });

    // Settings Drawer handlers
    document.getElementById('open-settings').addEventListener('click', openSettingsDrawer);
    document.querySelectorAll('.btn-close, .btn-close-drawer, #settings-overlay').forEach(el => {
        el.addEventListener('click', closeSettingsDrawer);
    });
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    
    // Settings API Key visibility toggle
    document.getElementById('btn-toggle-key-visibility').addEventListener('click', toggleApiKeyVisibility);
    
    // Settings baseline clause change dropdown
    document.getElementById('settings-clause-select').addEventListener('click', (e) => {
        const clauseKey = e.target.value;
        if (clauseKey !== state.baselineClauseSelected) {
            state.baselineClauseSelected = clauseKey;
            populateBaselineEditorFields();
        }
    });

    // Ingestion Handlers
    initDropzone();
    
    // Dynamic Registry list click
    document.getElementById('registry-list').addEventListener('click', handleRegistryClick);
    document.getElementById('clear-registry').addEventListener('click', clearAllContracts);

    // Batch workspace handlers
    document.getElementById('btn-run-comparison').addEventListener('click', runBatchComparison);
    
    // Export handler
    document.getElementById('btn-export-summary').addEventListener('click', copyExecSummaryToClipboard);
    
    // Fetch initial list of contracts
    refreshRegistryList();
}

// ==========================================================================
// Routing & Tab Transitions
// ==========================================================================
function switchTab(tabId) {
    state.activeTab = tabId;
    
    // Update menu UI
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update Tab body visibility
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id === `tab-${tabId}`) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });

    // Update Header labels
    const titleEl = document.getElementById('current-tab-title');
    const subtitleEl = document.getElementById('current-tab-subtitle');
    
    if (tabId === 'single-review') {
        titleEl.textContent = 'Single Contract Review';
        subtitleEl.textContent = 'Ingest contracts, extract key clauses, run baseline RAG alignment, and flag risks.';
    } else if (tabId === 'batch-compare') {
        titleEl.textContent = 'Due Diligence Workspace';
        subtitleEl.textContent = 'Select multiple contracts and compare the same clauses side-by-side to detect transactional deviations.';
        populateBatchContractsSelection();
    }
}

// ==========================================================================
// Settings & Drawer Configuration
// ==========================================================================
function fetchSettings() {
    fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
            state.baseline = data.baseline;
            state.apiKeyConfigured = data.api_key_configured;
            
            // Update UI status bar
            const dot = document.getElementById('key-status-dot');
            const text = document.getElementById('key-status-text');
            const previewInput = document.getElementById('settings-api-key');
            
            if (data.api_key_configured) {
                dot.className = 'status-dot green';
                text.textContent = 'API Active';
                previewInput.value = data.api_key_preview || '••••••••••••';
            } else {
                dot.className = 'status-dot red';
                text.textContent = 'API Inactive';
                previewInput.value = '';
            }
            
            populateBaselineEditorFields();
        })
        .catch(err => {
            showToast('Failed to fetch settings from server.', 'error');
        });
}

function populateBaselineEditorFields() {
    const clauseKey = state.baselineClauseSelected;
    const clauseData = state.baseline[clauseKey] || { title: clauseKey, standardText: '', idealRisk: '' };
    
    document.getElementById('settings-clause-ideal').value = clauseData.idealRisk || '';
    document.getElementById('settings-clause-text').value = clauseData.standardText || '';
}

function openSettingsDrawer() {
    document.getElementById('settings-overlay').classList.add('open');
    document.getElementById('settings-drawer').classList.add('open');
}

function closeSettingsDrawer() {
    document.getElementById('settings-overlay').classList.remove('open');
    document.getElementById('settings-drawer').classList.remove('open');
}

function toggleApiKeyVisibility() {
    const keyInput = document.getElementById('settings-api-key');
    const eyeIcon = document.getElementById('btn-toggle-key-visibility').querySelector('i');
    
    if (keyInput.type === 'password') {
        keyInput.type = 'text';
        eyeIcon.className = 'fa-regular fa-eye-slash';
    } else {
        keyInput.type = 'password';
        eyeIcon.className = 'fa-regular fa-eye';
    }
}

function saveSettings() {
    const apiKey = document.getElementById('settings-api-key').value.trim();
    const currentClauseKey = state.baselineClauseSelected;
    const idealRisk = document.getElementById('settings-clause-ideal').value.trim();
    const standardText = document.getElementById('settings-clause-text').value.trim();
    
    // Update local state baseline for current selection
    if (!state.baseline[currentClauseKey]) {
        state.baseline[currentClauseKey] = { title: currentClauseKey };
    }
    state.baseline[currentClauseKey].idealRisk = idealRisk;
    state.baseline[currentClauseKey].standardText = standardText;
    
    const payload = {
        api_key: apiKey,
        baseline: state.baseline
    };
    
    fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => {
        if (!res.ok) throw new Error('Failed to save settings.');
        return res.json();
    })
    .then(data => {
        showToast('Settings saved successfully.', 'success');
        closeSettingsDrawer();
        fetchSettings(); // Refresh UI preview
    })
    .catch(err => {
        showToast(err.message, 'error');
    });
}

// ==========================================================================
// Ingestion & File Drag-and-Drop
// ==========================================================================
function initDropzone() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    
    dropzone.addEventListener('click', () => fileInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

function handleFileUpload(file) {
    // Validate file type
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx') {
        showToast('Unsupported file type. Please upload a PDF or DOCX file.', 'error');
        return;
    }
    
    // Check API key first
    if (!state.apiKeyConfigured) {
        showToast('API Key is not configured. Please open Baseline Settings.', 'error');
        openSettingsDrawer();
        return;
    }
    
    // Prepare progress animation
    const progressContainer = document.getElementById('upload-progress-container');
    const progressFill = document.getElementById('upload-progress-fill');
    const percentageText = document.getElementById('upload-percentage');
    const filenameText = document.getElementById('uploading-filename');
    const dropzone = document.getElementById('dropzone');
    
    filenameText.textContent = file.name;
    dropzone.style.display = 'none';
    progressContainer.style.display = 'block';
    
    // Simulate initial uploading steps, then wait on LLM API
    let progress = 0;
    progressFill.style.width = '0%';
    percentageText.textContent = '0%';
    
    const interval = setInterval(() => {
        if (progress < 90) {
            progress += Math.floor(Math.random() * 10) + 2;
            if (progress > 90) progress = 90;
            progressFill.style.width = `${progress}%`;
            percentageText.textContent = `${progress}%`;
        }
    }, 400);

    // Call Ingestion and Extraction Endpoint
    const formData = new FormData();
    formData.append('file', file);
    
    fetch('/api/analyze', {
        method: 'POST',
        body: formData
    })
    .then(async res => {
        clearInterval(interval);
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || errData.detail || 'Analysis failed.');
        }
        return res.json();
    })
    .then(data => {
        progressFill.style.width = '100%';
        percentageText.textContent = '100%';
        showToast('Document ingestion and automated risk assessment complete!', 'success');
        
        setTimeout(() => {
            // Reset dropzone visibility
            progressContainer.style.display = 'none';
            dropzone.style.display = 'block';
            
            // Add contract to local state registry and load it
            refreshRegistryList().then(() => {
                loadContractDetail(data.filename);
            });
        }, 800);
    })
    .catch(err => {
        clearInterval(interval);
        progressContainer.style.display = 'none';
        dropzone.style.display = 'block';
        showToast(err.message, 'error');
    });
}

// ==========================================================================
// Registry Management
// ==========================================================================
function refreshRegistryList() {
    return fetch('/api/contracts')
        .then(res => res.json())
        .then(data => {
            state.contracts = data;
            
            // Update header stat badge
            document.getElementById('registry-count').textContent = `${data.length} Contract${data.length === 1 ? '' : 's'}`;
            
            // Update list UI
            const listContainer = document.getElementById('registry-list');
            const clearBtn = document.getElementById('clear-registry');
            
            if (data.length === 0) {
                listContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-box-open"></i>
                        <p>No contracts ingested yet</p>
                    </div>
                `;
                clearBtn.style.display = 'none';
                document.getElementById('analysis-view').style.display = 'none';
                state.currentContract = null;
                return;
            }
            
            clearBtn.style.display = 'inline-block';
            listContainer.innerHTML = '';
            
            data.forEach(contract => {
                const isSelected = state.currentContract && state.currentContract.filename === contract.filename;
                const riskClass = contract.overall_risk_score > 70 ? 'high' : contract.overall_risk_score > 35 ? 'medium' : 'low';
                
                const item = document.createElement('div');
                item.className = `registry-item ${isSelected ? 'active' : ''}`;
                item.setAttribute('data-filename', contract.filename);
                item.innerHTML = `
                    <div class="reg-info">
                        <i class="fa-regular ${contract.is_scanned ? 'fa-file-image' : 'fa-file-lines'}"></i>
                        <div class="reg-name" title="${contract.filename}">${contract.filename}</div>
                    </div>
                    <div class="reg-meta">
                        <span class="reg-risk-tag ${riskClass}">Risk: ${contract.overall_risk_score}</span>
                        <button class="btn-delete-contract" data-filename="${contract.filename}">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                `;
                listContainer.appendChild(item);
            });
        })
        .catch(err => {
            showToast('Failed to retrieve contracts registry.', 'error');
        });
}

function handleRegistryClick(e) {
    const item = e.target.closest('.registry-item');
    const deleteBtn = e.target.closest('.btn-delete-contract');
    
    if (deleteBtn) {
        e.stopPropagation();
        const filename = deleteBtn.getAttribute('data-filename');
        deleteContract(filename);
        return;
    }
    
    if (item) {
        const filename = item.getAttribute('data-filename');
        loadContractDetail(filename);
    }
}

function deleteContract(filename) {
    if (confirm(`Are you sure you want to remove '${filename}' from the session registry?`)) {
        fetch(`/api/contracts/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) throw new Error('Deletion failed.');
            return res.json();
        })
        .then(data => {
            showToast(`Removed '${filename}' successfully.`, 'success');
            if (state.currentContract && state.currentContract.filename === filename) {
                state.currentContract = null;
            }
            refreshRegistryList();
        })
        .catch(err => {
            showToast(err.message, 'error');
        });
    }
}

function clearAllContracts() {
    if (confirm("Are you sure you want to clear the entire contract registry?")) {
        const promises = state.contracts.map(c => 
            fetch(`/api/contracts/${encodeURIComponent(c.filename)}`, { method: 'DELETE' })
        );
        
        Promise.all(promises)
            .then(() => {
                showToast("Cleared registry successfully.", "success");
                state.currentContract = null;
                refreshRegistryList();
            })
            .catch(() => {
                showToast("Failed to clear some files.", "error");
                refreshRegistryList();
            });
    }
}

// ==========================================================================
// Document Detailed View & Radial Gauge
// ==========================================================================
function loadContractDetail(filename) {
    fetch(`/api/contracts/${encodeURIComponent(filename)}`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to retrieve analysis.');
            return res.json();
        })
        .then(data => {
            state.currentContract = data;
            
            // Re-render registry list items to set active class
            document.querySelectorAll('.registry-item').forEach(item => {
                if (item.getAttribute('data-filename') === filename) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            
            // Render Document Ingest View
            document.getElementById('analysis-view').style.display = 'block';
            
            // Update Document Viewer Type
            const badge = document.getElementById('doc-type-badge');
            badge.textContent = data.is_scanned ? 'Scanned PDF (OCR Mode)' : 'Digital Document';
            badge.className = `badge ${data.is_scanned ? 'badge-accent' : 'badge-outline'}`;
            
            // 1. Render Radial Risk score Gauge
            animateRadialGauge(data.overall_risk_score);
            
            // 2. Render Executive Summary
            renderExecutiveSummary(data.executive_summary);
            
            // 3. Render Risk Category Progress Bars
            renderCategoryRiskBars(data.category_risks);
            
            // 4. Render Original Text Content
            renderOriginalText(data.full_text);
            
            // 5. Render Extracted Clauses list
            renderExtractedClauses(data.clauses);
            
            // Scroll to the analysis view smoothly
            document.getElementById('analysis-view').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            showToast(err.message, 'error');
        });
}

function animateRadialGauge(score) {
    const gaugeFill = document.getElementById('gauge-fill');
    const gaugeVal = document.getElementById('gauge-val');
    const label = document.getElementById('gauge-risk-label');
    
    // Circumference of a circle with R=40 is 2 * PI * 40 = 251.2
    const circumference = 251.2;
    const offset = circumference - (score / 100) * circumference;
    
    gaugeFill.style.strokeDashoffset = offset;
    gaugeVal.textContent = score;
    
    // Set color based on risk severity
    if (score > 70) {
        gaugeFill.style.stroke = '#ef4444'; // Red
        label.textContent = 'High Risk';
        label.style.color = '#ef4444';
    } else if (score > 35) {
        gaugeFill.style.stroke = '#f59e0b'; // Yellow/Orange
        label.textContent = 'Medium Risk';
        label.style.color = '#f59e0b';
    } else {
        gaugeFill.style.stroke = '#10b981'; // Green
        label.textContent = 'Low Risk';
        label.style.color = '#10b981';
    }
}

function renderExecutiveSummary(summary) {
    const container = document.getElementById('exec-summary-content');
    
    // Build commercial tags
    const commercialTagsHtml = summary.key_commercial_terms.map(term => 
        `<span class="commercial-tag">${escapeHtml(term)}</span>`
    ).join('');
    
    // Build prioritized negotiations list
    const negotiationItemsHtml = summary.top_negotiation_issues.map((issue, idx) => `
        <div class="negotiation-item">
            <span class="negotiation-num">${idx + 1}</span>
            <p>${escapeHtml(issue)}</p>
        </div>
    `).join('');
    
    container.innerHTML = `
        <div class="exec-block">
            <h5>Scope of Agreement</h5>
            <p>${escapeHtml(summary.scope)}</p>
        </div>
        <div class="exec-block">
            <h5>Risk Allocation Profile</h5>
            <p>${escapeHtml(summary.risk_allocation)}</p>
        </div>
        <div class="exec-block">
            <h5>Key Commercial Terms</h5>
            <div class="commercial-tags">${commercialTagsHtml}</div>
        </div>
        <div class="exec-block" style="margin-bottom: 0;">
            <h5>Top 3 Priorities for Negotiation</h5>
            <div class="negotiation-list">${negotiationItemsHtml}</div>
        </div>
    `;
}

function renderCategoryRiskBars(risks) {
    const categories = ['Financial', 'Operational', 'Legal', 'Reputational'];
    
    categories.forEach(cat => {
        const val = risks[cat] || 0;
        const bar = document.getElementById(`risk-${cat.toLowerCase()}-bar`);
        const valEl = document.getElementById(`risk-${cat.toLowerCase()}-val`);
        
        bar.style.width = `${val}%`;
        valEl.textContent = `${val}%`;
    });
}

function renderOriginalText(text) {
    const viewer = document.getElementById('document-text-viewer');
    
    // Split text by newlines and render paragraph nodes
    const paragraphs = text.split('\n');
    viewer.innerHTML = '';
    
    paragraphs.forEach((p, idx) => {
        const pText = p.trim();
        if (!pText) return;
        
        const el = document.createElement('div');
        el.className = 'doc-paragraph';
        el.id = `doc-p-${idx}`;
        
        // Basic check to see if it's a section title/heading
        const isHeader = pText.length < 120 && (
            pText.lower().startsWith('section') ||
            pText.lower().startsWith('article') ||
            pText.lower().startsWith('clause') ||
            pText.toUpperCase() === pText ||
            (pText[0] >= '0' && pText[0] <= '9')
        );
        
        if (isHeader) {
            el.classList.add('heading');
        }
        
        el.textContent = pText;
        viewer.appendChild(el);
    });
}

// Convert string to lower with safe null handler
String.prototype.lower = function() {
    return this.toLowerCase();
};

function renderExtractedClauses(clauses) {
    const list = document.getElementById('extracted-clauses-list');
    list.innerHTML = '';
    
    if (clauses.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-file-excel"></i>
                <p>No key clauses detected in this document.</p>
            </div>
        `;
        return;
    }
    
    clauses.forEach((clause, idx) => {
        const riskClass = clause.risk_level.toLowerCase(); // 'low', 'medium', 'high'
        const devClass = clause.deviation.toLowerCase(); // 'favourable', 'unfavourable', 'unusual'
        
        const card = document.createElement('div');
        card.className = 'clause-card';
        card.setAttribute('data-idx', idx);
        
        card.innerHTML = `
            <div class="clause-card-header">
                <h4>${escapeHtml(clause.clause_type)}</h4>
                <div class="clause-badges">
                    <span class="badge ${devClass}">${escapeHtml(clause.deviation)}</span>
                    <span class="badge risk-${riskClass}">Risk: ${clause.risk_score}</span>
                </div>
            </div>
            
            <div class="clause-preview">${escapeHtml(clause.clause_text)}</div>
            
            <div class="clause-analysis-detail">
                <span class="analysis-label">Baseline Alignment Analysis</span>
                <p>${escapeHtml(clause.comparison_explanation)}</p>
                
                <div class="negotiation-tip-box">
                    <span class="analysis-label"><i class="fa-regular fa-lightbulb"></i> Strategic Advice</span>
                    <p>${escapeHtml(clause.negotiation_tip)}</p>
                </div>
            </div>
        `;
        
        // Add card click selection highlight and scroll into view logic
        card.addEventListener('click', () => {
            // Remove active style from cards
            document.querySelectorAll('.clause-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            
            // Remove highlighting in document text
            document.querySelectorAll('.doc-paragraph').forEach(p => p.classList.remove('highlighted-clause'));
            
            // Highlight the corresponding text in the document viewer
            highlightClauseInDocument(clause.clause_text);
        });
        
        list.appendChild(card);
    });
}

function highlightClauseInDocument(clauseText) {
    const paragraphs = document.querySelectorAll('.doc-paragraph');
    let bestMatchEl = null;
    let maxSimilarity = 0;
    
    // Fuzzy matching to find the paragraph containing most of the clause text
    const cleanClause = clauseText.trim().toLowerCase().replace(/\s+/g, ' ');
    
    paragraphs.forEach(el => {
        const cleanPara = el.textContent.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!cleanPara) return;
        
        // 1. Check direct substring
        if (cleanClause.includes(cleanPara) || cleanPara.includes(cleanClause)) {
            bestMatchEl = el;
            maxSimilarity = 1.0;
            return;
        }
        
        // 2. Otherwise approximate with intersection ratio
        const wordsClause = new Set(cleanClause.split(' '));
        const wordsPara = cleanPara.split(' ');
        let intersectCount = 0;
        
        wordsPara.forEach(w => {
            if (wordsClause.has(w)) intersectCount++;
        });
        
        const similarity = intersectCount / Math.max(wordsClause.size, 1);
        if (similarity > maxSimilarity && similarity > 0.35) {
            maxSimilarity = similarity;
            bestMatchEl = el;
        }
    });
    
    if (bestMatchEl) {
        bestMatchEl.classList.add('highlighted-clause');
        
        // Scroll original text pane smoothly to this element
        bestMatchEl.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    } else {
        showToast("Clause text mapping approximate. Direct highlight position mismatch.", "info");
    }
}

// ==========================================================================
// Batch / Due Diligence Comparison
// ==========================================================================
function populateBatchContractsSelection() {
    const container = document.getElementById('compare-contracts-selection');
    container.innerHTML = '';
    
    if (state.contracts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Please ingest contracts in the Single Review tab first.</p>
            </div>
        `;
        return;
    }
    
    state.contracts.forEach(contract => {
        const item = document.createElement('label');
        item.className = 'contract-check-item';
        
        const checked = state.selectedCompareContracts.includes(contract.filename) ? 'checked' : '';
        
        item.innerHTML = `
            <input type="checkbox" value="${escapeHtml(contract.filename)}" ${checked}>
            <span>${escapeHtml(contract.filename)}</span>
        `;
        
        // Checkbox state sync listener
        item.querySelector('input').addEventListener('change', (e) => {
            const val = e.target.value;
            if (e.target.checked) {
                if (!state.selectedCompareContracts.includes(val)) {
                    state.selectedCompareContracts.push(val);
                }
            } else {
                state.selectedCompareContracts = state.selectedCompareContracts.filter(name => name !== val);
            }
        });
        
        container.appendChild(item);
    });
}

function runBatchComparison() {
    if (state.selectedCompareContracts.length < 2) {
        showToast('Please select at least 2 contracts to compare.', 'error');
        return;
    }
    
    const clauseType = document.getElementById('compare-clause-type').value;
    const resultsContainer = document.getElementById('comparison-results-container');
    const matrixBody = document.getElementById('dd-matrix-body');
    const synthesisText = document.getElementById('dd-synthesis-text');
    const runBtn = document.getElementById('btn-run-comparison');
    
    // Set loading state
    runBtn.disabled = true;
    runBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Aligning baselines & compiling matrices...`;
    resultsContainer.style.display = 'none';
    
    const payload = {
        filenames: state.selectedCompareContracts,
        clause_type: clauseType
    };
    
    fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async res => {
        runBtn.disabled = false;
        runBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass-chart"></i> Compare Clauses`;
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || errData.detail || 'Comparison failed.');
        }
        return res.json();
    })
    .then(data => {
        // Render comparison results
        resultsContainer.style.display = 'block';
        document.getElementById('dd-clause-header').textContent = `Clause: ${clauseType}`;
        
        // 1. Render Synthesized Synthesis Markdown/Text
        synthesisText.innerHTML = renderMarkdown(data.due_diligence_summary);
        
        // 2. Render side-by-side Table Matrix
        matrixBody.innerHTML = '';
        data.comparisons.forEach(row => {
            const riskClass = row.risk_level ? row.risk_level.toLowerCase() : 'low';
            const devClass = row.deviation ? row.deviation.toLowerCase() : 'favourable';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${escapeHtml(row.filename)}</td>
                <td class="clause-text-cell">${escapeHtml(row.clause_text)}</td>
                <td><span class="badge risk-${riskClass}">Risk Score: ${row.risk_score}</span></td>
                <td><span class="badge ${devClass}">${escapeHtml(row.deviation)}</span></td>
                <td>${escapeHtml(row.summary_analysis)}</td>
            `;
            matrixBody.appendChild(tr);
        });
        
        // Scroll into comparison view
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
    })
    .catch(err => {
        runBtn.disabled = false;
        runBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass-chart"></i> Compare Clauses`;
        showToast(err.message, 'error');
    });
}

// ==========================================================================
// Utility functions
// ==========================================================================
function copyExecSummaryToClipboard() {
    if (!state.currentContract) return;
    
    const summary = state.currentContract.executive_summary;
    const clipboardText = `
EXECUTIVE SUMMARY: ${state.currentContract.filename}
==============================================
SCOPE OF AGREEMENT:
${summary.scope}

RISK ALLOCATION:
${summary.risk_allocation}

KEY COMMERCIAL TERMS:
${summary.key_commercial_terms.map(t => `- ${t}`).join('\n')}

NEGOTIATION PRIORITIES:
${summary.top_negotiation_issues.map((issue, idx) => `${idx + 1}. ${issue}`).join('\n')}
    `;
    
    navigator.clipboard.writeText(clipboardText.trim())
        .then(() => {
            showToast('Executive Summary copied to clipboard!', 'success');
        })
        .catch(() => {
            showToast('Failed to copy to clipboard.', 'error');
        });
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderMarkdown(text) {
    if (!text) return '';
    // Very simple markdown to HTML renderer for rendering Gemini's summary
    return text
        .replace(/\n\n/g, '<p></p>')
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/-\s(.*?)(<br>|$)/g, '<li>$1</li>')
        .replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>')
        .replace(/<\/ul><ul>/g, ''); // Join adjacent lists
}
