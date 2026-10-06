
/* --- TBT ENGINE LOGIC --- */
async function runTurnAnalysis() {
  if (state.points.length === 0) return;

  state.isProcessing = true;
  elements.btnProcess.disabled = true;
  elements.processSpinner.classList.add('spinning');
  showToast(t('toastAnalyzing'), 'info', false);

  try {


    state.osmTurns = [];
    state.extraTurns = [];

    const useOsm = elements.enableOsmTbt.checked;
    if (useOsm) {
      const orsKey = elements.orsApiKey.value.trim();
      if (orsKey) {
        showToast(t('toastFetchORS'), 'info', false);
        state.osmTurns = await fetchOrsTurnByTurn(state.points, orsKey);
      } else {
        try {
          state.osmTurns = await fetchOsmTurnByTurn(state.points);
        } catch (e) {
          console.warn('OSRM Match failed, falling back to OSM Overpass Intersection engine...', e);
        }

        // If OSRM returned 0, run our built-in OSM Overpass Intersection Engine!
        if (state.osmTurns.length === 0) {
          showToast(t('toastFetchOverpass'), 'info', false);
          state.osmTurns = await fetchOsmOverpassIntersections(state.points);
        }
      }
    }

    const angleThresh = parseInt(elements.angleThreshold.value, 10);
    const dupDistThresh = parseInt(elements.dupDistanceThreshold.value, 10);
    const smoothingDist = parseInt(elements.smoothingRadius.value, 10);

    state.extraTurns = detectAngleTurns(state.points, state.osmTurns, angleThresh, dupDistThresh, smoothingDist);

    state.climbs = detectClimbs(state.points);
    state.climbTurns = [];
    state.climbs.forEach((c, idx) => {
      state.climbTurns.push({
        id: Math.random().toString(36).substr(2, 9),
        source: 'climb', index: c.startIndex, lat: state.points[c.startIndex].lat, lon: state.points[c.startIndex].lon,
        directionCode: 190, instruction: `Climb ${idx + 1} Start`, distFromStart: state.points[c.startIndex].distFromStart
      });
      state.climbTurns.push({
        id: Math.random().toString(36).substr(2, 9),
        source: 'climb', index: c.endIndex, lat: state.points[c.endIndex].lat, lon: state.points[c.endIndex].lon,
        directionCode: 191, instruction: `Climb ${idx + 1} End`, distFromStart: state.points[c.endIndex].distFromStart
      });
    });

    if (!state.osmTurns.some(item => item.index === 0)) {
      state.osmTurns.push({
        id: Math.random().toString(36).substr(2, 9),
        source: 'osm', index: 0, lat: state.points[0].lat, lon: state.points[0].lon,
        directionCode: 0, instruction: typeof t === 'function' ? t('startRoute') : 'Mulai Rute', distFromStart: 0
      });
    }

    let combined = finalizeInstructions(state.points, state.osmTurns, state.extraTurns, state.manualTurns, state.climbTurns);

    if (elements.enableOsmNames.checked && combined.length > 0) {
      showToast(t('toastFetchOsmNames'), 'info', false);
      combined = await enrichStreetNamesFromOsm(combined);
    }

    state.combinedInstructions = combined;
    updateStatsAndUI();

    elements.btnDownloadBryton.disabled = false;
    elements.btnDownloadKml.disabled = false;
    elements.btnDownloadGpx.disabled = false;
    elements.btnDownloadFit.disabled = false;
    initIcons();
    showToast(t('toastAnalysisDone').replace('{count}', state.combinedInstructions.length), 'success');
  } catch (error) {
    console.error('Analysis failed:', error);
    showToast(t('toastAnalyzeError') + error.message, 'error');
  } finally {
    state.isProcessing = false;
    elements.btnProcess.disabled = false;
    elements.processSpinner.classList.remove('spinning');
  }
}

async function fetchOrsTurnByTurn(points, apiKey) {
  if (points.length < 2) return [];

  const sampled = [points[0]];
  const step = Math.max(1, Math.floor(points.length / 35));
  for (let i = step; i < points.length - 1; i += step) {
    sampled.push(points[i]);
  }
  sampled.push(points[points.length - 1]);

  const coords = sampled.map(p => [p.lon, p.lat]);

  const res = await fetch('https://api.openrouteservice.org/v2/directions/cycling-regular', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey
    },
    body: JSON.stringify({ coordinates: coords, instructions: true })
  });

  if (!res.ok) throw new Error(`ORS API Error ${res.status}`);

  const data = await res.json();
  const turns = [];

  if (data.routes && data.routes[0] && data.routes[0].segments) {
    data.routes[0].segments.forEach(seg => {
      seg.steps.forEach(step => {
        const type = step.type; // 0=left, 1=right, etc.
        const dirCode = mapOrsTypeToDirectionCode(type);
        const loc = step.way_points; // index range
        const approxPt = sampled[Math.min(sampled.length - 1, loc[0])];
        const closestIdx = findClosestPointIndex(points, approxPt.lat, approxPt.lon);

        turns.push({
          source: 'osm',
          index: closestIdx,
          lat: points[closestIdx].lat,
          lon: points[closestIdx].lon,
          directionCode: dirCode,
          instruction: step.instruction || `${getDirectionLabel(dirCode)}: ${step.name || ''}`,
          distFromStart: points[closestIdx].distFromStart
        });
      });
    });
  }

  return turns;
}

async function fetchOsmTurnByTurn(points) {
  if (points.length < 2) return [];

  const chunkSize = 50;
  const sampleStep = Math.max(1, Math.floor(points.length / 100));
  const sampled = [];
  for (let i = 0; i < points.length; i += sampleStep) {
    sampled.push({ point: points[i], origIndex: i });
  }

  const allOsmTurns = [];
  const coordString = sampled.map(s => `${s.point.lon.toFixed(6)},${s.point.lat.toFixed(6)}`).join(';');
  const radiuses = sampled.map(() => '45').join(';');

  const url = `https://router.project-osrm.org/match/v1/driving/${coordString}?overview=simplified&geometries=geojson&steps=true&annotations=false&radiuses=${radiuses}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) return [];

  const json = await response.json();
  if (json.code !== 'Ok' || !json.matchings) return [];

  json.matchings.forEach(matching => {
    matching.legs.forEach(leg => {
      leg.steps.forEach(step => {
        const maneuver = step.maneuver;
        if (!maneuver) return;

        const dirCode = mapOsrmManeuverToDirectionCode(maneuver.type, maneuver.modifier);
        const loc = maneuver.location;
        const matchedIndex = findClosestPointIndex(points, loc[1], loc[0]);
        const matchedPoint = points[matchedIndex];

        let instructionText = step.name ? `Lanjut ke ${step.name}` : getDirectionLabel(dirCode);
        if (maneuver.type === 'turn' || maneuver.type === 'fork') {
          instructionText = `${getDirectionLabel(dirCode)} ${step.name ? 'ke ' + step.name : ''}`.trim();
        }

        allOsmTurns.push({
          source: 'osm',
          index: matchedIndex,
          lat: matchedPoint.lat,
          lon: matchedPoint.lon,
          directionCode: dirCode,
          instruction: instructionText,
          distFromStart: matchedPoint.distFromStart
        });
      });
    });
  });

  return allOsmTurns;
}

async function fetchOsmOverpassIntersections(points) {
  const osmTurns = [];
  if (points.length < 3) return osmTurns;

  // Find candidate turns from significant bends (e.g. angle >= 25)
  const candidateIndices = [];
  for (let i = 2; i < points.length - 2; i += 2) {
    const pPrev = points[i - 2];
    const pCur = points[i];
    const pNext = points[i + 2];

    const b1 = calculateBearing(pPrev.lat, pPrev.lon, pCur.lat, pCur.lon);
    const b2 = calculateBearing(pCur.lat, pCur.lon, pNext.lat, pNext.lon);
    let diff = b2 - b1;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    if (Math.abs(diff) >= 28) {
      candidateIndices.push({ index: i, angleDiff: diff });
    }
  }

  // Query OSM Nominatim/Overpass for turns
  const selected = candidateIndices;

  for (const c of selected) {
    // Tambahkan delay 1 detik agar tidak diblokir server Nominatim
    await new Promise(r => setTimeout(r, 1000));

    const pt = points[c.index];
    const absAngle = Math.abs(c.angleDiff);

    let dirCode = 1;
    if (absAngle >= 135) dirCode = c.angleDiff < 0 ? 7 : 6;
    else if (absAngle >= 55) dirCode = c.angleDiff < 0 ? 3 : 2;
    else dirCode = c.angleDiff < 0 ? 5 : 4;

    let originName = '';
    let destName = '';
    try {
      const originPt = points[Math.max(0, c.index - 3)];
      const destPt = points[Math.min(points.length - 1, c.index + 3)];

      if (originPt) {
        const urlO = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${originPt.lat.toFixed(6)}&lon=${originPt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const resO = await fetch(urlO, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (resO.ok) {
          const dataO = await resO.json();
          if (dataO && dataO.address) originName = dataO.address.road || dataO.address.neighbourhood || '';
        }
      }

      if (destPt) {
        const urlD = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${destPt.lat.toFixed(6)}&lon=${destPt.lon.toFixed(6)}&zoom=18&addressdetails=1`;
        const resD = await fetch(urlD, { headers: { 'Accept-Language': 'id,en' }, signal: AbortSignal.timeout(2000) });
        if (resD.ok) {
          const dataD = await resD.json();
          if (dataD && dataD.address) destName = dataD.address.road || dataD.address.neighbourhood || '';
        }
      }
    } catch (e) {
      // ignore
    }

    let text = getDirectionLabel(dirCode);
    if (destName && destName !== originName) {
      text = `${getDirectionLabel(dirCode)} ke ${destName}`;
    }

    osmTurns.push({
      source: 'osm',
      index: c.index,
      lat: pt.lat,
      lon: pt.lon,
      directionCode: dirCode,
      instruction: text,
      distFromStart: pt.distFromStart
    });
  }

  return osmTurns;
}

function detectAngleTurns(points, existingOsmTurns, angleThreshold, dupDistThreshold, smoothingDist) {
  const extraTurns = [];
  const n = points.length;
  if (n < 3) return extraTurns;

  let lastAddedDist = -9999;

  for (let i = 1; i < n - 1; i++) {
    const curPoint = points[i];

    let prevIdx = i - 1;
    while (prevIdx > 0 && (curPoint.distFromStart - points[prevIdx].distFromStart) < smoothingDist) {
      prevIdx--;
    }

    let nextIdx = i + 1;
    while (nextIdx < n - 1 && (points[nextIdx].distFromStart - curPoint.distFromStart) < smoothingDist) {
      nextIdx++;
    }

    const b1 = calculateBearing(points[prevIdx].lat, points[prevIdx].lon, curPoint.lat, curPoint.lon);
    const b2 = calculateBearing(curPoint.lat, curPoint.lon, points[nextIdx].lat, points[nextIdx].lon);

    let angleDiff = b2 - b1;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    const absAngle = Math.abs(angleDiff);

    if (absAngle >= angleThreshold) {
      let dirCode = 1;
      let label = '';
      if (absAngle >= 135) {
        dirCode = angleDiff < 0 ? 7 : 6;
        label = angleDiff < 0 ? `Belok Tajam Kiri` : `Belok Tajam Kanan`;
      } else if (absAngle >= 55) {
        dirCode = angleDiff < 0 ? 3 : 2;
        label = angleDiff < 0 ? `Belok Kiri` : `Belok Kanan`;
      } else {
        dirCode = angleDiff < 0 ? 5 : 4;
        label = angleDiff < 0 ? `Serong Kiri` : `Serong Kanan`;
      }

      const isAlreadyInOsm = existingOsmTurns.some(osm => {
        const distToOsm = haversineDistance(curPoint.lat, curPoint.lon, osm.lat, osm.lon);
        if (distToOsm <= dupDistThreshold) {
          const isLeft = (c) => [3, 5, 7, 9, 12].includes(c);
          const isRight = (c) => [2, 4, 6, 8, 11].includes(c);
          if ((isLeft(dirCode) && isRight(osm.directionCode)) || (isRight(dirCode) && isLeft(osm.directionCode))) {
            return false;
          }
          return true;
        }
        return false;
      });

      const isAlreadyInExtra = extraTurns.some(extra => {
        const distToExtra = haversineDistance(curPoint.lat, curPoint.lon, extra.lat, extra.lon);
        if (distToExtra <= dupDistThreshold) {
          if ((dirCode < 0 && extra.directionCode > 0) || (dirCode > 0 && extra.directionCode < 0)) {
            return false;
          }
          return true;
        }
        return false;
      });

      if (isAlreadyInOsm || isAlreadyInExtra) {
        continue;
      }

      extraTurns.push({
        source: 'extra',
        index: i,
        lat: curPoint.lat,
        lon: curPoint.lon,
        directionCode: dirCode,
        instruction: label,
        distFromStart: curPoint.distFromStart,
        angle: Math.round(angleDiff)
      });

      lastAddedDist = curPoint.distFromStart;
    }
  }

  return extraTurns;
}

function finalizeInstructions(points, osmTurns, extraTurns, manualTurns = [], climbTurns = []) {
  const all = [...osmTurns, ...extraTurns, ...manualTurns, ...climbTurns];

  all.sort((a, b) => a.index - b.index);

  const deduplicated = [];
  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    if (!cur.id) cur.id = Math.random().toString(36).substr(2, 9);
    
    if (deduplicated.length === 0) {
      deduplicated.push(cur);
    } else {
      const prev = deduplicated[deduplicated.length - 1];
      const dist = cur.distFromStart - prev.distFromStart;
      if (dist >= 12 || cur.source !== 'osm' || cur.instruction !== prev.instruction) {
        deduplicated.push(cur);
      }
    }
  }

  for (let i = 0; i < deduplicated.length; i++) {
    const cur = deduplicated[i];
    if (i < deduplicated.length - 1) {
      const next = deduplicated[i + 1];
      cur.distance = Math.max(0, next.distFromStart - cur.distFromStart);
    } else {
      cur.distance = Math.max(0, state.totalDistance - cur.distFromStart);
    }
    cur.time = Math.round(cur.distance * 0.722);
  }

  return deduplicated;
}

