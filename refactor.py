import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace openAddManualTurnModal
content = re.sub(
    r'function openAddManualTurnModal\(latlng\) \{.*?\n\}',
    '''function openAddManualTurnModal(latlng) {
  state.pendingManualCoord = latlng;
  if (state.manualAddMode === 'turn') {
    document.getElementById('addTurnCoords').textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    document.getElementById('addTurnText').value = '';
    document.getElementById('addTurnDirection').value = '10';
    document.getElementById('modalAddTurn').classList.remove('hidden');
    document.getElementById('modalAddTurn').style.display = 'flex';
  } else {
    document.getElementById('addPoiCoords').textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    document.getElementById('addPoiText').value = '';
    document.getElementById('addPoiDirection').value = '106';
    document.getElementById('modalAddPoi').classList.remove('hidden');
    document.getElementById('modalAddPoi').style.display = 'flex';
  }
}''',
    content, flags=re.DOTALL
)

# Replace closeModal
content = re.sub(
    r'function closeModal\(\) \{.*?\n\}',
    '''function closeAllModals() {
  const modals = ['modalAddTurn', 'modalAddPoi', 'modalEditTurn', 'modalEditPoi', 'modalEditClimb'];
  modals.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('hidden');
      el.style.display = 'none';
    }
  });
  state.pendingManualCoord = null;
  if (state.isAddingManualTurn) {
    toggleAddManualTurnMode(state.manualAddMode);
  }
}
window.closeAllModals = closeAllModals;
function closeModal() { closeAllModals(); }''',
    content, flags=re.DOTALL
)

# Replace confirmAddManualTurn
content = re.sub(
    r'function confirmAddManualTurn\(\) \{.*?\n\}',
    '''function confirmAddManualTurn() {
  if (!state.pendingManualCoord) return;
  const lat = state.pendingManualCoord.lat;
  const lon = state.pendingManualCoord.lng;
  const dirCode = parseInt(document.getElementById('addTurnDirection').value, 10);
  let text = document.getElementById('addTurnText').value.trim() || getDirectionLabel(dirCode);
  _addManualItem(lat, lon, dirCode, text);
}

function confirmAddPoi() {
  if (!state.pendingManualCoord) return;
  const lat = state.pendingManualCoord.lat;
  const lon = state.pendingManualCoord.lng;
  const dirCode = parseInt(document.getElementById('addPoiDirection').value, 10);
  let text = document.getElementById('addPoiText').value.trim();
  if (!text) {
    let poiCount = state.manualTurns.filter(t => t.directionCode >= 100).length;
    text = `POI ${poiCount + 1}`;
  }
  _addManualItem(lat, lon, dirCode, text);
}
window.confirmAddPoi = confirmAddPoi;

function _addManualItem(lat, lon, dirCode, text) {
  const closestIdx = findClosestPointIndex(state.points, lat, lon);
  const pt = state.points[closestIdx];
  state.manualTurns.push({
    id: Math.random().toString(36).substr(2, 9),
    source: 'manual',
    index: closestIdx,
    lat: pt.lat,
    lon: pt.lon,
    directionCode: dirCode,
    instruction: text,
    distFromStart: pt.distFromStart
  });
  closeAllModals();
  renderTurnMarkersOnMap(state.combinedInstructions);
  updateStatsAndUI();
  showToast(t('toastManualTurnAdded').replace('{0}', text), 'success');
}''',
    content, flags=re.DOTALL
)

# Replace btn.addEventListener for edit
content = re.sub(
    r"      \} else if \(type === 'turn'\) \{\n        state\.editingItem = \{ type, idx \};\n        const inst = state\.combinedInstructions\[idx\];\n        document\.getElementById\('modalEditTitle'\)\.innerText = \(inst\.directionCode >= 100\) \? 'Edit POI' : 'Edit Belokan';\n        document\.getElementById\('editTurnDirection'\)\.value = inst\.directionCode;\n        document\.getElementById\('editTurnText'\)\.value = getTranslatedInstruction\(inst\.instruction, inst\.directionCode\);\n        document\.getElementById\('modalEditItem'\)\.classList\.remove\('hidden'\);\n        document\.getElementById\('modalEditItem'\)\.style\.display = 'flex';\n      \}",
    '''      } else if (type === 'turn') {
        state.editingItem = { type, idx };
        const inst = state.combinedInstructions[idx];
        if (inst.directionCode >= 100) {
          document.getElementById('editPoiDirectionOnly').value = inst.directionCode;
          document.getElementById('editPoiTextOnly').value = getTranslatedInstruction(inst.instruction, inst.directionCode);
          document.getElementById('modalEditPoi').classList.remove('hidden');
          document.getElementById('modalEditPoi').style.display = 'flex';
        } else {
          document.getElementById('editTurnDirectionOnly').value = inst.directionCode;
          document.getElementById('editTurnTextOnly').value = getTranslatedInstruction(inst.instruction, inst.directionCode);
          document.getElementById('modalEditTurn').classList.remove('hidden');
          document.getElementById('modalEditTurn').style.display = 'flex';
        }
      }''',
    content, flags=re.DOTALL
)

# Replace btn.addEventListener for edit climb
content = re.sub(
    r"      if \(type === 'climb'\) \{\n        const climb = state\.climbs\[idx\];\n        const currentName = climb\.name \|\| 'Tanjakan ' \+ \(idx \+ 1\);\n        const newName = prompt\(\"Edit Nama Tanjakan:\", currentName\);\n        if \(newName !== null && newName\.trim\(\) !== ''\) \{\n          climb\.name = newName\.trim\(\);\n          renderTurnsTable\(state\.combinedInstructions\);\n        \}\n      \} else if \(type === 'turn'\)",
    '''      if (type === 'climb') {
        state.editingItem = { type, idx };
        const climb = state.climbs[idx];
        const currentName = climb.name || 'Tanjakan ' + (idx + 1);
        document.getElementById('editClimbTextOnly').value = currentName;
        document.getElementById('modalEditClimb').classList.remove('hidden');
        document.getElementById('modalEditClimb').style.display = 'flex';
      } else if (type === 'turn')''',
    content, flags=re.DOTALL
)

# Replace confirmEditItem
content = re.sub(
    r"function confirmEditItem\(\) \{\n  if \(\!state\.editingItem\) return;\n  const \{ type, idx \} = state\.editingItem;.*?\n    renderTurnMarkersOnMap\(state\.combinedInstructions\);\n  \}\n  \n  document\.getElementById\('modalEditItem'\)\.style\.display = 'none';\n  document\.getElementById\('modalEditItem'\)\.classList\.add\('hidden'\);\n  state\.editingItem = null;\n\}",
    '''function confirmEditTurn() {
  if (!state.editingItem) return;
  const { type, idx } = state.editingItem;
  if (type === 'turn') {
    const inst = state.combinedInstructions[idx];
    const newDirCode = parseInt(document.getElementById('editTurnDirectionOnly').value, 10);
    const newText = document.getElementById('editTurnTextOnly').value.trim();
    _applyTurnEdit(inst, newDirCode, newText);
  }
  closeAllModals();
}
window.confirmEditTurn = confirmEditTurn;

function confirmEditPoi() {
  if (!state.editingItem) return;
  const { type, idx } = state.editingItem;
  if (type === 'turn') {
    const inst = state.combinedInstructions[idx];
    const newDirCode = parseInt(document.getElementById('editPoiDirectionOnly').value, 10);
    const newText = document.getElementById('editPoiTextOnly').value.trim();
    _applyTurnEdit(inst, newDirCode, newText);
  }
  closeAllModals();
}
window.confirmEditPoi = confirmEditPoi;

function confirmEditClimb() {
  if (!state.editingItem) return;
  const { type, idx } = state.editingItem;
  if (type === 'climb') {
    const climb = state.climbs[idx];
    const newText = document.getElementById('editClimbTextOnly').value.trim();
    if (newText) {
      climb.name = newText;
      renderTurnsTable(state.combinedInstructions);
    }
  }
  closeAllModals();
}
window.confirmEditClimb = confirmEditClimb;

function _applyTurnEdit(inst, newDirCode, newText) {
  inst.directionCode = newDirCode;
  inst.instruction = newText;
  if (inst.source === 'osm') {
    const match = state.osmTurns.find(t => t.id === inst.id);
    if (match) { match.directionCode = newDirCode; match.instruction = newText; }
  } else if (inst.source === 'extra') {
    const match = state.extraTurns.find(t => t.id === inst.id);
    if (match) { match.directionCode = newDirCode; match.instruction = newText; }
  } else if (inst.source === 'manual') {
    const match = state.manualTurns.find(t => t.id === inst.id);
    if (match) { match.directionCode = newDirCode; match.instruction = newText; }
  }
  renderTurnsTable(state.combinedInstructions);
  renderTurnMarkersOnMap(state.combinedInstructions);
}''',
    content, flags=re.DOTALL
)

content = content.replace("elements.btnConfirmAddTurn.addEventListener('click', confirmAddManualTurn);", "if(elements.btnConfirmAddTurn) elements.btnConfirmAddTurn.addEventListener('click', confirmAddManualTurn);\n  const btnConfirmAddPoi = document.getElementById('btnConfirmAddPoi');\n  if (btnConfirmAddPoi) btnConfirmAddPoi.addEventListener('click', confirmAddPoi);")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)
