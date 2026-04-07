/**
 * Popup script for managing UI
 */

(function () {
  'use strict';

  const lRateBtn = document.getElementById('lRateBtn');
  const scrapeAllBtn = document.getElementById('scrapeAllBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusMessage = document.getElementById('statusMessage');
  const lRateStatusMessage = document.getElementById('lRateStatusMessage');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const sourcesSection = document.getElementById('sourcesSection');
  const sourcesList = document.getElementById('sourcesList');
  const sourcesToggleAll = document.getElementById('sourcesToggleAll');
  const sourcesToggleExpand = document.getElementById('sourcesToggleExpand');
  const progressDetails = document.getElementById('progressDetails');
  const phaseText = document.getElementById('phaseText');
  const sourceText = document.getElementById('sourceText');
  const sourceProgressText = document.getElementById('sourceProgressText');
  const stagedCount = document.getElementById('stagedCount');
  const errorCount = document.getElementById('errorCount');
  const lastErrorRow = document.getElementById('lastErrorRow');
  const lastErrorText = document.getElementById('lastErrorText');
  const lastDebugRow = document.getElementById('lastDebugRow');
  const lastDebugText = document.getElementById('lastDebugText');
  const lrateDebugEnabled = document.getElementById('lrateDebugEnabled');
  const lrateDebugSettings = document.getElementById('lrateDebugSettings');
  const lrateRowsPerWorker = document.getElementById('lrateRowsPerWorker');
  const lrateDisableRowsLimit = document.getElementById('lrateDisableRowsLimit');
  const lrateRowsPerWorkerError = document.getElementById('lrateRowsPerWorkerError');
  const lrateHandoffEnabled = document.getElementById('lrateHandoffEnabled');
  const lrateHandoffRetries = document.getElementById('lrateHandoffRetries');
  const lrateHandoffRetriesError = document.getElementById('lrateHandoffRetriesError');
  const autofillModeHint = document.getElementById('autofillModeHint');
  const autofillLabelInput = document.getElementById('autofillLabelInput');
  const autofillValueInput = document.getElementById('autofillValueInput');
  const autofillSaveBtn = document.getElementById('autofillSaveBtn');
  const autofillCancelEditBtn = document.getElementById('autofillCancelEditBtn');
  const autofillFormError = document.getElementById('autofillFormError');
  const autofillProfilesList = document.getElementById('autofillProfilesList');
  const autofillEmpty = document.getElementById('autofillEmpty');

  const LRATE_ROWS_MIN = 1;
  const LRATE_ROWS_MAX = 50;
  const LRATE_ROWS_DEFAULT = 2;
  const LRATE_HANDOFF_RETRIES_MIN = 1;
  const LRATE_HANDOFF_RETRIES_MAX = 10;
  const LRATE_HANDOFF_RETRIES_DEFAULT_ON = 1;
  const LRATE_HANDOFF_RETRIES_DEFAULT_OFF = 0;
  const LRATE_WORKER_EMOJI_TRAIL_MAX = 8;
  const LRATE_DEBUG_STORAGE_DEFAULTS = {
    lrate_debug_enabled: false,
    lrate_debug_rows_per_worker: LRATE_ROWS_DEFAULT,
    lrate_debug_disable_rows_limit: false,
    lrate_debug_handoff_enabled: false,
    lrate_debug_handoff_retries: LRATE_HANDOFF_RETRIES_DEFAULT_OFF
  };
  const AUTOFILL_LABEL_MAX_LEN = 120;
  const AUTOFILL_VALUE_MAX_LEN = 50000;

  let scrapeAllInterval = null;
  let sourceSelection = {};
  let sourcesCache = [];
  let scrapeAllEmptyTicks = 0;
  let scrapeAllCompleted = false;
  let storageListenerAttached = false;
  let lrateDebugState = {
    enabled: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_enabled,
    rowsPerWorker: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_rows_per_worker,
    disableRowsLimit: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_disable_rows_limit,
    handoffEnabled: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_handoff_enabled,
    handoffRetries: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_handoff_retries
  };
  let lrateWorkerUiState = {};
  let lrateProgressMarker = {
    total: 0,
    current: 0,
    active: false
  };
  let autofillProfilesState = [];
  let autofillEditId = '';

  loadState();

  if (lRateBtn) lRateBtn.addEventListener('click', handleLRate);
  scrapeAllBtn.addEventListener('click', handleScrapeAll);
  clearBtn.addEventListener('click', handleClear);
  sourcesToggleAll.addEventListener('change', handleToggleAllSources);
  sourcesToggleExpand.addEventListener('change', handleToggleSourcesExpand);
  if (lrateDebugEnabled) lrateDebugEnabled.addEventListener('change', handleLRateDebugEnabledChange);
  if (lrateDisableRowsLimit) lrateDisableRowsLimit.addEventListener('change', handleLRateDisableRowsLimitChange);
  if (lrateHandoffEnabled) lrateHandoffEnabled.addEventListener('change', handleLRateHandoffEnabledChange);
  if (lrateRowsPerWorker) {
    lrateRowsPerWorker.addEventListener('input', handleLRateRowsPerWorkerInput);
    lrateRowsPerWorker.addEventListener('change', handleLRateRowsPerWorkerCommit);
    lrateRowsPerWorker.addEventListener('blur', handleLRateRowsPerWorkerCommit);
  }
  if (lrateHandoffRetries) {
    lrateHandoffRetries.addEventListener('input', handleLRateHandoffRetriesInput);
    lrateHandoffRetries.addEventListener('change', handleLRateHandoffRetriesCommit);
    lrateHandoffRetries.addEventListener('blur', handleLRateHandoffRetriesCommit);
  }
  if (autofillSaveBtn) autofillSaveBtn.addEventListener('click', handleAutofillSave);
  if (autofillCancelEditBtn) autofillCancelEditBtn.addEventListener('click', cancelAutofillEdit);

  async function handleLRate() {
    if (!lRateBtn) return;
    lRateBtn.disabled = true;
    showLRateStatus('LRate: processing rows with Status=2LRate...', 'info');
    try {
      const response = await browser.runtime.sendMessage({ action: 'runLRate' });
      if (response && response.success) {
        const processed = response.processed || 0;
        const applied = response.applied || 0;
        const skipped = response.skipped || 0;
        const failed = response.failed || 0;
        const lastError = response.lastError ? String(response.lastError) : '';
        const suffix = (failed > 0 && lastError) ? `, last error: ${lastError}` : '';
        showLRateStatus(`LRate done. Processed: ${processed}, 2Apply: ${applied}, skipped: ${skipped}, failed: ${failed}${suffix}`, failed > 0 ? 'error' : 'success');
      } else {
        showLRateStatus(`LRate error: ${response?.error || 'Unknown error'}`, 'error');
      }
    } catch (error) {
      showLRateStatus(`LRate error: ${error.message}`, 'error');
    } finally {
      lRateBtn.disabled = false;
    }
  }

  function getWorkerStateEmoji(state) {
    const value = String(state || '').trim().toLowerCase();
    if (value === 'init') return '⚪';
    if (value === 'starting') return '🚀';
    if (value === 'ready') return '🟡';
    if (value === 'processing') return '⚙️';
    if (value === 'waiting_handoff') return '⏳';
    if (value === 'recovering') return '🧯';
    if (value === 'limit_reached') return '🧪';
    if (value === 'queue_empty' || value === 'done') return '✅';
    if (value === 'stopped') return '⏸️';
    if (value === 'dead' || value === 'error') return '⛔';
    return '🔹';
  }

  function resetLRateWorkerUiState() {
    lrateWorkerUiState = {};
  }

  function pushWorkerTrailIcons(trail, icon, count) {
    const amount = Number(count || 0);
    if (!Array.isArray(trail) || !icon || amount <= 0) {
      return;
    }
    for (let i = 0; i < amount; i++) {
      trail.push(icon);
    }
    if (trail.length > LRATE_WORKER_EMOJI_TRAIL_MAX) {
      trail.splice(0, trail.length - LRATE_WORKER_EMOJI_TRAIL_MAX);
    }
  }

  function updateLRateStatusFromProgress(prog) {
    if (!prog) return;
    const current = prog.current || 0;
    const total = prog.total || 0;
    const processed = prog.processed || 0;
    const applied = prog.applied || 0;
    const skipped = prog.skipped || 0;
    const failed = prog.failed || 0;
    const status = prog.status || '';
    if (status) {
      const isActive = prog.active === true;
      const shouldResetUiState = (
        total !== lrateProgressMarker.total ||
        (isActive && current < lrateProgressMarker.current) ||
        (isActive && current === 0 && lrateProgressMarker.current > 0) ||
        (!isActive && lrateProgressMarker.active && current === 0)
      );
      if (shouldResetUiState) {
        resetLRateWorkerUiState();
      }
      lrateProgressMarker = {
        total: total,
        current: current,
        active: isActive
      };

      const workers = Array.isArray(prog.workers) ? prog.workers.slice() : [];
      workers.sort((a, b) => {
        const aId = Number(a.workerId || a.id || 0);
        const bId = Number(b.workerId || b.id || 0);
        return aId - bId;
      });
      const activeWorkerKeys = new Set(workers.map(worker => String(worker.workerId || worker.id || '?')));
      Object.keys(lrateWorkerUiState).forEach(key => {
        if (!activeWorkerKeys.has(key)) {
          delete lrateWorkerUiState[key];
        }
      });

      const workerLines = workers.map(worker => {
        const workerId = worker.workerId || worker.id || '?';
        const workerKey = String(workerId);
        const previous = lrateWorkerUiState[workerKey] || {
          processed: 0,
          skipped: 0,
          failed: 0,
          state: '',
          trail: []
        };
        const state = worker.state || '-';
        const stateEmoji = getWorkerStateEmoji(state);
        const currentRow = worker.currentRow || 0;
        const ok = worker.processed || 0;
        const workerSkipped = worker.skipped || 0;
        const workerFailed = worker.failed || 0;
        const chatSlotId = worker.chatSlotId || 0;
        const chatMsgCount = worker.chatMsgCount || 0;
        const chatRotations = worker.chatRotations || 0;
        const workerLastError = worker.lastError ? String(worker.lastError) : '';
        const trail = Array.isArray(previous.trail) ? previous.trail.slice() : [];

        const deltaOk = Math.max(0, ok - Number(previous.processed || 0));
        const deltaSkip = Math.max(0, workerSkipped - Number(previous.skipped || 0));
        const deltaFail = Math.max(0, workerFailed - Number(previous.failed || 0));
        pushWorkerTrailIcons(trail, '🟢', deltaOk);
        pushWorkerTrailIcons(trail, '⚪', deltaSkip);
        pushWorkerTrailIcons(trail, '🔴', deltaFail);

        lrateWorkerUiState[workerKey] = {
          processed: ok,
          skipped: workerSkipped,
          failed: workerFailed,
          state: state,
          trail: trail
        };

        const emojiParts = trail.slice();
        if (emojiParts.length === 0 || emojiParts[emojiParts.length - 1] !== stateEmoji) {
          emojiParts.push(stateEmoji);
        }
        const emojiSequence = emojiParts.join('');
        let line = `W${workerId} | ${emojiSequence} | ${current}/${total} | ok:${ok} skip:${workerSkipped} fail:${workerFailed} | row:${currentRow} | slot:${chatSlotId} msg:${chatMsgCount} rot:${chatRotations}`;
        if (workerLastError) {
          line += ` | last:${workerLastError}`;
        }
        return line;
      });
      const summary = `${status} | ${current}/${total} | ok:${processed} apply:${applied} skip:${skipped} fail:${failed}`;
      showLRateStatus(
        workerLines.length > 0 ? `${summary}\n${workerLines.join('\n')}` : summary,
        failed > 0 ? 'error' : 'info'
      );
    }
    if (lRateBtn) {
      lRateBtn.disabled = prog.active === true;
    }
  }

  function startScrapeAllPolling() {
    if (scrapeAllInterval) return;
    scrapeAllEmptyTicks = 0;
    scrapeAllInterval = setInterval(async () => {
      const result = await browser.storage.local.get('scrapeAllProgress');
      const prog = result.scrapeAllProgress;
      if (!prog) {
        scrapeAllEmptyTicks += 1;
        try {
          const statusResp = await browser.runtime.sendMessage({ action: 'getScrapeAllStatus' });
          if (statusResp && statusResp.active) {
            if (!scrapeAllCompleted) {
              showStatus('Scraping and enriching jobs...', 'info');
            }
            return;
          }
        } catch (error) {
          console.error('Failed to check scrape all status:', error);
        }

        stopScrapeAllPolling();
        progressContainer.classList.add('hidden');
        progressDetails.classList.add('hidden');
        if (!scrapeAllCompleted) {
          scrapeAllBtn.disabled = false;
          clearBtn.disabled = false;
        }
        return;
      }

      scrapeAllEmptyTicks = 0;
      if (prog.status) {
        showStatus(prog.status, 'info');
      }

      const current = prog.progressCurrent || 0;
      const total = prog.progressTotal || 0;
      updateProgress(current, total);
      updateProgressDetails(prog);
    }, 500);
  }

  function stopScrapeAllPolling() {
    if (scrapeAllInterval) {
      clearInterval(scrapeAllInterval);
      scrapeAllInterval = null;
    }
  }

  async function handleScrapeAll() {
    const selectedCount = getSelectedSourcesCount();
    if (sourcesCache.length > 0 && selectedCount === 0) {
      showStatus('Select at least one source', 'error');
      return;
    }

    scrapeAllCompleted = false;
    scrapeAllBtn.disabled = true;
    clearBtn.disabled = true;
    progressContainer.classList.remove('hidden');
    progressDetails.classList.remove('hidden');
    showStatus('Scraping and enriching jobs...', 'info');
    startScrapeAllPolling();

    try {
      const response = await browser.runtime.sendMessage({ action: 'scrapeAllNewJobs' });
      stopScrapeAllPolling();
      if (response && response.success) {
        const sources = response.sourcesProcessed || response.totalSources || 0;
        const staged = response.stagedJobs || 0;
        const failed = response.failedJobs || 0;
        const skipped = response.skippedDuplicates || 0;
        const droppedShell = response.notificationShellDropped || 0;
        scrapeAllCompleted = true;
        showStatus(
          `Scrape All завершен. Источников: ${sources}, новых: ${staged}, дублей: ${skipped}, ошибки: ${failed}, отброшено(shell): ${droppedShell}`,
          failed > 0 ? 'error' : 'success'
        );
      } else {
        showStatus(`Error: ${response?.error || 'Scrape All failed'}`, 'error');
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      progressContainer.classList.add('hidden');
      progressDetails.classList.add('hidden');
      scrapeAllBtn.disabled = false;
      clearBtn.disabled = false;
      browser.storage.local.remove('scrapeAllProgress');
    }
  }

  async function handleClear() {
    if (confirm('Clear local extension state?')) {
      await browser.runtime.sendMessage({ action: 'clearData' });
      showStatus('Local data cleared', 'info');
    }
  }

  function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
  }

  function showLRateStatus(message, type = 'info') {
    if (!lRateStatusMessage) return;
    lRateStatusMessage.textContent = message;
    lRateStatusMessage.className = `status ${type}`;
  }

  function normalizeAutofillLabel(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, AUTOFILL_LABEL_MAX_LEN);
  }

  function normalizeAutofillValue(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\r\n/g, '\n')
      .slice(0, AUTOFILL_VALUE_MAX_LEN);
  }

  function normalizeAutofillLabelKey(value) {
    return normalizeAutofillLabel(value).toLowerCase();
  }

  function setAutofillFormError(message) {
    if (!autofillFormError) return;
    const text = String(message || '').trim();
    if (!text) {
      autofillFormError.textContent = '';
      autofillFormError.classList.add('hidden');
      return;
    }
    autofillFormError.textContent = text;
    autofillFormError.classList.remove('hidden');
  }

  function setAutofillModeHint(message) {
    if (!autofillModeHint) return;
    autofillModeHint.textContent = String(message || '');
  }

  function setAutofillFormMode(editMode) {
    const isEdit = editMode === true;
    if (autofillSaveBtn) {
      autofillSaveBtn.textContent = isEdit ? 'Save' : 'Add';
    }
    if (autofillCancelEditBtn) {
      if (isEdit) {
        autofillCancelEditBtn.classList.remove('hidden');
      } else {
        autofillCancelEditBtn.classList.add('hidden');
      }
    }
  }

  function resetAutofillForm() {
    autofillEditId = '';
    if (autofillLabelInput) autofillLabelInput.value = '';
    if (autofillValueInput) autofillValueInput.value = '';
    setAutofillFormMode(false);
    setAutofillFormError('');
  }

  function beginAutofillEdit(profile) {
    if (!profile || !profile.id) return;
    autofillEditId = String(profile.id || '');
    if (autofillLabelInput) autofillLabelInput.value = String(profile.label || '');
    if (autofillValueInput) autofillValueInput.value = String(profile.value || '');
    setAutofillFormMode(true);
    setAutofillFormError('');
    if (autofillLabelInput) {
      autofillLabelInput.focus();
      autofillLabelInput.select();
    }
  }

  function cancelAutofillEdit() {
    resetAutofillForm();
  }

  function renderAutofillProfiles() {
    if (!autofillProfilesList || !autofillEmpty) return;
    autofillProfilesList.innerHTML = '';
    if (!Array.isArray(autofillProfilesState) || autofillProfilesState.length === 0) {
      autofillEmpty.classList.remove('hidden');
      return;
    }
    autofillEmpty.classList.add('hidden');

    for (let i = 0; i < autofillProfilesState.length; i++) {
      const profile = autofillProfilesState[i];
      const wrapper = document.createElement('div');
      wrapper.className = 'autofill-item';

      const top = document.createElement('div');
      top.className = 'autofill-item-top';

      const label = document.createElement('div');
      label.className = 'autofill-item-label';
      label.textContent = String(profile.label || '');
      top.appendChild(label);

      const actions = document.createElement('div');
      actions.className = 'debug-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'button secondary inline';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        beginAutofillEdit(profile);
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'button secondary inline';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        handleAutofillDelete(profile.id, profile.label || '');
      });
      actions.appendChild(deleteBtn);

      top.appendChild(actions);
      wrapper.appendChild(top);

      const value = document.createElement('div');
      value.className = 'autofill-item-value';
      value.textContent = String(profile.value || '');
      wrapper.appendChild(value);

      autofillProfilesList.appendChild(wrapper);
    }
  }

  async function loadAutofillProfiles() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getAutofillProfiles' });
      if (!response || response.success !== true) {
        throw new Error(response && response.error ? response.error : 'Failed to load autofill profiles');
      }
      autofillProfilesState = Array.isArray(response.entries) ? response.entries.slice() : [];
      renderAutofillProfiles();
    } catch (error) {
      console.error('Failed to load autofill profiles:', error);
      setAutofillFormError(`Autofill load error: ${error.message}`);
    }
  }

  function validateAutofillInput(label, value) {
    if (!label) {
      return 'Label is required';
    }
    if (!value) {
      return 'Value is required';
    }

    const labelKey = normalizeAutofillLabelKey(label);
    const duplicate = autofillProfilesState.find(item => (
      normalizeAutofillLabelKey(item.label) === labelKey &&
      String(item.id || '') !== String(autofillEditId || '')
    ));
    if (duplicate) {
      return 'Label must be unique';
    }
    return '';
  }

  async function handleAutofillSave() {
    const label = normalizeAutofillLabel(autofillLabelInput ? autofillLabelInput.value : '');
    const value = normalizeAutofillValue(autofillValueInput ? autofillValueInput.value : '');
    const validationError = validateAutofillInput(label, value);
    if (validationError) {
      setAutofillFormError(validationError);
      return;
    }

    try {
      const response = await browser.runtime.sendMessage({
        action: 'upsertAutofillProfile',
        profile: {
          id: autofillEditId || '',
          label: label,
          value: value
        }
      });
      if (!response || response.success !== true) {
        throw new Error(response && response.error ? response.error : 'Failed to save autofill profile');
      }
      autofillProfilesState = Array.isArray(response.entries) ? response.entries.slice() : [];
      renderAutofillProfiles();
      resetAutofillForm();
      setAutofillModeHint('Saved');
    } catch (error) {
      setAutofillFormError(error.message);
    }
  }

  async function handleAutofillDelete(id, label) {
    if (!id) return;
    const confirmed = confirm(`Delete "${label}"?`);
    if (!confirmed) return;

    try {
      const response = await browser.runtime.sendMessage({
        action: 'deleteAutofillProfile',
        id: id
      });
      if (!response || response.success !== true) {
        throw new Error(response && response.error ? response.error : 'Failed to delete profile');
      }
      autofillProfilesState = Array.isArray(response.entries) ? response.entries.slice() : [];
      if (String(autofillEditId || '') === String(id)) {
        resetAutofillForm();
      }
      renderAutofillProfiles();
      setAutofillModeHint('Deleted');
    } catch (error) {
      setAutofillFormError(error.message);
    }
  }

  async function consumeAutofillPopupIntent() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'consumeAutofillPopupIntent' });
      if (!response || response.success !== true || !response.intent) {
        setAutofillModeHint('');
        return false;
      }
      const mode = String(response.intent.mode || '').toLowerCase();
      if (mode === 'add') {
        cancelAutofillEdit();
        setAutofillModeHint('Add mode from context menu');
        if (autofillLabelInput) {
          autofillLabelInput.focus();
        }
        return true;
      } else {
        setAutofillModeHint('Manage mode from context menu');
        return true;
      }
    } catch (error) {
      console.error('Failed to consume autofill popup intent:', error);
      setAutofillModeHint('');
      return false;
    }
  }

  function buildAutofillDiagnosticHint(diagnostic) {
    if (!diagnostic || diagnostic.success === true) {
      return '';
    }
    const createdAtMs = diagnostic.createdAt ? new Date(String(diagnostic.createdAt)).getTime() : NaN;
    const nowMs = Date.now();
    if (isNaN(createdAtMs) || nowMs - createdAtMs > 15 * 60 * 1000) {
      return '';
    }
    const finalError = String(diagnostic.finalError || '').trim();
    if (finalError) {
      return `Last fill failed: ${finalError}`;
    }
    const attempts = Array.isArray(diagnostic.attempts) ? diagnostic.attempts : [];
    if (attempts.length > 0) {
      const lastAttempt = attempts[attempts.length - 1];
      const lastError = String(lastAttempt && lastAttempt.error ? lastAttempt.error : '').trim();
      if (lastError) {
        return `Last fill failed: ${lastError}`;
      }
    }
    return 'Last fill failed. Open Browser Console for details.';
  }

  async function loadAutofillDiagnosticHint() {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getAutofillLastDiagnostic' });
      if (!response || response.success !== true) {
        return;
      }
      const hint = buildAutofillDiagnosticHint(response.diagnostic);
      if (hint) {
        setAutofillModeHint(hint);
      }
    } catch (error) {
      console.error('Failed to load autofill diagnostic hint:', error);
    }
  }

  function updateProgress(current, total) {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = `${percent}%`;
    progressFill.textContent = `${percent}% (${current}/${total})`;
  }

  function updateProgressDetails(prog) {
    const phase = prog.phase === 'enrich' ? 'Enriching' : 'Scraping';
    const sourceName = prog.sourceName || '-';
    const sourceIndex = prog.sourceIndex || 0;
    const totalSources = prog.totalSources || 0;
    const progressCurrent = prog.progressCurrent || 0;
    const progressTotal = prog.progressTotal || 0;
    const staged = prog.stagedJobs || 0;
    const failed = prog.failedJobs || 0;
    const lastError = prog.lastError || '';
    const lastDebug = prog.lastDebug || '';

    phaseText.textContent = phase;
    sourceText.textContent = totalSources > 0 ? `${sourceName} (${sourceIndex}/${totalSources})` : sourceName;
    sourceProgressText.textContent = `${progressCurrent}/${progressTotal}`;
    stagedCount.textContent = staged;
    errorCount.textContent = failed;

    if (lastError) {
      lastErrorText.textContent = lastError;
      lastErrorRow.classList.remove('hidden');
    } else {
      lastErrorText.textContent = '';
      lastErrorRow.classList.add('hidden');
    }

    if (lastDebug) {
      lastDebugText.textContent = lastDebug;
      lastDebugRow.classList.remove('hidden');
    } else {
      lastDebugText.textContent = '';
      lastDebugRow.classList.add('hidden');
    }
  }

  async function loadState() {
    await restoreLRateDebugSettings();
    await loadAutofillProfiles();
    const hasIntent = await consumeAutofillPopupIntent();
    if (!hasIntent) {
      await loadAutofillDiagnosticHint();
    }
    await loadSourcesList();
    await restoreScrapeAllProgress();
    await restoreLRateProgress();
    await loadLastSummary();
    attachStorageListener();
  }

  function parseRowsPerWorkerValue(raw) {
    const text = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!/^\d+$/.test(text)) {
      return null;
    }
    const value = parseInt(text, 10);
    if (isNaN(value) || value < LRATE_ROWS_MIN || value > LRATE_ROWS_MAX) {
      return null;
    }
    return value;
  }

  function normalizeRowsPerWorker(raw) {
    const parsed = parseRowsPerWorkerValue(raw);
    return parsed === null ? LRATE_ROWS_DEFAULT : parsed;
  }

  function parseHandoffRetriesValue(raw) {
    const text = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!/^\d+$/.test(text)) {
      return null;
    }
    const value = parseInt(text, 10);
    if (isNaN(value) || value < LRATE_HANDOFF_RETRIES_MIN || value > LRATE_HANDOFF_RETRIES_MAX) {
      return null;
    }
    return value;
  }

  function normalizeHandoffRetries(raw, handoffEnabled) {
    if (!handoffEnabled) {
      return LRATE_HANDOFF_RETRIES_DEFAULT_OFF;
    }
    const parsed = parseHandoffRetriesValue(raw);
    return parsed === null ? LRATE_HANDOFF_RETRIES_DEFAULT_ON : parsed;
  }

  function setRowsPerWorkerError(visible) {
    if (!lrateRowsPerWorkerError || !lrateRowsPerWorker) return;
    if (visible) {
      lrateRowsPerWorkerError.classList.remove('hidden');
      lrateRowsPerWorker.classList.add('invalid');
    } else {
      lrateRowsPerWorkerError.classList.add('hidden');
      lrateRowsPerWorker.classList.remove('invalid');
    }
  }

  function setHandoffRetriesError(visible) {
    if (!lrateHandoffRetriesError || !lrateHandoffRetries) return;
    if (visible) {
      lrateHandoffRetriesError.classList.remove('hidden');
      lrateHandoffRetries.classList.add('invalid');
    } else {
      lrateHandoffRetriesError.classList.add('hidden');
      lrateHandoffRetries.classList.remove('invalid');
    }
  }

  function renderLRateDebugUi() {
    if (!lrateDebugEnabled ||
        !lrateDebugSettings ||
        !lrateRowsPerWorker ||
        !lrateDisableRowsLimit ||
        !lrateHandoffEnabled ||
        !lrateHandoffRetries) {
      return;
    }
    lrateDebugEnabled.checked = lrateDebugState.enabled === true;
    if (lrateDebugState.enabled) {
      lrateDebugSettings.classList.remove('hidden');
    } else {
      lrateDebugSettings.classList.add('hidden');
    }
    lrateRowsPerWorker.value = String(lrateDebugState.rowsPerWorker);
    lrateDisableRowsLimit.checked = lrateDebugState.disableRowsLimit === true;
    lrateRowsPerWorker.disabled = lrateDebugState.disableRowsLimit === true;
    lrateHandoffEnabled.checked = lrateDebugState.handoffEnabled === true;
    lrateHandoffRetries.value = String(
      lrateDebugState.handoffEnabled ? lrateDebugState.handoffRetries : LRATE_HANDOFF_RETRIES_DEFAULT_OFF
    );
    lrateHandoffRetries.disabled = !(lrateDebugState.enabled && lrateDebugState.handoffEnabled);
    setRowsPerWorkerError(false);
    setHandoffRetriesError(false);
  }

  async function saveLRateDebugSettings() {
    const handoffEnabled = lrateDebugState.handoffEnabled === true;
    const handoffRetries = normalizeHandoffRetries(lrateDebugState.handoffRetries, handoffEnabled);
    await browser.storage.local.set({
      lrate_debug_enabled: lrateDebugState.enabled === true,
      lrate_debug_rows_per_worker: normalizeRowsPerWorker(lrateDebugState.rowsPerWorker),
      lrate_debug_disable_rows_limit: lrateDebugState.disableRowsLimit === true,
      lrate_debug_handoff_enabled: handoffEnabled,
      lrate_debug_handoff_retries: handoffRetries
    });
  }

  async function restoreLRateDebugSettings() {
    if (!lrateDebugEnabled ||
        !lrateDebugSettings ||
        !lrateRowsPerWorker ||
        !lrateDisableRowsLimit ||
        !lrateHandoffEnabled ||
        !lrateHandoffRetries) {
      return;
    }
    try {
      const stored = await browser.storage.local.get([
        'lrate_debug_enabled',
        'lrate_debug_rows_per_worker',
        'lrate_debug_disable_rows_limit',
        'lrate_debug_handoff_enabled',
        'lrate_debug_handoff_retries'
      ]);
      const restoredHandoffEnabled = stored.lrate_debug_handoff_enabled === true;
      lrateDebugState = {
        enabled: stored.lrate_debug_enabled === true,
        rowsPerWorker: normalizeRowsPerWorker(stored.lrate_debug_rows_per_worker),
        disableRowsLimit: stored.lrate_debug_disable_rows_limit === true,
        handoffEnabled: restoredHandoffEnabled,
        handoffRetries: normalizeHandoffRetries(stored.lrate_debug_handoff_retries, restoredHandoffEnabled)
      };
      renderLRateDebugUi();
      await saveLRateDebugSettings();
    } catch (error) {
      console.error('Error restoring LRate debug settings:', error);
      lrateDebugState = {
        enabled: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_enabled,
        rowsPerWorker: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_rows_per_worker,
        disableRowsLimit: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_disable_rows_limit,
        handoffEnabled: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_handoff_enabled,
        handoffRetries: LRATE_DEBUG_STORAGE_DEFAULTS.lrate_debug_handoff_retries
      };
      renderLRateDebugUi();
    }
  }

  async function handleLRateDebugEnabledChange() {
    lrateDebugState.enabled = !!(lrateDebugEnabled && lrateDebugEnabled.checked);
    renderLRateDebugUi();
    await saveLRateDebugSettings();
  }

  async function handleLRateDisableRowsLimitChange() {
    lrateDebugState.disableRowsLimit = !!(lrateDisableRowsLimit && lrateDisableRowsLimit.checked);
    renderLRateDebugUi();
    await saveLRateDebugSettings();
  }

  async function handleLRateHandoffEnabledChange() {
    lrateDebugState.handoffEnabled = !!(lrateHandoffEnabled && lrateHandoffEnabled.checked);
    if (!lrateDebugState.handoffEnabled) {
      lrateDebugState.handoffRetries = LRATE_HANDOFF_RETRIES_DEFAULT_OFF;
    } else if (parseHandoffRetriesValue(lrateDebugState.handoffRetries) === null) {
      lrateDebugState.handoffRetries = LRATE_HANDOFF_RETRIES_DEFAULT_ON;
    }
    renderLRateDebugUi();
    await saveLRateDebugSettings();
  }

  function handleLRateRowsPerWorkerInput() {
    if (!lrateRowsPerWorker || lrateRowsPerWorker.disabled) {
      setRowsPerWorkerError(false);
      return;
    }
    setRowsPerWorkerError(parseRowsPerWorkerValue(lrateRowsPerWorker.value) === null);
  }

  async function handleLRateRowsPerWorkerCommit() {
    if (!lrateRowsPerWorker || lrateRowsPerWorker.disabled) {
      setRowsPerWorkerError(false);
      return;
    }
    const parsed = parseRowsPerWorkerValue(lrateRowsPerWorker.value);
    if (parsed === null) {
      setRowsPerWorkerError(true);
      return;
    }
    lrateDebugState.rowsPerWorker = parsed;
    setRowsPerWorkerError(false);
    await saveLRateDebugSettings();
  }

  function handleLRateHandoffRetriesInput() {
    if (!lrateHandoffRetries || lrateHandoffRetries.disabled) {
      setHandoffRetriesError(false);
      return;
    }
    setHandoffRetriesError(parseHandoffRetriesValue(lrateHandoffRetries.value) === null);
  }

  async function handleLRateHandoffRetriesCommit() {
    if (!lrateHandoffRetries || lrateHandoffRetries.disabled) {
      setHandoffRetriesError(false);
      return;
    }
    const parsed = parseHandoffRetriesValue(lrateHandoffRetries.value);
    if (parsed === null) {
      setHandoffRetriesError(true);
      return;
    }
    lrateDebugState.handoffRetries = parsed;
    setHandoffRetriesError(false);
    await saveLRateDebugSettings();
  }

  async function restoreLRateProgress() {
    try {
      const [stored, statusResp] = await Promise.all([
        browser.storage.local.get('lRateProgress'),
        browser.runtime.sendMessage({ action: 'getLRateStatus' })
      ]);
      if (statusResp && statusResp.active && statusResp.progress) {
        updateLRateStatusFromProgress(statusResp.progress);
        return;
      }
      if (stored && stored.lRateProgress) {
        updateLRateStatusFromProgress(stored.lRateProgress);
      }
    } catch (error) {
      console.error('Error restoring LRate progress:', error);
    }
  }

  async function restoreScrapeAllProgress() {
    try {
      const [stored, statusResp] = await Promise.all([
        browser.storage.local.get('scrapeAllProgress'),
        browser.runtime.sendMessage({ action: 'getScrapeAllStatus' })
      ]);
      if (statusResp && statusResp.active) {
        progressContainer.classList.remove('hidden');
        progressDetails.classList.remove('hidden');
        scrapeAllBtn.disabled = true;
        clearBtn.disabled = true;
        startScrapeAllPolling();
      } else if (stored.scrapeAllProgress) {
        await browser.storage.local.remove('scrapeAllProgress');
        scrapeAllBtn.disabled = false;
        clearBtn.disabled = false;
        progressContainer.classList.add('hidden');
        progressDetails.classList.add('hidden');
      }
    } catch (error) {
      console.error('Error restoring scrape all progress:', error);
    }
  }

  function attachStorageListener() {
    if (storageListenerAttached) return;
    storageListenerAttached = true;
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.scrapeAllProgress) {
        const next = changes.scrapeAllProgress.newValue;
        if (next) {
          progressContainer.classList.remove('hidden');
          progressDetails.classList.remove('hidden');
          scrapeAllBtn.disabled = true;
          clearBtn.disabled = true;
          if (next.status) {
            showStatus(next.status, 'info');
          }
          updateProgress(next.progressCurrent || 0, next.progressTotal || 0);
          updateProgressDetails(next);
          startScrapeAllPolling();
        }
      }
      if (changes.lastScrapeAllSummary && !scrapeAllCompleted) {
        const summary = changes.lastScrapeAllSummary.newValue;
        if (summary) {
          const sources = summary.sourcesProcessed || summary.totalSources || 0;
          const staged = summary.stagedJobs || 0;
          const failed = summary.failedJobs || 0;
          const skipped = summary.skippedDuplicates || 0;
          const droppedShell = summary.notificationShellDropped || 0;
          showStatus(
            `Scrape All завершен. Источников: ${sources}, новых: ${staged}, дублей: ${skipped}, ошибки: ${failed}, отброшено(shell): ${droppedShell}`,
            failed > 0 ? 'error' : 'success'
          );
        }
      }
      if (changes.lRateProgress) {
        const next = changes.lRateProgress.newValue;
        if (next) {
          updateLRateStatusFromProgress(next);
        }
      }
      if (changes.autofill_profiles_v1) {
        const next = changes.autofill_profiles_v1.newValue;
        autofillProfilesState = next && Array.isArray(next.entries) ? next.entries.slice() : [];
        renderAutofillProfiles();
      }
    });
  }

  async function loadLastSummary() {
    try {
      const statusResp = await browser.runtime.sendMessage({ action: 'getScrapeAllStatus' });
      if (statusResp && statusResp.active) {
        return;
      }
      const stored = await browser.storage.local.get('lastScrapeAllSummary');
      const summary = stored.lastScrapeAllSummary;
      if (!summary) return;
      const sources = summary.sourcesProcessed || summary.totalSources || 0;
      const staged = summary.stagedJobs || 0;
      const failed = summary.failedJobs || 0;
      const skipped = summary.skippedDuplicates || 0;
      const droppedShell = summary.notificationShellDropped || 0;
      showStatus(
        `Scrape All завершен. Источников: ${sources}, новых: ${staged}, дублей: ${skipped}, ошибки: ${failed}, отброшено(shell): ${droppedShell}`,
        failed > 0 ? 'error' : 'success'
      );
    } catch (error) {
      console.error('Failed to load last summary:', error);
    }
  }

  async function loadSourcesList() {
    sourcesSection.classList.add('hidden');
    sourcesList.textContent = '';
    sourcesCache = [];
    const expandedStored = await browser.storage.local.get('sourcesExpanded');
    const isExpanded = expandedStored && expandedStored.sourcesExpanded !== undefined
      ? expandedStored.sourcesExpanded === true
      : true;
    sourcesToggleExpand.checked = isExpanded;
    if (isExpanded) {
      sourcesList.classList.remove('hidden');
    } else {
      sourcesList.classList.add('hidden');
    }

    try {
      const response = await browser.runtime.sendMessage({ action: 'getScrapeSources' });
      if (!response || !response.success) {
        showStatus(response?.error || 'Failed to load sources', 'error');
        return;
      }

      const sources = response.sources || [];
      if (sources.length === 0) {
        showStatus('ScrapeList has no sources', 'error');
        return;
      }

      const stored = await browser.storage.local.get('scrapeSourceSelection');
      sourceSelection = stored.scrapeSourceSelection || {};

      if (Object.keys(sourceSelection).length === 0) {
        sources.forEach(source => {
          const sourceKey = source.id || source.name;
          if (sourceKey) {
            sourceSelection[sourceKey] = true;
          }
        });
        await browser.storage.local.set({ scrapeSourceSelection: sourceSelection });
      }

      sourcesCache = sources;
      sourcesSection.classList.remove('hidden');

      sources.forEach((source, index) => {
        const sourceKey = source.id || source.name;
        const label = document.createElement('label');
        label.className = 'source-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        let storedValue = sourceSelection[sourceKey];
        if (storedValue === undefined && source.name) {
          storedValue = sourceSelection[source.name];
        }
        checkbox.checked = storedValue !== false;
        checkbox.dataset.sourceKey = sourceKey;
        checkbox.dataset.sourceName = source.name || sourceKey;
        checkbox.addEventListener('change', handleSourceToggle);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = source.id || source.name || sourceKey;

        label.appendChild(checkbox);
        label.appendChild(nameSpan);
        sourcesList.appendChild(label);
      });

      updateToggleAllState();
      updateToggleAllState();
    } catch (error) {
      console.error('Failed to load sources:', error);
      showStatus(`Failed to load sources: ${error.message}`, 'error');

      // Ensure specific UI elements are visible even on error
      sourcesSection.classList.remove('hidden');
      sourcesList.classList.remove('hidden');
      sourcesList.innerHTML = `
        <div style="padding:10px; text-align:center; color:#721c24;">
            <p>Error loading sources.</p>
            <button id="retrySourcesBtn" class="button secondary inline">Retry</button>
        </div>
      `;
      // We must add listener dynamically since we just created the button
      setTimeout(() => {
        const retryBtn = document.getElementById('retrySourcesBtn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            loadSourcesList(); // Retry on click
          });
        }
      }, 0);
    }
  }

  async function handleSourceToggle(event) {
    const checkbox = event.target;
    const key = checkbox.dataset.sourceKey;
    sourceSelection[key] = checkbox.checked;
    await browser.storage.local.set({ scrapeSourceSelection: sourceSelection });
    updateToggleAllState();
  }

  async function handleToggleAllSources() {
    const checkboxes = sourcesList.querySelectorAll('input[type=\"checkbox\"]');
    const checked = sourcesToggleAll.checked;
    for (let i = 0; i < checkboxes.length; i++) {
      checkboxes[i].checked = checked;
      const key = checkboxes[i].dataset.sourceKey;
      sourceSelection[key] = checked;
    }
    await browser.storage.local.set({ scrapeSourceSelection: sourceSelection });
    updateToggleAllState();
  }

  function handleToggleSourcesExpand() {
    const expanded = sourcesToggleExpand.checked;
    if (expanded) {
      sourcesList.classList.remove('hidden');
    } else {
      sourcesList.classList.add('hidden');
    }
    browser.storage.local.set({ sourcesExpanded: expanded }).catch(() => {});
  }

  function updateToggleAllState() {
    const checkboxes = sourcesList.querySelectorAll('input[type=\"checkbox\"]');
    let checkedCount = 0;
    for (let i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        checkedCount++;
      }
    }
    sourcesToggleAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
    sourcesToggleAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  }

  function getSelectedSourcesCount() {
    const checkboxes = sourcesList.querySelectorAll('input[type=\"checkbox\"]');
    let count = 0;
    for (let i = 0; i < checkboxes.length; i++) {
      if (checkboxes[i].checked) {
        count++;
      }
    }
    return count;
  }
})();
